import { redirect } from 'next/navigation';
import MyProfileContent, { type CustomerProfile } from '@/components/account/MyProfileContent';
import { ProfileDesktopFrame } from '@/components/v6/ProfileDesktopFrame';
import { normalizeSessionRole } from '@/lib/auth/identity-contract';
import { createSupabaseServerClient } from '@/lib/supabase/server';

function buildLoginTarget(destination: string) {
  const encoded = encodeURIComponent(destination);
  return `/login?redirect=${encoded}&next=${encoded}`;
}

async function getProfile() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(buildLoginTarget('/my-profile'));
  }

  const { data } = await supabase
    .from('profiles')
    .select('full_name, email, phone, role, status, updated_at')
    .eq('id', user.id)
    .maybeSingle();

  const customer = data as CustomerProfile | null;
  // Reuse the already authenticated read for display; no additional query or write.
  const viewer = {
    id: user.id,
    name: customer?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'dir3com',
    role: normalizeSessionRole(customer?.role),
    roleRaw: customer?.role || null,
    avatar: null,
    joined: null,
  };
  return { customer, viewer };
}

export default async function MyProfilePage() {
  const { customer, viewer } = await getProfile();

  return <ProfileDesktopFrame viewer={viewer}><MyProfileContent customer={customer} /></ProfileDesktopFrame>;
}
