import { NextResponse } from 'next/server';
import { requirePortalActor } from '@/lib/partner-portal/server';
import { readOnboardingStore, writeOnboardingStore } from '@/lib/partner-portal/onboarding-repository';
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

  const asset = associatedAsset;
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

  await writeOnboardingStore({
    assets: asset ? [asset] : [],
    media: media ? [media] : [],
    reviewQueue: [queueItem],
  }, actor);

  return NextResponse.json({ data: queueItem }, { headers: privateHeaders() });
}
