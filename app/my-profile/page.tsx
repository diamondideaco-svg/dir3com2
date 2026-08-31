import { redirect } from 'next/navigation';
import MyProfileContent, { type CustomerProfile } from '@/components/account/MyProfileContent';
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

  return data as CustomerProfile | null;
}

export default async function MyProfilePage() {
  const customer = await getProfile();

  return <MyProfileContent customer={customer} />;
}
