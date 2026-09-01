import 'server-only';

import { notFound } from 'next/navigation';
import { TravelProviderError } from '@/lib/travel/errors';
import { searchLiteApiHotels } from '@/lib/travel/liteapi/stays';
import { getTicketmasterEvent, searchTicketmasterEvents } from '@/lib/travel/ticketmaster/discovery';
import {
  buildUnavailablePreviewOffer,
  normalizeLiteApiPreviewStay,
  normalizeTicketmasterPreviewEvent,
  type PreviewCity,
  type PreviewCitySelection,
  type PreviewEnvironment,
  type PreviewProviderStatus,
  type RealPreviewStay,
} from '@/lib/marketplace/real-preview-contract';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PROVIDER_ID_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;
const STAY_CITIES = {
  Riyadh: { countryCode: 'SA', guestNationality: 'SA' },
  Cairo: { countryCode: 'EG', guestNationality: 'EG' },
} as const;

export function getLiteApiPreviewEnvironment(env: NodeJS.ProcessEnv = process.env): PreviewEnvironment | null {
  const environment = env.LITEAPI_ENV?.trim().toLowerCase();
  const sandboxPreviewEnabled = env.VERCEL_ENV === 'preview'
    || (env.NODE_ENV !== 'production' && env.DIR3COM_REAL_MARKETPLACE_PREVIEW_ENABLED === 'true');
  if (
    environment === 'sandbox'
    && sandboxPreviewEnabled
    && env.LITEAPI_TEST_API_KEY?.trim().startsWith('sand_')
  ) return 'sandbox';
  if (
    environment !== 'sandbox'
    && env.LITEAPI_AUTH_MODE?.trim().toLowerCase() === 'hmac'
    && env.LITEAPI_PUBLIC_API_KEY?.trim()
    && env.LITEAPI_PRIVATE_API_KEY?.trim()
    && env.LITEAPI_SHARED_SECRET?.trim()
  ) return 'production';
  return null;
}

function assertStayDates(checkIn: string, checkOut: string) {
  if (!DATE_PATTERN.test(checkIn) || !DATE_PATTERN.test(checkOut)) notFound();
  const start = Date.parse(`${checkIn}T00:00:00.000Z`);
  const end = Date.parse(`${checkOut}T00:00:00.000Z`);
  const nights = (end - start) / 86_400_000;
  if (!Number.isFinite(nights) || nights < 1 || nights > 30) notFound();
}

function statusFromLiteApi(status: 'ok' | 'no_results' | 'blocked' | 'unavailable'): PreviewProviderStatus {
  if (status === 'blocked') return 'access_blocked';
  return status;
}

function isAccessBlocked(error: unknown) {
  return error instanceof TravelProviderError && error.code === 'UNAUTHORIZED_VENDOR_ACCESS';
}

async function getCityStays(input: {
  city: PreviewCity;
  checkIn: string;
  checkOut: string;
  environment: PreviewEnvironment | null;
  retrievedAt: string;
  hotelIds?: string[];
  rateId?: string;
}): Promise<{ status: PreviewProviderStatus; stays: RealPreviewStay[] }> {
  if (!input.environment) return { status: 'access_blocked', stays: [] };
  const city = STAY_CITIES[input.city];
  try {
    const result = await searchLiteApiHotels({
      ...(input.hotelIds?.length ? { hotelIds: input.hotelIds } : { cityName: input.city, countryCode: city.countryCode }),
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      occupancies: [{ adults: 1 }],
      currency: 'USD',
      guestNationality: city.guestNationality,
      maxRatesPerHotel: 3,
    });
    if (result.status !== 'ok') return { status: statusFromLiteApi(result.status), stays: [] };
    const stays = result.hotels
      .map((hotel) => normalizeLiteApiPreviewStay(hotel, {
        city: input.city,
        environment: input.environment as PreviewEnvironment,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        retrievedAt: input.retrievedAt,
        rateId: input.rateId,
      }))
      .filter((stay): stay is RealPreviewStay => stay !== null)
      .slice(0, 10);
    return { status: stays.length ? 'ok' : 'no_results', stays };
  } catch (error) {
    return { status: isAccessBlocked(error) ? 'access_blocked' : 'unavailable', stays: [] };
  }
}

export async function getRealMarketplacePreview(input: {
  city: PreviewCitySelection;
  checkIn: string;
  checkOut: string;
}) {
  assertStayDates(input.checkIn, input.checkOut);
  const retrievedAt = new Date().toISOString();
  const liteApiEnvironment = getLiteApiPreviewEnvironment();
  const selectedCities: PreviewCity[] = input.city === 'all' ? ['Riyadh', 'Cairo'] : [input.city];

  const cityRequests = selectedCities.map(async (city) => ({
    city,
    result: await getCityStays({
      city,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      environment: liteApiEnvironment,
      retrievedAt,
    }),
  }));
  const [cityResults, eventProbe] = await Promise.all([
    Promise.all(cityRequests),
    searchTicketmasterEvents({ countryCode: 'SA', size: 24 }).catch(() => ({
      provider: 'ticketmaster' as const,
      status: 'unavailable' as const,
      total: 0,
      events: [],
      diagnostic: 'provider_error' as const,
    })),
  ]);

  const stayStatus: Record<PreviewCity, PreviewProviderStatus | 'not_requested'> = {
    Riyadh: 'not_requested',
    Cairo: 'not_requested',
  };
  const stays: RealPreviewStay[] = [];
  for (const cityResult of cityResults) {
    stayStatus[cityResult.city] = cityResult.result.status;
    stays.push(...cityResult.result.stays);
  }
  const events = eventProbe.status === 'ok'
    ? eventProbe.events
      .filter((event) => event.countryCode === 'SA')
      .map((event) => normalizeTicketmasterPreviewEvent(event, retrievedAt))
    : [];

  return {
    retrievedAt,
    stays,
    events,
    providers: {
      liteapi: {
        access: liteApiEnvironment ? 'authorized' as const : 'blocked' as const,
        environment: liteApiEnvironment ?? 'unconfigured' as const,
        cities: stayStatus,
        blocker: liteApiEnvironment ? (
          Object.values(stayStatus).some((status) => status === 'unavailable')
            ? {
              expectedEnvVar: liteApiEnvironment === 'sandbox' ? 'LITEAPI_ENV=sandbox + LITEAPI_TEST_API_KEY' : 'LITEAPI_AUTH_MODE=hmac + LITEAPI_PUBLIC_API_KEY + LITEAPI_PRIVATE_API_KEY + LITEAPI_SHARED_SECRET',
              accountProduct: 'LiteAPI / Nuitee hotel rates API',
              currentStatus: { ar: 'تم إعداد الاعتماد، لكن بحث المزوّد غير متاح حالياً.', en: 'Credential configured; provider search is currently unavailable.' },
              providerResponse: { ar: 'فشل الطلب — مهلة أو شبكة أو استجابة مزوّد غير صالحة.', en: 'REQUEST FAILED — timeout, network failure, or invalid provider response.' },
              activationRequired: { ar: 'تحقق من بيئة LiteAPI المصرح بها وصلاحية الاعتماد، دون تفعيل الحجز في هذه المعاينة.', en: 'Verify the authorized LiteAPI environment and credential entitlement; do not enable booking for this preview.' },
            }
            : null
        ) : {
          expectedEnvVar: 'LITEAPI_ENV=sandbox + LITEAPI_TEST_API_KEY',
          accountProduct: 'LiteAPI / Nuitee sandbox hotel rates API',
          currentStatus: { ar: 'اعتماد بيئة الاختبار غير مهيأ على الخادم في Vercel Preview.', en: 'Server-side sandbox credential is not configured for Vercel Preview.' },
          providerResponse: { ar: 'لم يُرسل طلب — إغلاق آمن قبل الوصول إلى المزوّد.', en: 'NOT REQUESTED — fail-closed before provider access.' },
          activationRequired: { ar: 'أضف مفتاح LiteAPI sandbox مصرحاً به إلى Vercel Preview مع إبقاء التنفيذ test_sandbox / preview-only.', en: 'Add an authorized LiteAPI sandbox key to Vercel Preview and keep fulfilment test_sandbox / preview-only.' },
        },
      },
      ticketmaster: {
        access: eventProbe.status === 'access_blocked' ? 'blocked' as const : 'authorized' as const,
        environment: 'production' as const,
        status: eventProbe.status,
        blocker: eventProbe.status === 'access_blocked' ? {
          expectedEnvVar: 'TICKETMASTER_API_KEY or TICKETMASTER_CONSUMER_KEY',
          accountProduct: 'Ticketmaster Developer Account / Discovery API Consumer Key',
          currentStatus: eventProbe.diagnostic === 'missing_credential'
            ? { ar: 'اعتماد الخادم غير موجود.', en: 'Server-side credential is absent.' }
            : { ar: 'رفض Ticketmaster الاعتماد المهيأ.', en: 'Configured credential was rejected by Ticketmaster.' },
          providerResponse: eventProbe.diagnostic === 'http_401'
            ? { ar: 'HTTP 401', en: 'HTTP 401' }
            : eventProbe.diagnostic === 'http_403'
              ? { ar: 'HTTP 403', en: 'HTTP 403' }
              : { ar: 'لم يُرسل طلب — الاعتماد غير موجود.', en: 'NOT REQUESTED — credential absent.' },
          activationRequired: { ar: 'أصدر أو فعّل Consumer Key لمنتج Discovery API على الحساب واضبطه على الخادم في Vercel Preview.', en: 'Issue or authorize a Discovery API Consumer Key for the account and configure it server-side in Vercel Preview.' },
        } : eventProbe.status === 'unavailable' ? {
          expectedEnvVar: 'TICKETMASTER_API_KEY or TICKETMASTER_CONSUMER_KEY',
          accountProduct: 'Ticketmaster Discovery API',
          currentStatus: { ar: 'تم إعداد الاعتماد، لكن طلب المزوّد غير متاح حالياً.', en: 'Credential configured; provider request is currently unavailable.' },
          providerResponse: eventProbe.diagnostic === 'http_0' ? { ar: 'الشبكة / انتهاء المهلة', en: 'NETWORK / TIMEOUT' } : { ar: 'خطأ من المزوّد', en: 'PROVIDER ERROR' },
          activationRequired: { ar: 'تحقق من توفر Discovery API وتغطية الفعاليات السعودية للمفتاح المصرح به.', en: 'Confirm Discovery API availability and Saudi event coverage for the authorized key.' },
        } : null,
      },
    },
  };
}

export async function getRealPreviewOffer(
  id: string,
  context?: { city?: string; checkIn?: string; checkOut?: string },
) {
  let providerId: string;
  try {
    providerId = decodeURIComponent(id);
  } catch {
    notFound();
  }
  if (providerId.startsWith('liteapi:')) {
    const hotelId = providerId.slice('liteapi:'.length);
    const city = context?.city === 'Cairo' ? 'Cairo' : context?.city === 'Riyadh' ? 'Riyadh' : null;
    const checkIn = context?.checkIn ?? '';
    const checkOut = context?.checkOut ?? '';
    if (!PROVIDER_ID_PATTERN.test(hotelId) || !city) notFound();
    assertStayDates(checkIn, checkOut);
    const environment = getLiteApiPreviewEnvironment();
    const result = await getCityStays({
      city,
      checkIn,
      checkOut,
      environment,
      retrievedAt: new Date().toISOString(),
      hotelIds: [hotelId],
    });
    const stay = result.stays.find((candidate) => candidate.hotelId === hotelId);
    if (!stay) {
      return buildUnavailablePreviewOffer({
        provider: 'liteapi',
        providerItemId: hotelId,
        environment: environment ?? 'sandbox',
        reason: environment ? (result.status === 'ok' ? 'no_results' : result.status) : 'access_blocked',
        city,
        checkIn,
        checkOut,
      });
    }
    return stay;
  }

  if (!PROVIDER_ID_PATTERN.test(providerId)) notFound();
  try {
    const event = await getTicketmasterEvent(providerId);
    if (!event || event.countryCode !== 'SA') {
      return buildUnavailablePreviewOffer({ provider: 'ticketmaster', providerItemId: providerId, environment: 'production', reason: 'no_results' });
    }
    return normalizeTicketmasterPreviewEvent(event);
  } catch (error) {
    return buildUnavailablePreviewOffer({
      provider: 'ticketmaster',
      providerItemId: providerId,
      environment: 'production',
      reason: isAccessBlocked(error) ? 'access_blocked' : 'unavailable',
    });
  }
}
