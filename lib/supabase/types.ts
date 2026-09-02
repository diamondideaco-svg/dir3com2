export type ProfileRole = 'customer' | 'admin' | 'partner' | 'staff';
export type ProfileStatus = 'active' | 'inactive' | 'pending' | 'banned';
export type ServiceStatus = 'active' | 'inactive' | 'draft' | 'featured';
export type DestinationStatus = 'active' | 'inactive' | 'draft';
export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'failed';
export type BookingItemStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';
export type ReviewStatus = 'active' | 'pending' | 'hidden';
export type PartnerStatus = 'active' | 'inactive' | 'pending';
export type PromotionStatus = 'active' | 'inactive' | 'expired';
export type MediaStatus = 'active' | 'inactive';
export type NotificationStatus = 'active' | 'read' | 'archived';
export type MediaKind = 'image' | 'video' | 'document';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  avatar_url?: string | null;
  role: ProfileRole;
  status: ProfileStatus;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceCategory {
  id: string;
  parent_id?: string | null;
  name_ar: string;
  name_en: string;
  slug: string;
  description_ar?: string | null;
  description_en?: string | null;
  status: 'active' | 'inactive' | 'draft';
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Service {
  id: string;
  category_id?: string | null;
  name_ar: string;
  name_en: string;
  slug: string;
  description_ar?: string | null;
  description_en?: string | null;
  base_price: number;
  currency: string;
  status: ServiceStatus;
  featured: boolean;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Destination {
  id: string;
  service_id?: string | null;
  name_ar: string;
  name_en: string;
  slug: string;
  description_ar?: string | null;
  description_en?: string | null;
  country?: string | null;
  region?: string | null;
  featured: boolean;
  status: DestinationStatus;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Booking {
  id: string;
  user_id?: string | null;
  booking_reference: string;
  status: BookingStatus;
  total_price?: number | null;
  payment_status?: string | null;
  currency?: string | null;
  total_amount?: number | null;
  notes?: string | null;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookingItem {
  id: string;
  booking_id: string;
  service_id?: string | null;
  destination_id?: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  status: BookingItemStatus;
  notes?: string | null;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  service_id?: string | null;
  booking_id?: string | null;
  rating: number;
  title_ar?: string | null;
  title_en?: string | null;
  comment_ar?: string | null;
  comment_en?: string | null;
  status: ReviewStatus;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Partner {
  id: string;
  name: string;
  slug: string;
  website_url?: string | null;
  logo_url?: string | null;
  description_ar?: string | null;
  description_en?: string | null;
  status: PartnerStatus;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Promotion {
  id: string;
  service_id?: string | null;
  code: string;
  title_ar: string;
  title_en: string;
  description_ar?: string | null;
  description_en?: string | null;
  discount_percentage: number;
  starts_at: string;
  ends_at?: string | null;
  status: PromotionStatus;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MediaItem {
  id: string;
  owner_type: string;
  owner_id: string;
  url: string;
  mime_type?: string | null;
  alt_text_ar?: string | null;
  alt_text_en?: string | null;
  kind: MediaKind;
  status: MediaStatus;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationItem {
  id: string;
  profile_id?: string | null;
  title: string;
  body?: string | null;
  kind: 'info' | 'booking' | 'promotion' | 'system';
  read_at?: string | null;
  status: NotificationStatus;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export type BookingWorkflowStatus = BookingStatus;
export type AssignmentStatus = 'assigned' | 'accepted' | 'declined';
export type SettlementStatus = 'pending' | 'released' | 'failed';

export interface BookingEngineRecord {
  id: string;
  booking_reference: string;
  user_id?: string | null;
  guest_name?: string | null;
  guest_email?: string | null;
  customer_id?: string | null;
  service_id?: string | null;
  partner_id?: string | null;
  title?: string | null;
  status: BookingWorkflowStatus;
  total_amount?: number | null;
  total_price?: number | null;
  payment_status?: string | null;
  currency?: string | null;
  notes?: string | null;
  product_name?: string | null;
  customer_name?: string | null;
  service_name?: string | null;
  partner_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookingStatusHistoryRecord {
  id: string;
  booking_id: string;
  status: BookingWorkflowStatus;
  changed_by?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface PartnerAssignmentRecord {
  id: string;
  booking_id: string;
  partner_id: string;
  assignment_status?: AssignmentStatus | null;
  assigned_by?: string | null;
  notes?: string | null;
  assigned_at: string;
}

export interface BookingReviewRecord {
  id: string;
  booking_id: string;
  customer_id?: string | null;
  rating: number;
  title?: string | null;
  comment?: string | null;
  created_at: string;
}

export interface PartnerSettlementRecord {
  id: string;
  booking_id: string;
  partner_id: string;
  amount: number;
  currency?: string | null;
  settlement_status: SettlementStatus;
  release_date?: string | null;
  notes?: string | null;
  created_at: string;
}

export type PartnerServiceType = 'DIR3 Stay' | 'DIR3 Drive' | 'DIR3 Airport' | 'DIR3 Concierge' | 'DIR3 Experiences' | 'DIR3 VIP';
export type PartnerStatusValue = 'pending' | 'active' | 'inactive' | 'suspended';
export type ShieldLevel = 'basic' | 'silver' | 'gold' | 'platinum';

export interface PartnerRecord {
  id: string;
  company_name: string;
  contact_person: string;
  email: string;
  phone?: string | null;
  country?: string | null;
  city?: string | null;
  commercial_registration?: string | null;
  tax_number?: string | null;
  iban?: string | null;
  status: PartnerStatusValue;
  shield_level: ShieldLevel;
  created_at: string;
  updated_at: string;
}

export interface PartnerDocumentRecord {
  id: string;
  partner_id: string;
  document_type: string;
  file_url?: string | null;
  verified: boolean;
  verified_at?: string | null;
  created_at: string;
}

export interface PartnerServiceRecord {
  id: string;
  partner_id: string;
  service_type: PartnerServiceType;
  created_at?: string;
}

export interface PartnerCoverageRecord {
  id: string;
  partner_id: string;
  country: string;
  city: string;
  created_at?: string;
}

export interface PartnerPerformanceRecord {
  partner_id: string;
  total_bookings: number;
  completed_bookings: number;
  cancelled_bookings: number;
  average_rating: number;
  on_time_rate: number;
  complaints: number;
  revenue: number;
  last_activity?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ProductCategoryRecord {
  id: string;
  name_ar: string;
  name_en: string;
  slug: string;
  description_ar?: string | null;
  description_en?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductRecord {
  id: string;
  category_id?: string | null;
  name_ar: string;
  name_en: string;
  slug: string;
  description_ar?: string | null;
  description_en?: string | null;
  city?: string | null;
  base_price: number;
  currency: string;
  status: string;
  featured: boolean;
  verified: boolean;
  shield_certified: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductImageRecord {
  id: string;
  product_id: string;
  image_url: string;
  caption?: string | null;
  sort_order: number;
  created_at: string;
}

export interface ProductPriceRecord {
  id: string;
  product_id: string;
  price: number;
  currency: string;
  valid_from?: string | null;
  valid_to?: string | null;
  rule_name?: string | null;
  created_at: string;
}

export interface ProductFeatureRecord {
  id: string;
  product_id: string;
  feature_text_ar: string;
  feature_text_en: string;
  created_at: string;
}

export interface ProductAvailabilityRecord {
  id: string;
  product_id: string;
  city: string;
  partner_id?: string | null;
  available: boolean;
  created_at: string;
}

export interface CustomerRecord {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  nationality?: string | null;
  country?: string | null;
  city?: string | null;
  preferred_language?: string | null;
  preferred_currency?: string | null;
  date_of_birth?: string | null;
  passport?: string | null;
  national_id?: string | null;
  emergency_contact?: string | null;
  shield_level?: string | null;
  status?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerDocumentRecord {
  id: string;
  customer_id: string;
  document_type: string;
  file_url?: string | null;
  uploaded_at: string;
}

export interface CustomerPreferenceRecord {
  id: string;
  customer_id: string;
  preferences?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerAddressRecord {
  id: string;
  customer_id: string;
  label?: string | null;
  address_line?: string | null;
  city?: string | null;
  country?: string | null;
  postal_code?: string | null;
  created_at: string;
}

export interface CustomerCompanionRecord {
  id: string;
  customer_id: string;
  full_name: string;
  relationship?: string | null;
  passport?: string | null;
  created_at: string;
}

export interface CustomerNoteRecord {
  id: string;
  customer_id: string;
  note: string;
  created_at: string;
}

export interface CustomerActivityRecord {
  id: string;
  customer_id: string;
  activity_type: string;
  details?: string | null;
  created_at: string;
}

export interface CustomerWalletRecord {
  id: string;
  customer_id: string;
  balance: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface WalletRecord {
  id: string;
  owner_id: string;
  owner_type: string;
  currency: string;
  balance: number;
  held_balance: number;
  available_balance: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface WalletTransactionRecord {
  id: string;
  wallet_id: string;
  transaction_type: string;
  amount: number;
  currency: string;
  reference?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

export interface EscrowAccountRecord {
  id: string;
  booking_id: string;
  wallet_id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentTransactionRecord {
  id: string;
  booking_id?: string | null;
  customer_id?: string | null;
  amount: number;
  currency: string;
  provider: string;
  status: string;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

export interface PartnerSettlementRecord {
  id: string;
  booking_id: string;
  partner_id: string;
  partner_earnings: number;
  commission_amount: number;
  taxes: number;
  net_settlement: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface RefundRequestRecord {
  id: string;
  booking_id: string;
  customer_id: string;
  reason?: string | null;
  requested_by?: string | null;
  approved_by?: string | null;
  refund_amount: number;
  refund_date?: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CommissionRuleRecord {
  id: string;
  service_type?: string | null;
  partner_id?: string | null;
  shield_level?: string | null;
  fixed_amount: number;
  percentage: number;
  enabled: boolean;
  created_at: string;
}

export interface InvoiceRecord {
  id: string;
  owner_id: string;
  owner_type: string;
  invoice_type: string;
  status: string;
  total_amount: number;
  currency: string;
  issued_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceItemRecord {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  created_at: string;
}

export interface PaymentMethodRecord {
  id: string;
  owner_id: string;
  owner_type: string;
  provider: string;
  method_type: string;
  token_reference?: string | null;
  is_default: boolean;
  created_at: string;
}

export interface FinancialAuditLogRecord {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  details?: Record<string, unknown> | null;
  created_at: string;
}
