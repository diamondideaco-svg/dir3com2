import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function getExecutiveDashboardData() {
  const supabase = await createSupabaseServerClient();

  const [bookingsRes, customersRes, partnersRes, productsRes, revenueRes, settlementsRes, refundsRes, verificationsRes, notificationsRes, timelineRes, eventsRes, auditRes] = await Promise.all([
    supabase.from('bookings').select('*').order('created_at', { ascending: false }).limit(8),
    supabase.from('profiles').select('*').eq('role', 'customer').limit(8),
    supabase.from('partners').select('*').limit(8),
    supabase.from('products').select('*').limit(8),
    supabase.from('bookings').select('total_amount').order('created_at', { ascending: false }),
    supabase.from('partner_settlements').select('*').eq('status', 'pending').limit(8),
    supabase.from('refund_requests').select('*').eq('status', 'pending').limit(8),
    supabase.from('verification_requests').select('*').eq('status', 'Pending').limit(8),
    supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(8),
    supabase.from('activity_timeline').select('*').order('created_at', { ascending: false }).limit(8),
    supabase.from('system_events').select('*').order('created_at', { ascending: false }).limit(8),
    supabase.from('audit_logs').select('*').order('timestamp', { ascending: false }).limit(8),
  ]);

  const revenue = (revenueRes.data ?? []).reduce((sum: number, item: { total_amount?: number | string | null }) => sum + Number(item.total_amount || 0), 0);
  const escrowBalance = 0;

  return {
    bookings: bookingsRes.data ?? [],
    customers: customersRes.data ?? [],
    partners: partnersRes.data ?? [],
    products: productsRes.data ?? [],
    revenue,
    escrowBalance,
    pendingSettlements: settlementsRes.data ?? [],
    pendingRefunds: refundsRes.data ?? [],
    pendingVerifications: verificationsRes.data ?? [],
    notifications: notificationsRes.data ?? [],
    recentActivity: [...(timelineRes.data ?? []), ...(eventsRes.data ?? []), ...(auditRes.data ?? [])]
      .sort((a: { created_at?: string | null; timestamp?: string | null }, b: { created_at?: string | null; timestamp?: string | null }) => new Date(b.created_at ?? b.timestamp ?? 0).getTime() - new Date(a.created_at ?? a.timestamp ?? 0).getTime())
      .slice(0, 12),
  };
}
