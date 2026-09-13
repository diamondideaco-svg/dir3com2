import { NextResponse } from 'next/server';
import { requirePortalActor } from '@/lib/partner-portal/server';
import { readOnboardingStore } from '@/lib/partner-portal/onboarding-repository';
import { supabaseAdmin } from '@/lib/supabase/server';
import type { ReviewAction } from '@/lib/partner-portal/onboarding-types';
import { hasValidTenantAssociation, isPrivilegedPortalActor } from '@/lib/partner-portal/tenant-access';

function privateHeaders() {
  return {
    'Cache-Control': 'private, no-store',
  };
}

function asText(value: unknown, max = 220) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function normalizeAction(value: unknown): ReviewAction | null {
  const normalized = asText(value, 40).toUpperCase();
  if (normalized === 'APPROVE' || normalized === 'REJECT' || normalized === 'REQUEST_REPLACEMENT') {
    return normalized;
  }

  return null;
}

export async function GET() {
  const actor = await requirePortalActor();
  if (!actor) {
    return NextResponse.json({ error: { code: 'PORTAL_ACCESS_DENIED' } }, { status: 403, headers: privateHeaders() });
  }

  const store = await readOnboardingStore(actor);

  if (isPrivilegedPortalActor(actor)) {
    return NextResponse.json({ data: store.reviewQueue }, { headers: privateHeaders() });
  }

  return NextResponse.json({ error: { code: 'PORTAL_REVIEW_ACCESS_DENIED' } }, { status: 403, headers: privateHeaders() });
}

export async function POST(request: Request) {
  const actor = await requirePortalActor();
  if (!actor || !isPrivilegedPortalActor(actor)) {
    return NextResponse.json({ error: { code: 'PORTAL_REVIEW_ACCESS_DENIED' } }, { status: 403, headers: privateHeaders() });
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const queueId = asText(payload.queueId, 80);
  const action = normalizeAction(payload.action);
  const reason = asText(payload.reason, 350);

  if (!queueId || !action) {
    return NextResponse.json({ error: { code: 'REVIEW_ACTION_INVALID' } }, { status: 400, headers: privateHeaders() });
  }

  const store = await readOnboardingStore(actor);
  const queueItem = store.reviewQueue.find((item) => item.id === queueId);
  if (!queueItem) {
    return NextResponse.json({ error: { code: 'REVIEW_ITEM_NOT_FOUND' } }, { status: 404, headers: privateHeaders() });
  }

  const media = queueItem.mediaId === 'catalog-update' ? null : store.media.find((item) => item.id === queueItem.mediaId);
  if (queueItem.mediaId !== 'catalog-update' && !media) {
    return NextResponse.json({ error: { code: 'REVIEW_MEDIA_NOT_FOUND' } }, { status: 404, headers: privateHeaders() });
  }

  const associatedAsset = store.assets.find((entry) => entry.id === queueItem.assetId);
  if (
    !associatedAsset
    || !hasValidTenantAssociation(queueItem, associatedAsset)
    || (media && (media.assetId !== associatedAsset.id || !hasValidTenantAssociation(queueItem, associatedAsset, media)))
  ) {
    return NextResponse.json({ error: { code: 'REVIEW_ASSOCIATION_INVALID' } }, { status: 409, headers: privateHeaders() });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: { code: 'REVIEW_UNAVAILABLE' } }, { status: 503, headers: privateHeaders() });
  }
  const { data, error } = await supabaseAdmin.rpc('review_partner_portal_media', {
    p_queue_id: queueId, p_action: action, p_actor_id: actor.userId, p_reason: reason,
  });
  if (error) {
    const conflicts = ['REVIEW_ITEM_NOT_PENDING', 'REVIEW_ASSOCIATION_INVALID'];
    const code = conflicts.includes(error.message) ? error.message : 'REVIEW_UNAVAILABLE';
    return NextResponse.json({ error: { code } }, { status: conflicts.includes(code) ? 409 : 503, headers: privateHeaders() });
  }
  return NextResponse.json({ data }, { headers: privateHeaders() });
}
