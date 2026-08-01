import type { MobileAccountSummary, MobileBookingSummary, MobileServiceSummary } from '@/types/domain';
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

export type MyAccountResponse = {
  account: MobileAccountSummary | null;
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
