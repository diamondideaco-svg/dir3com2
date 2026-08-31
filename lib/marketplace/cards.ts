import { isSafeProviderImageUrl } from './provider-url-safety';

export type ServiceType = 'stay' | 'drive' | 'fly' | 'concierge' | 'vip';
export type ImageSource = 'PROVIDER' | 'PARTNER' | 'DIR3COM_FALLBACK' | 'NONE';
export type MarketplaceAvailabilityStatus = 'available' | 'limited' | 'unavailable' | 'sold-out';
export type MarketplaceCapabilityStatus = 'available' | 'blocked' | 'unavailable' | 'pending';

export type MarketplaceCardInput = {
  serviceType: ServiceType | string | null | undefined;
  title?: string | null;
  subtitle?: string | null;
  location?: string | null;
  provider?: string | null;
  providerItemId?: string | null;
  sourceUrl?: string | null;
  retrievedAt?: string | null;
  image?: string | null;
  imageSource?: ImageSource | string | null;
  priceFrom?: number | null;
  totalPrice?: number | null;
  currency?: string | null;
  availabilityStatus?: MarketplaceAvailabilityStatus | string | null;
  rating?: number | null;
  category?: string | null;
  deepLink?: string | null;
  capabilityStatus?: MarketplaceCapabilityStatus | string | null;
  verified?: boolean | null;
  synthetic?: boolean | null;
  providerSandbox?: boolean | null;
  transactionMethod?: import('./truth').MarketplaceTransactionMethod | null;
  fulfilmentState?: import('./truth').MarketplaceFulfilmentState | null;
  marketplaceEnvironment?: import('./truth').MarketplaceEnvironment | null;
};

export type MarketplaceCard = {
  serviceType: ServiceType;
  title: string;
  subtitle: string;
  location: string;
  provider: string;
  providerItemId: string | null;
  sourceUrl: string | null;
  retrievedAt: string | null;
  image: string | null;
  imageSource: ImageSource;
  priceFrom: number | null;
  totalPrice: number | null;
  currency: string;
  availabilityStatus: MarketplaceAvailabilityStatus;
  rating: number | null;
  category: string;
  deepLink: string | null;
  capabilityStatus: MarketplaceCapabilityStatus;
  verified: boolean;
  synthetic: boolean;
  providerSandbox: boolean;
  transactionMethod: import('./truth').MarketplaceTransactionMethod;
  fulfilmentState: import('./truth').MarketplaceFulfilmentState;
  marketplaceEnvironment: import('./truth').MarketplaceEnvironment;
};

const SERVICE_FALLBACK_IMAGES: Record<ServiceType, string> = {
  stay: '/brand/runtime/1000467134.png',
  drive: '/brand/runtime/1000467135.png',
  fly: '/brand/runtime/1000467131.png',
  concierge: '/brand/runtime/1000467128 (1).png',
  vip: '/brand/runtime/1000467129 (1).png',
};

function coerceString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || fallback;
  }

  return fallback;
}

function normalizeServiceType(value: string | null | undefined): ServiceType | null {
  const normalized = coerceString(value).toLowerCase();
  if (normalized === 'stay' || normalized === 'hotel' || normalized === 'hotels') return 'stay';
  if (normalized === 'drive' || normalized === 'car' || normalized === 'cars' || normalized === 'airport-transfer' || normalized === 'airport-transfers') return 'drive';
  if (normalized === 'fly' || normalized === 'flight' || normalized === 'flights') return 'fly';
  if (normalized === 'concierge' || normalized === 'activity' || normalized === 'activities') return 'concierge';
  if (normalized === 'vip' || normalized === 'premium') return 'vip';
  return null;
}

function normalizeCurrency(value: unknown): string {
  const normalized = coerceString(value).trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : 'SAR';
}

function normalizePrice(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(/[^0-9.\-]/g, ''));
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.round(parsed);
    }
  }

  return null;
}

function normalizeAvailability(value: unknown): MarketplaceAvailabilityStatus {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'available' || normalized === 'open') return 'available';
  if (normalized === 'limited' || normalized === 'few' || normalized === 'low') return 'limited';
  if (normalized === 'sold-out' || normalized === 'soldout' || normalized === 'unavailable' || normalized === 'blocked') return 'unavailable';
  return 'available';
}

function normalizeCapability(value: unknown): MarketplaceCapabilityStatus {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'blocked' || normalized === 'fail-closed') return 'blocked';
  if (normalized === 'unavailable') return 'unavailable';
  if (normalized === 'pending') return 'pending';
  return 'available';
}

function normalizeImageSource(value: unknown): ImageSource {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'PROVIDER') return 'PROVIDER';
  if (normalized === 'PARTNER') return 'PARTNER';
  if (normalized === 'DIR3COM_FALLBACK') return 'DIR3COM_FALLBACK';
  return 'NONE';
}

export function resolveMarketplaceImage(input: {
  serviceType: ServiceType | string | null | undefined;
  image?: string | null;
  imageSource?: ImageSource | string | null;
  synthetic?: boolean | null;
  providerSandbox?: boolean | null;
}): string | null {
  if (input.synthetic === true || input.providerSandbox === true) {
    return null;
  }

  const candidateImage = coerceString(input.image).trim();
  if (candidateImage) {
    if (normalizeImageSource(input.imageSource) === 'PROVIDER' && !isSafeProviderImageUrl(candidateImage)) {
      const serviceType = normalizeServiceType(input.serviceType as string | null | undefined);
      return serviceType ? SERVICE_FALLBACK_IMAGES[serviceType] : null;
    }
    return candidateImage;
  }

  const serviceType = normalizeServiceType(input.serviceType as string | null | undefined);
  if (!serviceType) {
    return null;
  }

  if (input.imageSource && normalizeImageSource(input.imageSource) === 'NONE') {
    return SERVICE_FALLBACK_IMAGES[serviceType];
  }

  return SERVICE_FALLBACK_IMAGES[serviceType];
}

export function normalizeMarketplaceCard(input: MarketplaceCardInput | null | undefined): MarketplaceCard | null {
  if (!input) {
    return null;
  }

  const synthetic = Boolean(input.synthetic);
  const providerSandbox = Boolean(input.providerSandbox);

  if (synthetic || providerSandbox) {
    return null;
  }

  const serviceType = normalizeServiceType(input.serviceType as string | null | undefined);
  if (!serviceType) {
    return null;
  }

  const capabilityStatus = normalizeCapability(
    input.capabilityStatus ?? (input.availabilityStatus === 'unavailable' ? 'blocked' : 'available')
  );

  const availabilityStatus = normalizeAvailability(
    input.availabilityStatus ?? (capabilityStatus === 'blocked' ? 'unavailable' : 'available')
  );

  const priceFrom = normalizePrice(input.priceFrom ?? input.totalPrice ?? 0);
  const totalPrice = normalizePrice(input.totalPrice ?? input.priceFrom ?? 0);
  const imageSource = normalizeImageSource(input.imageSource ?? (input.image ? 'PROVIDER' : 'NONE'));
  const image = resolveMarketplaceImage({
    serviceType,
    image: input.image,
    imageSource,
    synthetic,
    providerSandbox,
  });

  const title = coerceString(input.title, 'Service');
  const subtitle = coerceString(input.subtitle, 'Service detail');
  const location = coerceString(input.location, 'General');
  const provider = coerceString(input.provider, 'dir3com');
  const providerItemId = coerceString(input.providerItemId) || null;
  const sourceUrl = coerceString(input.sourceUrl) || null;
  const retrievedAt = coerceString(input.retrievedAt) || null;
  const category = coerceString(input.category, serviceType);
  const deepLink = coerceString(input.deepLink || input.title || '').trim() ? input.deepLink ?? null : null;
  const rating = typeof input.rating === 'number' && Number.isFinite(input.rating) ? input.rating : null;

  return {
    serviceType,
    title,
    subtitle,
    location,
    provider,
    providerItemId,
    sourceUrl,
    retrievedAt,
    image,
    imageSource,
    priceFrom,
    totalPrice,
    currency: normalizeCurrency(input.currency),
    availabilityStatus,
    rating,
    category,
    deepLink,
    capabilityStatus,
    verified: Boolean(input.verified),
    synthetic,
    providerSandbox,
    transactionMethod: input.transactionMethod ?? 'none',
    fulfilmentState: input.fulfilmentState ?? 'availability_unknown',
    marketplaceEnvironment: input.marketplaceEnvironment ?? 'production',
  } satisfies MarketplaceCard;
}

export function normalizeMarketplaceCards(input: Array<MarketplaceCardInput | null | undefined>): MarketplaceCard[] {
  return input
    .map((item) => normalizeMarketplaceCard(item))
    .filter((item): item is MarketplaceCard => item !== null)
    .filter((item) => !(item.synthetic || item.providerSandbox));
}
