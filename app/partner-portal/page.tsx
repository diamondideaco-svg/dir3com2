import { redirect } from 'next/navigation';
import PartnerProviderPortalClient from '@/components/portal/PartnerProviderPortalClient';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { normalizeAuthRole } from '@/lib/partner-portal/domain';

function buildLoginTarget(destination: string) {
  const encoded = encodeURIComponent(destination);
  return `/login?redirect=${encoded}&next=${encoded}`;
}

export default async function PartnerPortalPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(buildLoginTarget('/partner-portal'));
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  const metadata = (user.app_metadata as Record<string, unknown> | null) || (user.user_metadata as Record<string, unknown> | null) || {};
  const role = normalizeAuthRole(profile?.role || metadata.role);
  if (!['partner', 'admin', 'staff'].includes(role)) {
    redirect('/my-account');
  }

  return <PartnerProviderPortalClient mode="partner" />;
}
