export type MobileBookingStatus = 'Pending' | 'Confirmed' | 'Assigned' | 'In Progress' | 'Completed' | 'Cancelled';

export type MobileIdentity = {
  id: string;
  fullName?: string | null;
  email?: string | null;
  role?: string | null;
  status?: string | null;
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
  totalAmount?: number | null;
  currency?: string | null;
  serviceName?: string | null;
  createdAt: string;
};
