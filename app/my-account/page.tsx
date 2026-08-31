import { redirect } from 'next/navigation';
import MyAccountContent from '@/components/account/MyAccountContent';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { normalizeRole } from '@/lib/auth/identity';
import { listCustomerMarketplaceRequests } from '@/lib/marketplace/customer-requests';

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

  return { user, profile: data, requests };
}

export default async function MyAccountPage() {
  const { user, profile, requests } = await getAccountProfile();
  const displayName = profile?.full_name || user.user_metadata?.full_name_ar || user.user_metadata?.full_name || user.email?.split('@')[0] || null;
  const displayEmail = profile?.email || user.email || '—';
  const roleRaw = typeof profile?.role === 'string' ? profile.role : null;

  return (
    <MyAccountContent
      displayName={displayName}
      displayEmail={displayEmail}
      role={normalizeRole(profile?.role)}
      roleRaw={roleRaw}
      accountStatus={profile?.status ?? null}
      joinedAt={profile?.created_at ?? null}
      requests={requests}
    />
  );
}
