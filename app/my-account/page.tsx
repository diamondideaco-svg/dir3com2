import { redirect } from 'next/navigation';
import MyAccountContent from '@/components/account/MyAccountContent';
import AccountFrame from '@/components/v6/AccountFrame';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { normalizeRole } from '@/lib/auth/identity';
import { listCustomerMarketplaceRequests } from '@/lib/marketplace/customer-requests';
import { normalizeBookingStatus } from '@/lib/booking/workflow-status';

function buildLoginTarget(destination: string) {
  const encoded = encodeURIComponent(destination);
  return `/login?redirect=${encoded}&next=${encoded}`;
}

async function getAccountProfile() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(buildLoginTarget('/my-account'));
  }

  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, status, created_at')
    .eq('id', user.id)
    .maybeSingle();

  const { requests } = await listCustomerMarketplaceRequests(supabase, user.id, 5);

  const [documentsResult, bookingsResult] = await Promise.all([
    supabase.from('verification_documents').select('id, document_type, verification_status, expiry_date').eq('owner_type', 'customer').eq('owner_id', user.id).order('created_at', { ascending: false }).limit(3),
    supabase.from('bookings').select('id, booking_reference, status, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
  ]);
  const upcoming = (bookingsResult.data || []).find(row => !['Completed', 'Cancelled'].includes(normalizeBookingStatus(row.status)));
  return { user, profile: data, requests, documents: documentsResult.error ? null : documentsResult.data || [],
    booking: upcoming || null, bookingsFailed: Boolean(bookingsResult.error) };
}

export default async function MyAccountPage() {
  const { user, profile, requests, documents, booking, bookingsFailed } = await getAccountProfile();
  const displayName = profile?.full_name || user.user_metadata?.full_name_ar || user.user_metadata?.full_name || user.email?.split('@')[0] || null;
  const displayEmail = profile?.email || user.email || '—';
  const roleRaw = typeof profile?.role === 'string' ? profile.role : null;

  return (
    <AccountFrame path="/my-account" navy>
    <MyAccountContent
      displayName={displayName}
      displayEmail={displayEmail}
      role={normalizeRole(profile?.role)}
      roleRaw={roleRaw}
      accountStatus={profile?.status ?? null}
      joinedAt={profile?.created_at ?? null}
      requests={requests}
      documents={documents}
      booking={booking}
      bookingsFailed={bookingsFailed}
    />
    </AccountFrame>
  );
}
