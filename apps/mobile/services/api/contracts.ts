import type { MobileBookingSummary, MobileIdentity, MobileServiceSummary } from '@/types/domain';

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

export type MyBookingsResponse = MobileBookingSummary[];

export type MyProfileResponse = {
  user: MobileIdentity;
};

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
  total_amount?: number | null;
  total_price?: number | null;
  currency?: string | null;
  service_name?: string | null;
  created_at: string;
}): MobileBookingSummary {
  const normalizedStatus = input.status.toLowerCase();

  const status = normalizedStatus === 'confirmed'
    ? 'Confirmed'
    : normalizedStatus === 'assigned'
      ? 'Assigned'
      : normalizedStatus === 'in progress' || normalizedStatus === 'in_progress'
        ? 'In Progress'
        : normalizedStatus === 'completed'
          ? 'Completed'
          : normalizedStatus === 'cancelled' || normalizedStatus === 'canceled'
            ? 'Cancelled'
            : 'Pending';

  return {
    id: input.id,
    bookingReference: input.booking_reference,
    status,
    totalAmount: input.total_amount ?? input.total_price ?? null,
    currency: input.currency ?? null,
    serviceName: input.service_name ?? null,
    createdAt: input.created_at,
  };
}
