import { NextResponse } from 'next/server';
import { requirePortalActor } from '@/lib/partner-portal/server';
import { ownerFromDomain, transitionProductStatus } from '@/lib/partner-portal/onboarding-policy';
import { readOnboardingStore, writeOnboardingStore } from '@/lib/partner-portal/onboarding-repository';
import type { PortalAssetRecord, PortalOwnerKind } from '@/lib/partner-portal/onboarding-types';
import { canReadTenantAssociation, canReadTenantRecord, isPrivilegedPortalActor } from '@/lib/partner-portal/tenant-access';

function privateHeaders() {
  return {
    'Cache-Control': 'private, no-store',
  };
}

function asText(value: unknown, max = 250) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function asTextList(value: unknown, max = 20) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asText(entry, 80))
    .filter(Boolean)
    .slice(0, max);
}

function resolveOwnerKind(input: string | null, fallback: PortalOwnerKind): PortalOwnerKind {
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

  const defaultOwner = ownerFromDomain(actor.partnerDomainType);
  const { searchParams } = new URL(request.url);
  const requestedOwner = resolveOwnerKind(searchParams.get('ownerKind'), defaultOwner);

  if (requestedOwner !== defaultOwner && !isPrivilegedPortalActor(actor)) {
    return NextResponse.json({ error: { code: 'ASSET_SCOPE_DENIED' } }, { status: 403, headers: privateHeaders() });
  }

  const store = await readOnboardingStore(actor);
  const assets = store.assets.filter(
    (asset) => asset.ownerKind === requestedOwner && canReadTenantRecord(actor, asset),
  );
  const media = store.media
    .filter((item) => {
      const asset = assets.find((candidate) => candidate.id === item.assetId);
      return item.ownerKind === requestedOwner && Boolean(asset) && canReadTenantAssociation(actor, asset!, item);
    })
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const contracts = store.contracts.filter(
    (contract) => contract.ownerKind === requestedOwner && canReadTenantRecord(actor, contract),
  );

  return NextResponse.json(
    {
      data: {
        ownerKind: requestedOwner,
        assets,
        media,
        contracts,
      },
    },
    { headers: privateHeaders() },
  );
}

export async function POST(request: Request) {
  const actor = await requirePortalActor();
  if (!actor) return NextResponse.json({ error: { code: 'PORTAL_ACCESS_DENIED' } }, { status: 403, headers: privateHeaders() });

  let payload: Record<string, unknown> = {};
  try { payload = (await request.json()) as Record<string, unknown>; } catch { payload = {}; }

  const ownerKind = ownerFromDomain(actor.partnerDomainType);
  const now = new Date().toISOString();
  const asset: PortalAssetRecord = {
    id: crypto.randomUUID(),
    ownerId: actor.userId,
    ownerKind,
    ownerLabel: actor.fullName,
    assetType: ownerKind === 'drive_partner' ? 'vehicle' : 'apartment_unit',
    title: asText(payload.title, 180) || (ownerKind === 'drive_partner' ? 'New vehicle' : 'New property'),
    location: '', make: '', model: '', vehicleCategory: ownerKind === 'drive_partner' ? 'drive' : 'stay',
    plateNumber: '', capacity: '', amenities: [], pricing: '', availability: '', cancellationPolicy: '',
    accessRules: '', optionalVideoUrl: '', futureVideoUploadEnabled: true,
    verificationStatus: 'Needs your confirmation', dataStatus: 'needs_confirmation',
    visualConfidence: 'needs_supplier_confirmation', needsConfirmationFields: ['title', 'location', 'pricing', 'availability'],
    submittedAt: now, updatedAt: now,
  };

  try {
    const store = await readOnboardingStore(actor);
    store.assets.push(asset);
    await writeOnboardingStore({ assets: [asset] }, actor);
    return NextResponse.json({ data: asset }, { status: 201, headers: privateHeaders() });
  } catch {
    return NextResponse.json({ error: { code: 'PORTAL_ASSET_CREATE_FAILED' } }, { status: 500, headers: privateHeaders() });
  }
}

export async function PUT(request: Request) {
  const actor = await requirePortalActor();
  if (!actor) {
    return NextResponse.json({ error: { code: 'PORTAL_ACCESS_DENIED' } }, { status: 403, headers: privateHeaders() });
  }

  const defaultOwner = ownerFromDomain(actor.partnerDomainType);

  let payload: Record<string, unknown> = {};
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const assetId = asText(payload.assetId, 80);
  const submit = payload.submit === true;

  if (!assetId) {
    return NextResponse.json({ error: { code: 'ASSET_ID_REQUIRED' } }, { status: 400, headers: privateHeaders() });
  }

  const store = await readOnboardingStore(actor);
  const assetIndex = store.assets.findIndex((asset) => asset.id === assetId);
  if (assetIndex === -1) {
    return NextResponse.json({ error: { code: 'ASSET_NOT_FOUND' } }, { status: 404, headers: privateHeaders() });
  }

  const asset = store.assets[assetIndex];
  if (!isPrivilegedPortalActor(actor) && (asset.ownerKind !== defaultOwner || !canReadTenantRecord(actor, asset))) {
    return NextResponse.json({ error: { code: 'ASSET_SCOPE_DENIED' } }, { status: 403, headers: privateHeaders() });
  }

  const needsConfirmationFields = asTextList(payload.needsConfirmationFields);

  const updated: PortalAssetRecord = {
    ...asset,
    title: asText(payload.title, 180) || asset.title,
    location: asText(payload.location, 120) || asset.location,
    make: asText(payload.make, 120) || asset.make,
    model: asText(payload.model, 120) || asset.model,
    vehicleCategory: asText(payload.vehicleCategory, 120) || asset.vehicleCategory,
    plateNumber: asText(payload.plateNumber, 60) || asset.plateNumber,
    capacity: asText(payload.capacity, 120) || asset.capacity,
    amenities: asTextList(payload.amenities, 30),
    pricing: asText(payload.pricing, 200) || asset.pricing,
    availability: asText(payload.availability, 120) || asset.availability,
    cancellationPolicy: asText(payload.cancellationPolicy, 400) || asset.cancellationPolicy,
    accessRules: asText(payload.accessRules, 400) || asset.accessRules,
    optionalVideoUrl: asText(payload.optionalVideoUrl, 500),
    verificationStatus: asText(payload.verificationStatus, 120) || asset.verificationStatus,
    needsConfirmationFields,
    dataStatus: transitionProductStatus({
      current: asset.dataStatus,
      submit,
      validationFailed: false,
    }),
    visualConfidence: needsConfirmationFields.length > 0 ? 'needs_supplier_confirmation' : 'verified',
    updatedAt: new Date().toISOString(),
  };

  const changedFields: string[] = [];
  const compareKeys: Array<keyof PortalAssetRecord> = [
    'title',
    'location',
    'make',
    'model',
    'plateNumber',
    'pricing',
    'availability',
    'optionalVideoUrl',
    'verificationStatus',
    'amenities',
    'needsConfirmationFields',
  ];

  for (const key of compareKeys) {
    const before = JSON.stringify(asset[key]);
    const after = JSON.stringify(updated[key]);
    if (before !== after) {
      changedFields.push(String(key));
    }
  }

  store.assets[assetIndex] = updated;

  if (submit) {
    store.reviewQueue.unshift({
      id: crypto.randomUUID(),
      ownerId: updated.ownerId,
      ownerKind: updated.ownerKind,
      assetId: updated.id,
      mediaId: 'catalog-update',
      oldImageUrl: '',
      newImageUrl: '',
      partnerOrSupplier: updated.ownerLabel,
      technicalValidationStatus: 'pass',
      technicalSummary: ['Catalog field update submitted for review'],
      changedFields: changedFields.length > 0 ? changedFields : ['catalog_fields'],
      submittedAt: new Date().toISOString(),
      status: 'pending_review',
    });
  }

  await writeOnboardingStore({ assets: [updated], reviewQueue: submit ? [store.reviewQueue[0]] : [] }, actor);

  return NextResponse.json({ data: updated }, { headers: privateHeaders() });
}
