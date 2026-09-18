import { notFound, redirect } from 'next/navigation';

import MarketplaceRequestDetail from '@/components/account/MarketplaceRequestDetail';
import {
  formatCustomerRequestTimestamp,
  getCustomerMarketplaceRequest,
  isMarketplaceRequestReference,
} from '@/lib/marketplace/customer-requests';
import { logServerError } from '@/lib/security/safe-logger';
import { createSupabaseServerClient } from '@/lib/supabase/server';

function buildLoginTarget(destination: string) {
  const encoded = encodeURIComponent(destination);
  return `/login?redirect=${encoded}&next=${encoded}`;
}

export default async function CustomerRequestDetailPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference: rawReference } = await params;
  const reference = rawReference.toUpperCase();
  const destination = `/my-requests/${encodeURIComponent(reference)}`;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(buildLoginTarget(destination));
  if (!isMarketplaceRequestReference(reference)) notFound();

  const { request, error } = await getCustomerMarketplaceRequest(supabase, user.id, reference);
  if (error) {
    logServerError('customer.marketplace_request_detail.read_failed', error);
    throw new Error('Unable to load marketplace request details.');
  }
  if (!request) notFound();
  // The source XOR constraint makes a null product a managed Drive request.
  // Keep the shared projection compatible before the forward migration lands.
  if (request.product_id === null && request.marketplace_family === 'drive') redirect(`${destination}/drive`);

  return (
    <MarketplaceRequestDetail
      request={request}
      createdAt={formatCustomerRequestTimestamp(request.created_at)}
      updatedAt={formatCustomerRequestTimestamp(request.updated_at)}
    />
  );
}
