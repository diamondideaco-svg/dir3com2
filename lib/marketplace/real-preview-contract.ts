import type { HotelResult, StayRate } from '@/lib/travel/contracts';
import type { TicketmasterDiscoveryEvent } from '@/lib/travel/ticketmaster/discovery';
import { isSafeProviderImageUrl } from '@/lib/marketplace/provider-url-safety';

export const previewFamilies = ['dir3-fly', 'dir3-stay', 'dir3-drive', 'dir3-concierge', 'dir3-vip'] as const;
export type PreviewFamily = (typeof previewFamilies)[number];
export type PreviewCity = 'Riyadh' | 'Cairo';
export type PreviewCitySelection = PreviewCity | 'all';
export type PreviewProviderStatus = 'ok' | 'no_results' | 'access_blocked' | 'unavailable';
export type PreviewEnvironment = 'production' | 'sandbox';
export type PreviewProviderAccess = 'authorized' | 'blocked' | 'unavailable';
export type LiteApiPreviewAccessState = 'credential_missing' | 'credential_rejected' | 'access_unverified' | 'authorized' | 'temporarily_unavailable';

export type PreviewProviderBlocker = {
  provider: 'liteapi' | 'ticketmaster';
  code: string;
  environment: PreviewEnvironment | 'unconfigured';
  expectedEnvVar: string;
  accountProduct: string;
  currentStatus: { ar: string; en: string };
  providerResponse: { ar: string; en: string };
  activationRequired: { ar: string; en: string };
};

export function resolveLiteApiPreviewProviderState(
  environment: PreviewEnvironment | null,
  cities: Record<PreviewCity, PreviewProviderStatus | 'not_requested'>,
): {
  access: PreviewProviderAccess;
  accessState: LiteApiPreviewAccessState;
  blocker: PreviewProviderBlocker | null;
} {
  if (!environment) {
    return {
      access: 'blocked',
      accessState: 'credential_missing',
      blocker: {
        provider: 'liteapi',
        code: 'credential_missing',
        environment: 'unconfigured',
        expectedEnvVar: 'LITEAPI_ENV=sandbox + LITEAPI_TEST_API_KEY',
        accountProduct: 'LiteAPI / Nuitee sandbox hotel rates API',
        currentStatus: { ar: 'اعتماد بيئة الاختبار غير مهيأ على الخادم في Vercel Preview.', en: 'Server-side sandbox credential is not configured for Vercel Preview.' },
        providerResponse: { ar: 'UNAUTHORIZED_VENDOR_ACCESS — لم يُرسل طلب؛ إغلاق آمن قبل الوصول إلى المزوّد.', en: 'UNAUTHORIZED_VENDOR_ACCESS — NOT REQUESTED; fail-closed before provider access.' },
        activationRequired: { ar: 'أضف مفتاح LiteAPI sandbox مصرحاً به إلى Vercel Preview مع إبقاء التنفيذ test_sandbox / preview-only.', en: 'Add an authorized LiteAPI sandbox key to Vercel Preview and keep fulfilment test_sandbox / preview-only.' },
      },
    };
  }

  const requestedStatuses = Object.values(cities).filter((status) => status !== 'not_requested');
  const expectedEnvVar = environment === 'sandbox'
    ? 'LITEAPI_ENV=sandbox + LITEAPI_TEST_API_KEY'
    : 'LITEAPI_AUTH_MODE=hmac + LITEAPI_PUBLIC_API_KEY + LITEAPI_PRIVATE_API_KEY + LITEAPI_SHARED_SECRET';

  if (!requestedStatuses.length) {
    return {
      access: 'blocked',
      accessState: 'access_unverified',
      blocker: {
        provider: 'liteapi',
        code: 'access_unverified',
        environment,
        expectedEnvVar,
        accountProduct: 'LiteAPI / Nuitee hotel rates API',
        currentStatus: { ar: 'الاعتماد مهيأ، لكن لم يُنفذ طلب مزوّد يثبت صلاحية الوصول.', en: 'Credential configured, but no provider request proved access.' },
        providerResponse: { ar: 'NOT REQUESTED — لم يتم إثبات تفويض الوصول.', en: 'NOT REQUESTED — provider authorization was not proven.' },
        activationRequired: { ar: 'نفّذ فحص بحث مصرحاً به قبل إعلان الوصول كمفوض.', en: 'Complete an authorized search probe before reporting access as authorized.' },
      },
    };
  }

  if (requestedStatuses.includes('access_blocked')) {
    return {
      access: 'blocked',
      accessState: 'credential_rejected',
      blocker: {
        provider: 'liteapi',
        code: 'credential_rejected',
        environment,
        expectedEnvVar,
        accountProduct: 'LiteAPI / Nuitee hotel rates API',
        currentStatus: { ar: 'رفض LiteAPI الاعتماد المهيأ؛ لم يتم إثبات صلاحية الوصول إلى المزوّد.', en: 'LiteAPI rejected the configured credential; provider access was not proven.' },
        providerResponse: { ar: 'UNAUTHORIZED_VENDOR_ACCESS — رفض المزوّد الوصول.', en: 'UNAUTHORIZED_VENDOR_ACCESS — provider access was rejected.' },
        activationRequired: { ar: 'تحقق من صلاحية اعتماد LiteAPI وتفويض منتج البحث للبيئة المهيأة قبل إعادة المحاولة.', en: 'Verify the LiteAPI credential and search-product entitlement for the configured environment before retrying.' },
      },
    };
  }

  if (requestedStatuses.includes('unavailable')) {
    return {
      access: 'unavailable',
      accessState: 'temporarily_unavailable',
      blocker: {
        provider: 'liteapi',
        code: 'temporarily_unavailable',
        environment,
        expectedEnvVar,
        accountProduct: 'LiteAPI / Nuitee hotel rates API',
        currentStatus: { ar: 'تم إعداد الاعتماد، لكن بحث المزوّد غير متاح حالياً؛ لم تُفترض صلاحية الوصول.', en: 'Credential configured, but provider search is currently unavailable; access was not assumed.' },
        providerResponse: { ar: 'PROVIDER_UNAVAILABLE — مهلة أو شبكة أو استجابة مزوّد غير صالحة.', en: 'PROVIDER_UNAVAILABLE — timeout, network failure, or invalid provider response.' },
        activationRequired: { ar: 'تحقق من توفر LiteAPI وصلاحية الاعتماد دون تفعيل الحجز في هذه المعاينة.', en: 'Verify LiteAPI availability and credential entitlement; do not enable booking for this preview.' },
      },
    };
  }

  return { access: 'authorized', accessState: 'authorized', blocker: null };
}

export type PreviewSourceTrace = {
  provider: 'liteapi' | 'ticketmaster';
  providerItemId: string;
  sourceUrl: string | null;
  environment: PreviewEnvironment;
  retrievedAt: string;
  transactionMethod: 'none' | 'provider_checkout';
  fulfilmentState: 'availability_unknown' | 'test_sandbox' | 'external_provider' | 'unavailable';
};

export type RealPreviewUnavailableOffer = PreviewSourceTrace & {
  kind: 'unavailable';
  family: 'dir3-stay' | 'dir3-concierge';
  reason: Exclude<PreviewProviderStatus, 'ok'>;
  city: PreviewCity | null;
  checkIn: string | null;
  checkOut: string | null;
};

export type RealPreviewEvent = PreviewSourceTrace & {
  kind: 'event';
  id: string;
  family: 'dir3-concierge';
  provider: 'ticketmaster';
  environment: 'production';
  availability: 'available' | 'sold_out' | 'unavailable' | 'unknown';
  priceState: 'live' | 'not_supplied';
  salesStatus: string;
  title: string;
  imageUrl: string | null;
  localDate: string | null;
  localTime: string | null;
  timezone: string | null;
  venue: string;
  city: string;
  countryCode: string;
  priceMin: number | null;
  priceMax: number | null;
  currency: string | null;
  providerUrl: string;
};

export type RealPreviewStay = PreviewSourceTrace & {
  kind: 'stay';
  id: string;
  family: 'dir3-stay';
  provider: 'liteapi';
  city: PreviewCity;
  hotelId: string;
  rateId: string;
  availability: 'provider_result';
  priceState: 'live' | 'provider_preview';
  title: string;
  address: string;
  rating: number | null;
  imageUrl: string | null;
  roomName: string;
  boardName: string | null;
  refundable: boolean;
  cancellationDeadline: string | null;
  totalAmount: string;
  currency: string;
  checkIn: string;
  checkOut: string;
};

export type RealPreviewOffer = RealPreviewStay | RealPreviewEvent | RealPreviewUnavailableOffer;

export function formatPreviewRetrievedAt(retrievedAt: string, language: 'ar' | 'en') {
  return new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(retrievedAt));
}

export function buildUnavailablePreviewOffer(input: {
  provider: 'liteapi' | 'ticketmaster';
  providerItemId: string;
  environment: PreviewEnvironment;
  reason: RealPreviewUnavailableOffer['reason'];
  city?: PreviewCity;
  checkIn?: string;
  checkOut?: string;
}): RealPreviewUnavailableOffer {
  return {
    kind: 'unavailable',
    family: input.provider === 'liteapi' ? 'dir3-stay' : 'dir3-concierge',
    provider: input.provider,
    providerItemId: input.providerItemId,
    sourceUrl: null,
    environment: input.environment,
    retrievedAt: new Date().toISOString(),
    transactionMethod: 'none',
    fulfilmentState: 'availability_unknown',
    reason: input.reason,
    city: input.city ?? null,
    checkIn: input.checkIn ?? null,
    checkOut: input.checkOut ?? null,
  };
}

function eventAvailability(salesStatus: string): RealPreviewEvent['availability'] {
  const normalized = salesStatus.trim().toLowerCase();
  if (normalized === 'onsale') return 'available';
  if (normalized === 'soldout' || normalized === 'sold_out') return 'sold_out';
  if (normalized === 'cancelled' || normalized === 'canceled') return 'unavailable';
  return 'unknown';
}

export function normalizeTicketmasterPreviewEvent(
  event: TicketmasterDiscoveryEvent,
  retrievedAt = new Date().toISOString(),
): RealPreviewEvent {
  const availability = eventAvailability(event.salesStatus);
  const transactionMethod = availability === 'available' ? 'provider_checkout' : 'none';
  const fulfilmentState = availability === 'available'
    ? 'external_provider'
    : availability === 'sold_out' || availability === 'unavailable'
      ? 'unavailable'
      : 'availability_unknown';

  return {
    kind: 'event',
    id: event.id,
    family: 'dir3-concierge',
    provider: 'ticketmaster',
    providerItemId: event.id,
    sourceUrl: event.url,
    environment: 'production',
    retrievedAt,
    transactionMethod,
    fulfilmentState,
    availability,
    priceState: event.priceMin !== null && event.currency ? 'live' : 'not_supplied',
    salesStatus: event.salesStatus,
    title: event.name,
    imageUrl: event.imageUrl,
    localDate: event.localDate,
    localTime: event.localTime,
    timezone: event.timezone,
    venue: event.venue,
    city: event.city,
    countryCode: event.countryCode,
    priceMin: event.priceMin,
    priceMax: event.priceMax,
    currency: event.currency,
    providerUrl: event.url,
  };
}

function findRate(hotel: HotelResult, rateId?: string): { roomName: string; rate: StayRate } | null {
  for (const room of hotel.rooms ?? []) {
    const rate = rateId
      ? room.rates?.find((candidate) => candidate.id === rateId)
      : room.rates?.[0];
    if (rate) return { roomName: room.name || rate.roomName || 'Room', rate };
  }
  return null;
}

export function normalizeLiteApiPreviewStay(
  hotel: HotelResult,
  context: {
    city: PreviewCity;
    environment: PreviewEnvironment;
    checkIn: string;
    checkOut: string;
    retrievedAt?: string;
    rateId?: string;
  },
): RealPreviewStay | null {
  const selected = findRate(hotel, context.rateId);
  if (!selected || !hotel.id || !hotel.name) return null;
  const { rate } = selected;
  const sandbox = context.environment === 'sandbox';

  return {
    kind: 'stay',
    id: `liteapi:${hotel.id}`,
    family: 'dir3-stay',
    provider: 'liteapi',
    providerItemId: hotel.id,
    sourceUrl: null,
    environment: context.environment,
    retrievedAt: context.retrievedAt ?? new Date().toISOString(),
    transactionMethod: 'none',
    fulfilmentState: sandbox ? 'test_sandbox' : 'availability_unknown',
    city: context.city,
    hotelId: hotel.id,
    rateId: rate.id,
    availability: 'provider_result',
    priceState: sandbox ? 'provider_preview' : 'live',
    title: hotel.name,
    address: hotel.address || context.city,
    rating: hotel.rating ?? null,
    imageUrl: isSafeProviderImageUrl(hotel.imageUrl) ? hotel.imageUrl : null,
    roomName: selected.roomName,
    boardName: rate.boardName || null,
    refundable: rate.refundable,
    cancellationDeadline: rate.cancellationDeadline || null,
    totalAmount: rate.totalAmount,
    currency: rate.currency,
    checkIn: context.checkIn,
    checkOut: context.checkOut,
  };
}
