import type { SupabaseClient } from '@supabase/supabase-js';

export const CUSTOMER_MARKETPLACE_REQUEST_FIELDS = [
  'id',
  'request_reference',
  'product_id',
  'request_type',
  'status',
  'requested_for',
  'traveller_count',
  'quote_amount',
  'quote_currency',
  'quote_expires_at',
  'payment_status',
  'marketplace_family',
  'supplier_name',
  'service_name',
  'fulfilment_method',
  'transaction_method',
  'handoff_type',
  'handoff_reference',
  'handoff_started_at',
  'next_action',
  'created_at',
  'updated_at',
].join(', ');

export type CustomerMarketplaceRequest = {
  id: string;
  request_reference: string;
  product_id: string;
  request_type: string;
  status: string;
  requested_for: string | null;
  traveller_count: number;
  quote_amount: number | null;
  quote_currency: string | null;
  quote_expires_at: string | null;
  payment_status: string;
  marketplace_family: string | null;
  supplier_name: string | null;
  service_name: string | null;
  fulfilment_method: string;
  transaction_method: string | null;
  handoff_type: string;
  handoff_reference: string | null;
  handoff_started_at: string | null;
  next_action: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerRequestTimestamp = {
  ar: string;
  en: string;
};

export function isMarketplaceRequestReference(value: string) {
  return /^REQ-[A-Z0-9]{8}$/.test(value);
}

export function formatCustomerRequestTimestamp(value: string): CustomerRequestTimestamp {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return { ar: '—', en: '—' };

  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZone: 'UTC',
    timeZoneName: 'short',
  };

  return {
    ar: new Intl.DateTimeFormat('ar-SA-u-nu-latn', options).format(timestamp),
    en: new Intl.DateTimeFormat('en-GB', options).format(timestamp),
  };
}

export async function listCustomerMarketplaceRequests(
  supabase: SupabaseClient,
  authenticatedUserId: string,
  limit?: number,
) {
  let query = supabase
    .from('marketplace_requests')
    .select(CUSTOMER_MARKETPLACE_REQUEST_FIELDS)
    .eq('user_id', authenticatedUserId)
    .order('created_at', { ascending: false });

  if (limit !== undefined) query = query.limit(limit);

  const { data, error } = await query;
  return { requests: (data ?? []) as unknown as CustomerMarketplaceRequest[], error };
}

export async function getCustomerMarketplaceRequest(
  supabase: SupabaseClient,
  authenticatedUserId: string,
  reference: string,
) {
  const { data, error } = await supabase
    .from('marketplace_requests')
    .select(CUSTOMER_MARKETPLACE_REQUEST_FIELDS)
    .eq('user_id', authenticatedUserId)
    .eq('request_reference', reference)
    .maybeSingle();

  return { request: (data as CustomerMarketplaceRequest | null) ?? null, error };
}
