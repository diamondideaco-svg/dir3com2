import { normalizeBookingIdentifier } from '@/lib/bookings';
import { normalizeMarketplaceIdentifier, normalizePublicImageUrl } from '@/lib/marketplace';
import type {
  MarketplaceCategory,
  MarketplaceItemDetail,
  MarketplaceItemSummary,
  MobileAccountSummary,
  MobileBookingDetail,
  MobileBookingSummary,
  MobilePaymentStatus,
  MobileServiceSummary,
} from '@/types/domain';
import type { MobileApiFailure, MobileApiResult } from '@/types/result';

function normalizeBookingStatus(status: string | null | undefined): MobileBookingSummary['status'] {
  const normalized = status?.trim().toLowerCase();

  if (normalized === 'confirmed') {
    return 'Confirmed';
  }

  if (normalized === 'assigned') {
    return 'Assigned';
  }

  if (normalized === 'in progress' || normalized === 'in_progress') {
    return 'In Progress';
  }

  if (normalized === 'completed') {
    return 'Completed';
  }

  if (normalized === 'cancelled' || normalized === 'canceled') {
    return 'Cancelled';
  }

  return 'Pending';
}

function normalizePaymentStatus(status: string | null | undefined): MobilePaymentStatus | null {
  const normalized = status?.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (normalized === 'paid') {
    return 'Paid';
  }

  if (normalized === 'processing') {
    return 'Processing';
  }

  if (normalized === 'failed') {
    return 'Failed';
  }

  if (normalized === 'refunded') {
    return 'Refunded';
  }

  if (normalized === 'unpaid') {
    return 'Unpaid';
  }

  return 'Pending';
}

export type ServicesListMeta = {
  source: 'supabase' | 'api' | 'fallback';
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type ServicesListResponse = {
  services: MobileServiceSummary[];
  meta?: ServicesListMeta;
};

export type ServiceDetailResponse = {
  id: string;
  slug: string;
  name_ar: string;
  name_en?: string;
  description_ar?: string;
  base_price?: number;
  currency?: string;
  status?: string;
};

export type BookingCreateRequest = {
  product_id: string;
  product_name: string;
  guest_name: string;
  guest_phone: string;
  arrival_date: string;
  departure_date: string;
  guests: number;
  city: string;
  total_price: number;
  guest_email?: string | null;
  notes?: string | null;
  special_requests?: string | null;
  client_passport?: string | null;
  client_nationality?: string | null;
};

export type BookingCreateResponse = {
  data: {
    id: string;
    booking_reference: string;
  };
  message: string;
};

export type MyBookingsResponse = {
  bookings: MobileBookingSummary[];
};

export type BookingDetailResponse = {
  booking: MobileBookingDetail;
};

export type MyAccountResponse = {
  account: MobileAccountSummary | null;
};

export type MarketplaceCategoryRecord = {
  slug: string;
  name_ar: string;
  name_en: string;
  item_count?: number;
};

export type MarketplaceItemRecord = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  description?: string;
  category_slug: string;
  category_name_ar: string;
  category_name_en: string;
  image_url?: string;
  starting_price?: number;
  currency?: string;
};

export type MarketplaceCategoriesResponse = {
  categories: MarketplaceCategory[];
};

export type MarketplaceItemsResponse = {
  category: MarketplaceCategory | null;
  items: MarketplaceItemSummary[];
};

export type MarketplaceItemDetailRecord = {
  id: string;
  slug: string;
  name_ar?: string;
  name_en?: string;
  short_description?: string;
  long_description?: string;
  category_slug: string;
  category_name_ar: string;
  category_name_en: string;
  primary_image_url?: string;
  gallery_image_urls?: string[];
  starting_price?: number;
  currency?: string;
  city?: string;
  features?: string[];
  badge?: string;
};

export type MarketplaceItemDetailResponse = {
  item: MarketplaceItemDetail;
};

function invalidResponseFailure(): MobileApiFailure {
  return {
    ok: false,
    error: {
      code: 'invalid_response',
      message: 'Unexpected DIR3COM response. Please try again.',
    },
  };
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function readDateString(value: unknown) {
  const normalized = readString(value);

  if (!normalized) {
    return null;
  }

  return Number.isNaN(new Date(normalized).getTime()) ? null : normalized;
}

function readFiniteNonNegativeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function readCurrencyCode(value: unknown) {
  const normalized = readString(value)?.toUpperCase() ?? null;
  return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function readStringList(value: unknown, maxItems: number, maxLength = 120) {
  if (!Array.isArray(value)) {
    return [];
  }

  const deduped = new Set<string>();

  for (const item of value) {
    const normalized = readString(item);
    if (normalized) {
      deduped.add(normalized.slice(0, maxLength));
    }

    if (deduped.size >= maxItems) {
      break;
    }
  }

  return Array.from(deduped);
}

function readImageUrlList(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) {
    return [];
  }

  const deduped = new Set<string>();

  for (const item of value) {
    const normalized = normalizePublicImageUrl(readString(item));
    if (normalized) {
      deduped.add(normalized);
    }

    if (deduped.size >= maxItems) {
      break;
    }
  }

  return Array.from(deduped);
}

function adaptMarketplaceCategory(input: unknown): MarketplaceCategory | null {
  const record = readRecord(input);
  if (!record) {
    return null;
  }

  const slug = normalizeMarketplaceIdentifier(readString(record.slug));
  const nameAr = readString(record.name_ar);
  const nameEn = readString(record.name_en);

  if (!slug || !nameAr || !nameEn) {
    return null;
  }

  return {
    slug,
    nameAr,
    nameEn,
    itemCount: readInteger(record.item_count) ?? undefined,
  };
}

function adaptMarketplaceItem(input: unknown): MarketplaceItemSummary | null {
  const record = readRecord(input);
  if (!record) {
    return null;
  }

  const id = readString(record.id);
  const slug = normalizeMarketplaceIdentifier(readString(record.slug));
  const nameAr = readString(record.name_ar);
  const nameEn = readString(record.name_en);
  const categorySlug = normalizeMarketplaceIdentifier(readString(record.category_slug));
  const categoryNameAr = readString(record.category_name_ar);
  const categoryNameEn = readString(record.category_name_en);

  if (!id || !slug || !nameAr || !nameEn || !categorySlug || !categoryNameAr || !categoryNameEn) {
    return null;
  }

  return {
    id,
    slug,
    nameAr,
    nameEn,
    description: readString(record.description) ?? undefined,
    categorySlug,
    categoryNameAr,
    categoryNameEn,
    imageUrl: normalizePublicImageUrl(readString(record.image_url)) ?? undefined,
    startingPrice: readFiniteNonNegativeNumber(record.starting_price) ?? undefined,
    currency: readCurrencyCode(record.currency) ?? undefined,
  };
}

function adaptMarketplaceItemDetail(input: unknown): MarketplaceItemDetail | null {
  const record = readRecord(input);
  if (!record) {
    return null;
  }

  const id = readString(record.id);
  const slug = normalizeMarketplaceIdentifier(readString(record.slug));
  const categorySlug = normalizeMarketplaceIdentifier(readString(record.category_slug));
  const categoryNameAr = readString(record.category_name_ar);
  const categoryNameEn = readString(record.category_name_en);
  const nameAr = readString(record.name_ar);
  const nameEn = readString(record.name_en);

  if (!id || !slug || !categorySlug || !categoryNameAr || !categoryNameEn || (!nameAr && !nameEn)) {
    return null;
  }

  return {
    id,
    slug,
    nameAr: nameAr ?? undefined,
    nameEn: nameEn ?? undefined,
    shortDescription: readString(record.short_description) ?? undefined,
    longDescription: readString(record.long_description) ?? undefined,
    categorySlug,
    categoryNameAr,
    categoryNameEn,
    primaryImageUrl: normalizePublicImageUrl(readString(record.primary_image_url)) ?? undefined,
    galleryImageUrls: readImageUrlList(record.gallery_image_urls, 8),
    startingPrice: readFiniteNonNegativeNumber(record.starting_price) ?? undefined,
    currency: readCurrencyCode(record.currency) ?? undefined,
    city: readString(record.city) ?? undefined,
    features: readStringList(record.features, 10),
    badge: readString(record.badge) ?? undefined,
  };
}

export function toMobileServiceSummary(input: {
  id: string | number;
  slug: string;
  name_ar: string;
  name_en?: string;
  description_ar?: string;
  base_price?: number;
  currency?: string;
  category_name_ar?: string | null;
  featured?: boolean;
  status?: string;
}): MobileServiceSummary {
  return {
    id: String(input.id),
    slug: input.slug,
    nameAr: input.name_ar,
    nameEn: input.name_en,
    descriptionAr: input.description_ar,
    basePrice: input.base_price,
    currency: input.currency,
    category: input.category_name_ar ?? null,
    featured: input.featured,
    availability: input.status,
  };
}

export function toMobileBookingSummary(input: {
  id: string;
  booking_reference: string;
  status: string;
  arrival_date?: string | null;
  departure_date?: string | null;
  total_amount?: number | null;
  total_price?: number | null;
  currency?: string | null;
  service_name?: string | null;
  created_at?: string | null;
}): MobileBookingSummary {
  return {
    id: input.id,
    bookingReference: input.booking_reference,
    status: normalizeBookingStatus(input.status),
    startDate: input.arrival_date ?? null,
    endDate: input.departure_date ?? null,
    totalAmount: input.total_amount ?? input.total_price ?? null,
    currency: input.currency ?? null,
    serviceName: input.service_name ?? null,
    createdAt: input.created_at ?? null,
  };
}

export function adaptMyBookingsResponse(input: unknown): MobileApiResult<MyBookingsResponse> {
  const root = readRecord(input);

  if (!root || !Array.isArray(root.bookings)) {
    return invalidResponseFailure();
  }

  const bookings = root.bookings
    .map((item) => {
      const record = readRecord(item);
      if (!record) {
        return null;
      }

      const id = readString(record.id);
      const bookingReference = readString(record.booking_reference);
      const status = readString(record.status) ?? 'pending';

      if (!id || !bookingReference) {
        return null;
      }

      return toMobileBookingSummary({
        id,
        booking_reference: bookingReference,
        status,
        arrival_date: readString(record.arrival_date),
        departure_date: readString(record.departure_date),
        total_amount: readNumber(record.total_amount),
        total_price: readNumber(record.total_price),
        currency: readString(record.currency),
        service_name: readString(record.service_name),
        created_at: readString(record.created_at),
      });
    })
    .filter((booking): booking is MobileBookingSummary => booking !== null);

  return {
    ok: true,
    data: { bookings },
  };
}

export function adaptMyAccountResponse(input: unknown): MobileApiResult<MyAccountResponse> {
  const root = readRecord(input);

  if (!root) {
    return invalidResponseFailure();
  }

  if (root.account === null) {
    return {
      ok: true,
      data: { account: null },
    };
  }

  const account = readRecord(root.account);
  if (!account) {
    return invalidResponseFailure();
  }

  return {
    ok: true,
    data: {
      account: {
        fullName: readString(account.full_name),
        email: readString(account.email),
        phone: readString(account.phone),
      },
    },
  };
}

export function adaptBookingDetailResponse(input: unknown): MobileApiResult<BookingDetailResponse> {
  const root = readRecord(input);

  if (!root) {
    return invalidResponseFailure();
  }

  const booking = readRecord(root.booking);
  if (!booking) {
    return invalidResponseFailure();
  }

  const id = normalizeBookingIdentifier(readString(booking.id));
  const bookingReference = readString(booking.booking_reference);

  if (!id || !bookingReference) {
    return invalidResponseFailure();
  }

  return {
    ok: true,
    data: {
      booking: {
        id,
        bookingReference,
        status: normalizeBookingStatus(readString(booking.status)),
        paymentStatus: normalizePaymentStatus(readString(booking.payment_status)),
        startDate: readDateString(booking.arrival_date),
        endDate: readDateString(booking.departure_date),
        city: readString(booking.city),
        guests: readInteger(booking.guests),
        totalAmount: readNumber(booking.total_amount) ?? readNumber(booking.total_price),
        currency: readString(booking.currency),
        serviceName: readString(booking.service_name),
        guestName: readString(booking.guest_name),
        guestPhone: readString(booking.guest_phone),
        guestEmail: readString(booking.guest_email),
        notes: readString(booking.notes),
        createdAt: readDateString(booking.created_at),
      },
    },
  };
}

export function adaptMarketplaceCategoriesResponse(input: unknown): MobileApiResult<MarketplaceCategoriesResponse> {
  const root = readRecord(input);

  if (!root || !Array.isArray(root.categories)) {
    return invalidResponseFailure();
  }

  const categories = root.categories
    .map((item) => adaptMarketplaceCategory(item))
    .filter((category): category is MarketplaceCategory => category !== null);

  return {
    ok: true,
    data: { categories },
  };
}

export function adaptMarketplaceItemsResponse(input: unknown): MobileApiResult<MarketplaceItemsResponse> {
  const root = readRecord(input);

  if (!root || !Array.isArray(root.items)) {
    return invalidResponseFailure();
  }

  const items = root.items
    .map((item) => adaptMarketplaceItem(item))
    .filter((item): item is MarketplaceItemSummary => item !== null);

  if (root.items.length > 0 && items.length === 0) {
    return invalidResponseFailure();
  }

  const category = adaptMarketplaceCategory(root.category);

  return {
    ok: true,
    data: {
      category,
      items,
    },
  };
}

export function adaptMarketplaceItemDetailResponse(input: unknown): MobileApiResult<MarketplaceItemDetailResponse> {
  const root = readRecord(input);

  if (!root) {
    return invalidResponseFailure();
  }

  const item = adaptMarketplaceItemDetail(root.item);
  if (!item) {
    return invalidResponseFailure();
  }

  return {
    ok: true,
    data: { item },
  };
}
