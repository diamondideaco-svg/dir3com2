import PartnerWorkspace from '@/components/portal/PartnerWorkspace';
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

  if (role === 'partner') return <PartnerWorkspace fullName={actor.fullName} email={actor.email}><PartnerProviderPortalClient mode="partner" operational /></PartnerWorkspace>;

  return (
    <div>
      <PartnerProviderPortalClient mode="partner" />
    </div>
  );
}
