import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface SearchGroup {
  key: string;
  title: string;
  items: Array<Record<string, unknown>>;
}

export async function runGlobalSearch(query: string) {
  const supabase = await createSupabaseServerClient();
  const q = query.trim();
  if (!q) return { groups: [] };

  const [customersRes, partnersRes, bookingsRes, productsRes, paymentsRes, invoicesRes, verificationsRes] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, role').ilike('full_name', `%${q}%`).limit(5),
    supabase.from('partners').select('id, company_name, slug').ilike('company_name', `%${q}%`).limit(5),
    supabase.from('bookings').select('id, booking_reference, status').ilike('booking_reference', `%${q}%`).limit(5),
    supabase.from('products').select('id, name_en, slug').ilike('name_en', `%${q}%`).limit(5),
    supabase.from('payment_transactions').select('id, provider, status').ilike('provider', `%${q}%`).limit(5),
    supabase.from('invoices').select('id, invoice_type, status').ilike('invoice_type', `%${q}%`).limit(5),
    supabase.from('verification_requests').select('id, request_type, status').ilike('request_type', `%${q}%`).limit(5),
  ]);

  const groups: SearchGroup[] = [
    { key: 'customers', title: 'Customers', items: customersRes.data ?? [] },
    { key: 'partners', title: 'Partners', items: partnersRes.data ?? [] },
    { key: 'bookings', title: 'Bookings', items: bookingsRes.data ?? [] },
    { key: 'products', title: 'Products', items: productsRes.data ?? [] },
    { key: 'payments', title: 'Payments', items: paymentsRes.data ?? [] },
    { key: 'invoices', title: 'Invoices', items: invoicesRes.data ?? [] },
    { key: 'verification', title: 'Verification', items: verificationsRes.data ?? [] },
  ].filter((group) => group.items.length > 0);

  return { groups };
}
