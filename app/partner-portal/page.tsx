import Link from 'next/link';
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

  const role = normalizeAuthRole(profile?.role);
  if (!['partner', 'admin', 'staff'].includes(role)) {
    redirect('/my-account');
  }

  return (
    <div>
      {role === 'partner' ? (
        <nav aria-label="Partner operational navigation" className="sticky top-[92px] z-30 border-b border-[#D4AF37]/20 bg-[#fffdf9]/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2">
            <span className="me-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#8B6516]">Partner</span>
            <Link href="/partner-portal" aria-current="page" className="rounded-full bg-[#0D1B2A] px-4 py-2 text-sm font-semibold text-white">Portal</Link>
            <Link href="/partner-portal/requests" className="rounded-full border border-[#D4AF37]/35 bg-white px-4 py-2 text-sm font-semibold text-[#0D1B2A] hover:border-[#D4AF37]">Requests / الطلبات</Link>
          </div>
        </nav>
      ) : null}
      <PartnerProviderPortalClient mode="partner" />
    </div>
  );
}
