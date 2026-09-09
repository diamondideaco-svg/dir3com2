import { redirect } from 'next/navigation';
import PartnerRequestsClient from '@/components/portal/PartnerRequestsClient';
import PartnerWorkspace from '@/components/portal/PartnerWorkspace';
import { requirePortalActor } from '@/lib/partner-portal/server';

export default async function PartnerRequestsPage() {
  const actor = await requirePortalActor();
  if (!actor) {
    redirect('/login?redirect=%2Fpartner-portal%2Frequests&next=%2Fpartner-portal%2Frequests');
  }
  if (actor.authRole !== 'partner') {
    redirect('/partner-portal');
  }
  return <PartnerWorkspace fullName={actor.fullName} email={actor.email}><PartnerRequestsClient /></PartnerWorkspace>;
}
