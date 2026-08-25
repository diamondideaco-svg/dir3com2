import { NextResponse } from 'next/server';
import { requirePortalActor } from '@/lib/partner-portal/server';
import {
  ownerFromDomain,
  readOnboardingStore,
  transitionProductStatus,
  writeOnboardingStore,
} from '@/lib/partner-portal/onboarding-store';
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

  const store = await readOnboardingStore();
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

  const store = await readOnboardingStore();
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

  await writeOnboardingStore(store);

  return NextResponse.json({ data: updated }, { headers: privateHeaders() });
}
