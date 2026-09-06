import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { BookingEngineRecord } from '@/lib/supabase/types';
import { listCustomerMarketplaceRequests } from '@/lib/marketplace/customer-requests';
import AccountFrame from '@/components/v6/AccountFrame';
import Bookings from '@/components/v6/Bookings';
export default async function MyBookingsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=%2Fmy-bookings&next=%2Fmy-bookings');
  const { data, error } = await supabase.from('bookings').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
  const { requests } = await listCustomerMarketplaceRequests(supabase, user.id);
  return <AccountFrame path="/my-bookings"><Bookings bookings={(data || []) as BookingEngineRecord[]} requests={requests} failed={Boolean(error)} /></AccountFrame>;
}
