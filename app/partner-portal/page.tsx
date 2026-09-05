import Link from 'next/link';
import { redirect } from 'next/navigation';
import PartnerProviderPortalClient from '@/components/portal/PartnerProviderPortalClient';
import { requirePortalActor } from '@/lib/partner-portal/server';

function buildLoginTarget(destination: string) {
  const encoded = encodeURIComponent(destination);
  return `/login?redirect=${encoded}&next=${encoded}`;
}

export default async function PartnerPortalPage() {
  const actor = await requirePortalActor();
  if (!actor) {
    redirect(buildLoginTarget('/partner-portal'));
  }
  const role = actor.authRole;
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
