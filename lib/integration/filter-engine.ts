export type FilterValue = string | string[] | undefined;

export interface GlobalFilters {
  country?: string;
  city?: string;
  service?: string;
  category?: string;
  shieldLevel?: string;
  verificationStatus?: string;
  bookingStatus?: string;
  paymentStatus?: string;
  dateRange?: string;
}

export function buildFilterSummary(filters: GlobalFilters) {
  return Object.entries(filters).filter(([, value]) => Boolean(value));
}

export function normalizeFilters(filters: GlobalFilters) {
  return {
    country: filters.country ?? '',
    city: filters.city ?? '',
    service: filters.service ?? '',
    category: filters.category ?? '',
    shieldLevel: filters.shieldLevel ?? '',
    verificationStatus: filters.verificationStatus ?? '',
    bookingStatus: filters.bookingStatus ?? '',
    paymentStatus: filters.paymentStatus ?? '',
    dateRange: filters.dateRange ?? '',
  };
}
