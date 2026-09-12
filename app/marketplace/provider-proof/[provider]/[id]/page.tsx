import ProviderProofDetail from '@/components/public/ProviderProofDetail';
import { getProviderProofOffer } from '@/lib/marketplace/provider-proof';
import { isProviderProofEnabled, proofEnvironmentAllowed, type ProviderProofEnvironment, type ProviderProofProvider } from '@/lib/marketplace/provider-proof-mode';

export const dynamic = 'force-dynamic';

export default async function ProviderProofDetailPage({ params, searchParams }: { params: Promise<{ provider: string; id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ provider, id }, query] = await Promise.all([params, searchParams]);
  const language = query.language === 'ar' ? 'ar' : 'en';
  const environment = (query.environment === 'live' ? 'live' : 'sandbox') as ProviderProofEnvironment;
  const allowedProvider = provider === 'duffel' || provider === 'liteapi' || provider === 'sabre';
  const enabled = isProviderProofEnabled() && proofEnvironmentAllowed(environment);
  let decodedId = id;
  try { decodedId = decodeURIComponent(id); } catch { decodedId = ''; }
  const card = enabled && allowedProvider && decodedId
    ? await getProviderProofOffer({ provider: provider as ProviderProofProvider, providerItemId: decodedId, environment, destination: typeof query.destination === 'string' ? query.destination : 'Riyadh', departureFrom: typeof query.departureFrom === 'string' ? query.departureFrom : 'Cairo', departureDate: typeof query.departureDate === 'string' ? query.departureDate : undefined, returnDate: typeof query.returnDate === 'string' ? query.returnDate : undefined, checkIn: typeof query.checkIn === 'string' ? query.checkIn : undefined, checkOut: typeof query.checkOut === 'string' ? query.checkOut : undefined, language, hotelId: typeof query.hotelId === 'string' ? query.hotelId : undefined })
    : null;
  return <ProviderProofDetail card={card} provider={allowedProvider ? provider : 'unknown'} providerItemId={id} environment={environment} language={language} />;
}
