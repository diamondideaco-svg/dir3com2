import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { requirePortalActor } from '@/lib/partner-portal/server';
import { ownerFromDomain } from '@/lib/partner-portal/onboarding-policy';
import { readOnboardingStore, writeOnboardingStore } from '@/lib/partner-portal/onboarding-repository';
import { supabaseAdmin } from '@/lib/supabase/server';
import { logServerError, logServerEvent } from '@/lib/security/safe-logger';
import { validateAndNormalizeDocumentFile } from '@/lib/security/document-validation';
import type { PortalAssetMedia, PortalOwnerKind, ReviewQueueItem } from '@/lib/partner-portal/onboarding-types';
import {
  canReadTenantAssociation,
  canReadTenantRecord,
  isPrivilegedPortalActor,
} from '@/lib/partner-portal/tenant-access';

const BUCKET = 'partner-media';

function privateHeaders() {
  return {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  };
}

function asText(value: unknown, max = 180) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function resolveOwner(input: string | null, fallback: PortalOwnerKind): PortalOwnerKind {
  if (input === 'drive_partner' || input === 'stay_supplier') {
    return input;
  }
  return fallback;
}

function buildStoragePath(actorId: string, assetId: string, extension: string) {
  const safeActor = actorId.toLowerCase().replace(/[^a-z0-9-]/g, '');
  const safeAsset = assetId.toLowerCase().replace(/[^a-z0-9-]/g, '');
  return `${safeActor}/${safeAsset}/${crypto.randomUUID()}.${extension}`;
}

function actorStoragePrefix(actorId: string) {
  return `${actorId.toLowerCase().replace(/[^a-z0-9-]/g, '')}/`;
}

function buildQueueItem(input: {
  ownerId?: string;
  ownerKind: PortalOwnerKind;
  assetId: string;
  mediaId: string;
  oldImageUrl: string;
  newImageUrl: string;
  partnerOrSupplier: string;
  technicalValidationStatus: 'pass' | 'fail';
  technicalSummary: string[];
  changedFields: string[];
  status: ReviewQueueItem['status'];
}): ReviewQueueItem {
  return {
    id: crypto.randomUUID(),
    ownerId: input.ownerId,
    ownerKind: input.ownerKind,
    assetId: input.assetId,
    mediaId: input.mediaId,
    oldImageUrl: input.oldImageUrl,
    newImageUrl: input.newImageUrl,
    partnerOrSupplier: input.partnerOrSupplier,
    technicalValidationStatus: input.technicalValidationStatus,
    technicalSummary: input.technicalSummary,
    changedFields: input.changedFields,
    submittedAt: new Date().toISOString(),
    status: input.status,
  };
}

function isBucketMissingError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { message?: unknown; error?: unknown };
  const message = typeof candidate.message === 'string' ? candidate.message : '';
  const nested = typeof candidate.error === 'string' ? candidate.error : '';
  const text = `${message} ${nested}`.toLowerCase();
  return text.includes('bucket') && (text.includes('not found') || text.includes('does not exist'));
}

async function uploadWithBucketRecovery(input: { path: string; bytes: Uint8Array; contentType: string }) {
  if (!supabaseAdmin) {
    return { ok: false as const, code: 'PORTAL_UNAVAILABLE' as const, details: null };
  }

  const first = await supabaseAdmin.storage.from(BUCKET).upload(input.path, input.bytes, {
    contentType: input.contentType,
    upsert: false,
  });

  if (!first.error) {
    return { ok: true as const };
  }

  if (!isBucketMissingError(first.error)) {
    return { ok: false as const, code: 'MEDIA_UPLOAD_FAILED' as const, details: first.error };
  }

  const create = await supabaseAdmin.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'],
  });

  if (create.error && !String(create.error.message || '').toLowerCase().includes('already exists')) {
    return { ok: false as const, code: 'MEDIA_STORAGE_BUCKET_CREATE_FAILED' as const, details: create.error };
  }

  const second = await supabaseAdmin.storage.from(BUCKET).upload(input.path, input.bytes, {
    contentType: input.contentType,
    upsert: false,
  });

  if (second.error) {
    return { ok: false as const, code: 'MEDIA_UPLOAD_FAILED' as const, details: second.error };
  }

  return { ok: true as const };
}

export async function GET(request: Request) {
  const actor = await requirePortalActor();
  if (!actor) {
    return NextResponse.json({ error: { code: 'PORTAL_ACCESS_DENIED' } }, { status: 403, headers: privateHeaders() });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: { code: 'PORTAL_UNAVAILABLE' } }, { status: 503, headers: privateHeaders() });
  }

  const mediaId = asText(new URL(request.url).searchParams.get('mediaId'), 80);
  if (!mediaId) {
    return NextResponse.json({ error: { code: 'MEDIA_ID_REQUIRED' } }, { status: 400, headers: privateHeaders() });
  }

  const store = await readOnboardingStore(actor);
  const media = store.media.find((item) => item.id === mediaId);
  const asset = media ? store.assets.find((item) => item.id === media.assetId) : null;
  if (!media || !asset || media.url.startsWith('/') || /^https?:\/\//i.test(media.url)) {
    return NextResponse.json({ error: { code: 'MEDIA_NOT_FOUND' } }, { status: 404, headers: privateHeaders() });
  }

  const defaultOwner = ownerFromDomain(actor.partnerDomainType);
  const privileged = isPrivilegedPortalActor(actor);
  const ownedStoragePath = media.url.startsWith(actorStoragePrefix(actor.userId));
  if (!privileged && (media.ownerKind !== defaultOwner || asset.ownerKind !== defaultOwner || !canReadTenantAssociation(actor, asset, media) || !ownedStoragePath)) {
    return NextResponse.json({ error: { code: 'MEDIA_ACCESS_DENIED' } }, { status: 403, headers: privateHeaders() });
  }

  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(media.url, 300);
  if (error || !data?.signedUrl) {
    logServerError('api.partner_portal.assets.media_preview_failed', error, {
      route: '/api/partner-portal/assets/media',
      actorId: actor.userId,
      mediaId,
    });
    return NextResponse.json({ error: { code: 'MEDIA_PREVIEW_FAILED' } }, { status: 500, headers: privateHeaders() });
  }

  return new NextResponse(null, {
    status: 307,
    headers: {
      ...privateHeaders(),
      Location: data.signedUrl,
    },
  });
}

export async function PATCH(request: Request) {
  const actor = await requirePortalActor();
  if (!actor) {
    return NextResponse.json({ error: { code: 'PORTAL_ACCESS_DENIED' } }, { status: 403, headers: privateHeaders() });
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const assetId = asText(payload.assetId, 80);
  const orderedMediaIds = Array.isArray(payload.orderedMediaIds)
    ? payload.orderedMediaIds.map((entry) => asText(entry, 80)).filter(Boolean)
    : [];

  if (!assetId || orderedMediaIds.length === 0) {
    return NextResponse.json({ error: { code: 'MEDIA_REORDER_INPUT_INVALID' } }, { status: 400, headers: privateHeaders() });
  }

  const defaultOwner = ownerFromDomain(actor.partnerDomainType);
  const store = await readOnboardingStore(actor);
  const targetAsset = store.assets.find((asset) => asset.id === assetId);

  if (!targetAsset) {
    return NextResponse.json({ error: { code: 'ASSET_NOT_FOUND' } }, { status: 404, headers: privateHeaders() });
  }

  if (!isPrivilegedPortalActor(actor) && (targetAsset.ownerKind !== defaultOwner || !canReadTenantRecord(actor, targetAsset))) {
    return NextResponse.json({ error: { code: 'ASSET_SCOPE_DENIED' } }, { status: 403, headers: privateHeaders() });
  }

  const scoped = store.media.filter(
    (item) => item.assetId === assetId && canReadTenantAssociation(actor, targetAsset, item),
  );
  const idSet = new Set(scoped.map((item) => item.id));

  if (orderedMediaIds.some((id) => !idSet.has(id))) {
    return NextResponse.json({ error: { code: 'MEDIA_REORDER_SCOPE_INVALID' } }, { status: 400, headers: privateHeaders() });
  }

  for (let index = 0; index < orderedMediaIds.length; index += 1) {
    const media = store.media.find((item) => item.id === orderedMediaIds[index]);
    if (media) {
      media.sortOrder = index;
      media.updatedAt = new Date().toISOString();
    }
  }

  await writeOnboardingStore({ media: store.media.filter((item) => orderedMediaIds.includes(item.id)) }, actor);

  return NextResponse.json(
    {
      data: store.media
        .filter((item) => item.assetId === assetId && canReadTenantAssociation(actor, targetAsset, item))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    },
    { headers: privateHeaders() },
  );
}

export async function POST(request: Request) {
  const actor = await requirePortalActor();
  if (!actor) {
    return NextResponse.json({ error: { code: 'PORTAL_ACCESS_DENIED' } }, { status: 403, headers: privateHeaders() });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: { code: 'PORTAL_UNAVAILABLE' } }, { status: 503, headers: privateHeaders() });
  }

  const defaultOwner = ownerFromDomain(actor.partnerDomainType);

  const formData = (await request.formData()) as unknown as {
    get(name: string): FormDataEntryValue | null;
  };

  const assetId = asText(formData.get('assetId'), 80);
  const replaceMediaId = asText(formData.get('replaceMediaId'), 80);
  const label = asText(formData.get('label'), 180) || 'Provider upload';
  const requestedOwner = resolveOwner(asText(formData.get('ownerKind'), 40), defaultOwner);

  if (!assetId) {
    return NextResponse.json({ error: { code: 'ASSET_ID_REQUIRED' } }, { status: 400, headers: privateHeaders() });
  }

  if (requestedOwner !== defaultOwner && !isPrivilegedPortalActor(actor)) {
    return NextResponse.json({ error: { code: 'PORTAL_OWNER_SCOPE_DENIED' } }, { status: 403, headers: privateHeaders() });
  }

  const store = await readOnboardingStore(actor);
  const asset = store.assets.find((entry) => entry.id === assetId);
  if (!asset) {
    return NextResponse.json({ error: { code: 'ASSET_NOT_FOUND' } }, { status: 404, headers: privateHeaders() });
  }

  if (asset.ownerKind !== requestedOwner) {
    return NextResponse.json({ error: { code: 'ASSET_ASSOCIATION_INVALID' } }, { status: 400, headers: privateHeaders() });
  }

  if (!canReadTenantRecord(actor, asset)) {
    return NextResponse.json({ error: { code: 'ASSET_SCOPE_DENIED' } }, { status: 403, headers: privateHeaders() });
  }

  if (replaceMediaId) {
    const replacement = store.media.find((item) => item.id === replaceMediaId);
    if (!replacement || replacement.assetId !== asset.id || !canReadTenantAssociation(actor, asset, replacement)) {
      return NextResponse.json({ error: { code: 'MEDIA_REPLACEMENT_SCOPE_DENIED' } }, { status: 403, headers: privateHeaders() });
    }
  }

  const file = formData.get('file');
  const validation = await validateAndNormalizeDocumentFile(file);

  if (!validation.ok) {
    const failedMediaId = crypto.randomUUID();
    const queueItem = buildQueueItem({
      ownerId: asset.ownerId,
      ownerKind: requestedOwner,
      assetId,
      mediaId: failedMediaId,
      oldImageUrl: '',
      newImageUrl: '',
      partnerOrSupplier: asset.ownerLabel,
      technicalValidationStatus: 'fail',
      technicalSummary: [validation.message],
      changedFields: ['image_file'],
      status: 'needs_supplier_action',
    });

    store.reviewQueue.unshift(queueItem);
    await writeOnboardingStore({ reviewQueue: [queueItem] }, actor);

    return NextResponse.json(
      {
        data: {
          status: 'needs_supplier_action',
          technicalValidation: {
            supportedFileType: false,
            fileSize: false,
            minDimensions: 'not_available',
            corruptFile: true,
            duplicateImage: false,
            basicImageQuality: 'not_available',
            correctAssociation: true,
            malwareSafeControls: true,
            metadataStripped: 'not_available',
            messages: [validation.message],
          },
        },
      },
      { status: 400, headers: privateHeaders() },
    );
  }

  const hash = crypto.createHash('sha256').update(validation.data.bytes).digest('hex');
  const duplicateImage = store.media.some((item) => item.hash === hash && item.assetId === assetId);

  if (duplicateImage) {
    const failedMediaId = crypto.randomUUID();
    const queueItem = buildQueueItem({
      ownerId: asset.ownerId,
      ownerKind: requestedOwner,
      assetId,
      mediaId: failedMediaId,
      oldImageUrl: '',
      newImageUrl: '',
      partnerOrSupplier: asset.ownerLabel,
      technicalValidationStatus: 'fail',
      technicalSummary: ['Duplicate image detected for this asset'],
      changedFields: ['image_file'],
      status: 'needs_supplier_action',
    });

    store.reviewQueue.unshift(queueItem);
    await writeOnboardingStore({ reviewQueue: [queueItem] }, actor);

    return NextResponse.json(
      {
        data: {
          status: 'needs_supplier_action',
          technicalValidation: {
            supportedFileType: true,
            fileSize: true,
            minDimensions: 'not_available',
            corruptFile: false,
            duplicateImage: true,
            basicImageQuality: 'not_available',
            correctAssociation: true,
            malwareSafeControls: true,
            metadataStripped: 'not_available',
            messages: ['Duplicate image detected for this asset'],
          },
        },
      },
      { status: 400, headers: privateHeaders() },
    );
  }

  const storagePath = buildStoragePath(actor.userId, assetId, validation.data.signature.extension);
  const upload = await uploadWithBucketRecovery({
    path: storagePath,
    bytes: validation.data.bytes,
    contentType: validation.data.signature.mimeType,
  });

  if (!upload.ok) {
    logServerError('api.partner_portal.assets.media_upload_failed', upload.details, {
      route: '/api/partner-portal/assets/media',
      actorId: actor.userId,
      ownerKind: requestedOwner,
      assetId,
      code: upload.code,
    });
    return NextResponse.json({ error: { code: upload.code } }, { status: 500, headers: privateHeaders() });
  }

  const currentMedia = store.media.filter((item) => item.assetId === assetId);
  const sortOrder = currentMedia.length;

  const technicalValidation: PortalAssetMedia['technicalValidation'] = {
    supportedFileType: true,
    fileSize: true,
    minDimensions: 'not_available',
    corruptFile: false,
    duplicateImage: false,
    basicImageQuality: 'not_available',
    correctAssociation: true,
    malwareSafeControls: true,
    metadataStripped: 'not_available',
    messages: ['Technical checks passed where available. Routed to pending review.'],
  };

  const newMedia: PortalAssetMedia = {
    id: crypto.randomUUID(),
    ownerId: asset.ownerId,
    assetId,
    ownerKind: requestedOwner,
    label,
    url: storagePath,
    origin: 'provider_upload',
    mimeType: validation.data.signature.mimeType,
    sizeBytes: validation.data.bytes.length,
    hash,
    sortOrder,
    status: 'pending_review',
    technicalValidation,
    submittedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  store.media.push(newMedia);

  if (replaceMediaId) {
    const replaced = store.media.find((item) => item.id === replaceMediaId);
    if (replaced) {
      replaced.status = 'archived';
      replaced.updatedAt = new Date().toISOString();
    }
  }

  const queueItem = buildQueueItem({
    ownerId: asset.ownerId,
    ownerKind: requestedOwner,
    assetId,
    mediaId: newMedia.id,
    oldImageUrl: replaceMediaId ? (store.media.find((item) => item.id === replaceMediaId)?.url || '') : '',
    newImageUrl: newMedia.url,
    partnerOrSupplier: asset.ownerLabel,
    technicalValidationStatus: 'pass',
    technicalSummary: technicalValidation.messages,
    changedFields: replaceMediaId ? ['image_file', 'image_replacement', 'media_label'] : ['image_file', 'media_label'],
    status: 'pending_review',
  });

  store.reviewQueue.unshift(queueItem);
  await writeOnboardingStore({
    media: [newMedia, ...(replaceMediaId ? store.media.filter((item) => item.id === replaceMediaId) : [])],
    reviewQueue: [queueItem],
  }, actor);

  logServerEvent('api.partner_portal.assets.media_uploaded', {
    route: '/api/partner-portal/assets/media',
    actorId: actor.userId,
    ownerKind: requestedOwner,
    assetId,
    mediaId: newMedia.id,
  });

  return NextResponse.json(
    {
      data: {
        media: newMedia,
        queue: queueItem,
      },
    },
    { status: 201, headers: privateHeaders() },
  );
}
