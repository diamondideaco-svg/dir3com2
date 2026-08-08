import { NextResponse } from 'next/server';
import { requirePortalActor } from '@/lib/partner-portal/server';
import { ownerFromDomain, readOnboardingStore, writeOnboardingStore } from '@/lib/partner-portal/onboarding-store';
import type { ReviewAction } from '@/lib/partner-portal/onboarding-types';

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

function resolveOwnerKind(input: string | null, fallback: 'drive_partner' | 'stay_supplier') {
  if (input === 'drive_partner' || input === 'stay_supplier') {
    return input;
  }
  return fallback;
}

export async function GET(request: Request) {
  const actor = await requirePortalActor();
  if (!actor) {
    return NextResponse.json({ error: { code: 'PORTAL_ACCESS_DENIED' } }, { status: 403, headers: privateHeaders() });
  }

  const store = await readOnboardingStore();

  if (['admin', 'staff'].includes(actor.authRole)) {
    return NextResponse.json({ data: store.reviewQueue }, { headers: privateHeaders() });
  }

  const defaultOwner = ownerFromDomain(actor.partnerDomainType);
  const { searchParams } = new URL(request.url);
  const owner = resolveOwnerKind(searchParams.get('ownerKind'), defaultOwner);

  if (owner !== defaultOwner) {
    return NextResponse.json({ error: { code: 'REVIEW_SCOPE_DENIED' } }, { status: 403, headers: privateHeaders() });
  }

  const scoped = store.reviewQueue.filter((item) => item.ownerKind === owner);
  return NextResponse.json({ data: scoped }, { headers: privateHeaders() });
}

export async function POST(request: Request) {
  const actor = await requirePortalActor();
  if (!actor || !['admin', 'staff'].includes(actor.authRole)) {
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

  const store = await readOnboardingStore();
  const queueItem = store.reviewQueue.find((item) => item.id === queueId);
  if (!queueItem) {
    return NextResponse.json({ error: { code: 'REVIEW_ITEM_NOT_FOUND' } }, { status: 404, headers: privateHeaders() });
  }

  const media = queueItem.mediaId === 'catalog-update' ? null : store.media.find((item) => item.id === queueItem.mediaId);
  if (queueItem.mediaId !== 'catalog-update' && !media) {
    return NextResponse.json({ error: { code: 'REVIEW_MEDIA_NOT_FOUND' } }, { status: 404, headers: privateHeaders() });
  }

  const now = new Date().toISOString();

  if (action === 'APPROVE') {
    if (media) {
      media.status = 'published';
    }
    queueItem.status = 'approved';
  }

  if (action === 'REJECT') {
    if (media) {
      media.status = 'rejected';
    }
    queueItem.status = 'rejected';
  }

  if (action === 'REQUEST_REPLACEMENT') {
    if (media) {
      media.status = 'needs_supplier_action';
    }
    queueItem.status = 'needs_supplier_action';
  }

  queueItem.actionBy = actor.userId;
  queueItem.actionAt = now;
  queueItem.actionReason = reason || undefined;
  if (media) {
    media.updatedAt = now;
  }

  const asset = store.assets.find((entry) => entry.id === queueItem.assetId);
  if (asset && action === 'APPROVE') {
    asset.verificationStatus = 'Approved';
    asset.dataStatus = 'published';
    asset.updatedAt = now;
  }

  if (asset && action !== 'APPROVE') {
    asset.verificationStatus = action === 'REJECT' ? 'Needs better photo' : 'Needs your confirmation';
    asset.dataStatus = 'needs_confirmation';
    asset.updatedAt = now;
  }

  await writeOnboardingStore(store);

  return NextResponse.json({ data: queueItem }, { headers: privateHeaders() });
}
