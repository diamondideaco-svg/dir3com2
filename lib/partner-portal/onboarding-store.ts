import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import type {
  ContractAssociation,
  PortalAssetMedia,
  PortalAssetRecord,
  PortalOnboardingStore,
  PortalOwnerKind,
  ProductWorkflowStatus,
} from '@/lib/partner-portal/onboarding-types';

const STORE_FILE = path.join(os.tmpdir(), 'dir3com', 'portal-onboarding-store.json');
let memoryStore: PortalOnboardingStore | null = null;

const nowIso = () => new Date().toISOString();

function seedAssets(): PortalAssetRecord[] {
  const now = nowIso();
  return [
    {
      id: 'asset-drive-abu-vehicle-01',
      ownerKind: 'drive_partner',
      ownerLabel: 'Abu Al Anaq / Abu Al Ana',
      assetType: 'vehicle',
      title: 'Vehicle 01 - Needs confirmation',
      location: 'needs_supplier_confirmation',
      make: 'needs_supplier_confirmation',
      model: 'needs_supplier_confirmation',
      vehicleCategory: 'drive',
      plateNumber: 'needs_supplier_confirmation',
      capacity: 'needs_supplier_confirmation',
      amenities: [],
      pricing: 'needs_supplier_confirmation',
      availability: 'needs_supplier_confirmation',
      cancellationPolicy: 'needs_supplier_confirmation',
      accessRules: 'needs_supplier_confirmation',
      optionalVideoUrl: '',
      futureVideoUploadEnabled: true,
      verificationStatus: 'Needs your confirmation',
      dataStatus: 'needs_confirmation',
      visualConfidence: 'needs_supplier_confirmation',
      needsConfirmationFields: ['make', 'model', 'plateNumber', 'capacity', 'pricing', 'availability'],
      submittedAt: now,
      updatedAt: now,
    },
    {
      id: 'asset-stay-hani-unit-01',
      ownerKind: 'stay_supplier',
      ownerLabel: 'Mohammed Hani',
      assetType: 'apartment_unit',
      title: 'Apartment Unit 01 - Needs confirmation',
      location: 'needs_supplier_confirmation',
      make: '',
      model: '',
      vehicleCategory: '',
      plateNumber: '',
      capacity: 'needs_supplier_confirmation',
      amenities: [],
      pricing: 'needs_supplier_confirmation',
      availability: 'needs_supplier_confirmation',
      cancellationPolicy: 'needs_supplier_confirmation',
      accessRules: 'needs_supplier_confirmation',
      optionalVideoUrl: '',
      futureVideoUploadEnabled: true,
      verificationStatus: 'Needs your confirmation',
      dataStatus: 'needs_confirmation',
      visualConfidence: 'needs_supplier_confirmation',
      needsConfirmationFields: ['title', 'location', 'capacity', 'amenities', 'pricing', 'availability'],
      submittedAt: now,
      updatedAt: now,
    },
  ];
}

function seedMedia(): PortalAssetMedia[] {
  const now = nowIso();
  const hashA = crypto.createHash('sha256').update('provisional-car-desktop').digest('hex');
  const hashB = crypto.createHash('sha256').update('provisional-car-mobile').digest('hex');

  return [
    {
      id: 'media-drive-abu-01',
      assetId: 'asset-drive-abu-vehicle-01',
      ownerKind: 'drive_partner',
      label: 'WhatsApp Screenshot Seed - Desktop',
      url: '/provisional-seed/public__cars__desktop.png',
      origin: 'whatsapp_screenshot',
      mimeType: 'image/png',
      sizeBytes: 0,
      hash: hashA,
      sortOrder: 0,
      status: 'provisional_seed',
      technicalValidation: {
        supportedFileType: true,
        fileSize: true,
        minDimensions: 'not_available',
        corruptFile: false,
        duplicateImage: false,
        basicImageQuality: 'not_available',
        correctAssociation: true,
        malwareSafeControls: true,
        metadataStripped: 'not_available',
        messages: ['Provisional seed from authorized screenshot source'],
      },
      submittedAt: now,
      updatedAt: now,
    },
    {
      id: 'media-drive-abu-02',
      assetId: 'asset-drive-abu-vehicle-01',
      ownerKind: 'drive_partner',
      label: 'WhatsApp Screenshot Seed - Mobile',
      url: '/provisional-seed/public__cars__mobile.png',
      origin: 'whatsapp_screenshot',
      mimeType: 'image/png',
      sizeBytes: 0,
      hash: hashB,
      sortOrder: 1,
      status: 'provisional_seed',
      technicalValidation: {
        supportedFileType: true,
        fileSize: true,
        minDimensions: 'not_available',
        corruptFile: false,
        duplicateImage: false,
        basicImageQuality: 'not_available',
        correctAssociation: true,
        malwareSafeControls: true,
        metadataStripped: 'not_available',
        messages: ['Provisional seed from authorized screenshot source'],
      },
      submittedAt: now,
      updatedAt: now,
    },
    {
      id: 'media-stay-hani-01',
      assetId: 'asset-stay-hani-unit-01',
      ownerKind: 'stay_supplier',
      label: 'Initial stay reference - needs replacement',
      url: '/icons/stay.svg',
      origin: 'library',
      mimeType: 'image/svg+xml',
      sizeBytes: 0,
      hash: crypto.createHash('sha256').update('provisional-stay-icon').digest('hex'),
      sortOrder: 0,
      status: 'provisional_seed',
      technicalValidation: {
        supportedFileType: true,
        fileSize: true,
        minDimensions: 'not_available',
        corruptFile: false,
        duplicateImage: false,
        basicImageQuality: 'not_available',
        correctAssociation: true,
        malwareSafeControls: true,
        metadataStripped: 'not_available',
        messages: ['Temporary reference media. Supplier replacement required.'],
      },
      submittedAt: now,
      updatedAt: now,
    },
  ];
}

function seedContracts(): ContractAssociation[] {
  return [
    {
      id: 'contract-link-abu-drive-01',
      ownerKind: 'drive_partner',
      ownerLabel: 'Abu Al Anaq / Abu Al Ana',
      contractRef: 'existing_drive_agreement_draft',
      contractStatus: 'draft',
      notes: 'Associated to Drive Partner profile. Not marked signed.',
    },
    {
      id: 'contract-link-hani-stay-01',
      ownerKind: 'stay_supplier',
      ownerLabel: 'Mohammed Hani',
      contractRef: 'existing_stay_agreement_draft',
      contractStatus: 'draft',
      notes: 'Associated to Stay Supplier profile. Not marked signed.',
    },
  ];
}

function createSeedStore(): PortalOnboardingStore {
  return {
    assets: seedAssets(),
    media: seedMedia(),
    reviewQueue: [],
    contracts: seedContracts(),
  };
}

function cloneStore(store: PortalOnboardingStore): PortalOnboardingStore {
  return JSON.parse(JSON.stringify(store)) as PortalOnboardingStore;
}

async function ensureStoreFile() {
  try {
    await fs.mkdir(path.dirname(STORE_FILE), { recursive: true });
  } catch {
    return false;
  }

  try {
    await fs.access(STORE_FILE);
  } catch {
    try {
      await fs.writeFile(STORE_FILE, JSON.stringify(createSeedStore(), null, 2), 'utf8');
    } catch {
      return false;
    }
  }

  return true;
}

export async function readOnboardingStore(): Promise<PortalOnboardingStore> {
  const fileReady = await ensureStoreFile();

  if (!fileReady) {
    if (!memoryStore) {
      memoryStore = createSeedStore();
    }
    return cloneStore(memoryStore);
  }

  const raw = await fs.readFile(STORE_FILE, 'utf8');

  try {
    const parsed = JSON.parse(raw) as Partial<PortalOnboardingStore>;
    return {
      assets: Array.isArray(parsed.assets) ? parsed.assets : [],
      media: Array.isArray(parsed.media) ? parsed.media : [],
      reviewQueue: Array.isArray(parsed.reviewQueue) ? parsed.reviewQueue : [],
      contracts: Array.isArray(parsed.contracts) ? parsed.contracts : [],
    };
  } catch {
    const seeded = createSeedStore();
    try {
      await fs.writeFile(STORE_FILE, JSON.stringify(seeded, null, 2), 'utf8');
      return seeded;
    } catch {
      memoryStore = seeded;
      return cloneStore(seeded);
    }
  }
}

export async function writeOnboardingStore(store: PortalOnboardingStore) {
  const normalized = cloneStore(store);
  const fileReady = await ensureStoreFile();

  if (!fileReady) {
    memoryStore = normalized;
    return;
  }

  try {
    await fs.writeFile(STORE_FILE, JSON.stringify(normalized, null, 2), 'utf8');
  } catch {
    memoryStore = normalized;
  }
}

export function ownerFromDomain(domain: 'partner' | 'service_provider' | 'supplier' | null): PortalOwnerKind {
  if (domain === 'supplier' || domain === 'service_provider') {
    return 'stay_supplier';
  }

  return 'drive_partner';
}

export function transitionProductStatus(input: {
  current: ProductWorkflowStatus;
  submit: boolean;
  validationFailed: boolean;
}): ProductWorkflowStatus {
  if (input.validationFailed) {
    return 'validation_failed';
  }

  if (input.submit) {
    return 'pending_review';
  }

  if (input.current === 'published' || input.current === 'approved') {
    return input.current;
  }

  return 'needs_confirmation';
}
