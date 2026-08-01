export type MobileBookingStatus = 'Pending' | 'Confirmed' | 'Assigned' | 'In Progress' | 'Completed' | 'Cancelled';

export type MobilePaymentStatus = 'Pending' | 'Paid' | 'Processing' | 'Failed' | 'Refunded' | 'Unpaid';

export type MobileAccountSummary = {
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type MobileServiceSummary = {
  id: string;
  slug: string;
  nameAr: string;
  nameEn?: string;
  descriptionAr?: string;
  basePrice?: number;
  currency?: string;
  category?: string | null;
  featured?: boolean;
  availability?: string;
};

export type MobileBookingSummary = {
  id: string;
  bookingReference: string;
  status: MobileBookingStatus;
  startDate?: string | null;
  endDate?: string | null;
  totalAmount?: number | null;
  currency?: string | null;
  serviceName?: string | null;
  createdAt?: string | null;
};

export type MobileBookingDetail = {
  id: string;
  bookingReference: string;
  status: MobileBookingStatus;
  paymentStatus?: MobilePaymentStatus | null;
  startDate?: string | null;
  endDate?: string | null;
  city?: string | null;
  guests?: number | null;
  totalAmount?: number | null;
  currency?: string | null;
  serviceName?: string | null;
  guestName?: string | null;
  guestPhone?: string | null;
  guestEmail?: string | null;
  notes?: string | null;
  createdAt?: string | null;
};
