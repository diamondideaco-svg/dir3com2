import ProviderProofClient from '@/components/public/ProviderProofClient';
import { isProviderProofEnabled, type ProviderProofEnvironment, type ProviderProofProvider } from '@/lib/marketplace/provider-proof-mode';
import { runProviderProofSearch } from '@/lib/marketplace/provider-proof';

export const dynamic = 'force-dynamic';

function dateDefaults() {
  const departure = new Date();
  departure.setUTCDate(departure.getUTCDate() + 30);
  const returning = new Date(departure);
  returning.setUTCDate(returning.getUTCDate() + 2);
  const checkOut = new Date(departure);
  checkOut.setUTCDate(checkOut.getUTCDate() + 2);
  return {
    departureDate: departure.toISOString().slice(0, 10),
    returnDate: returning.toISOString().slice(0, 10),
    checkIn: departure.toISOString().slice(0, 10),
    checkOut: checkOut.toISOString().slice(0, 10),
  };
}

function first(query: Record<string, string | string[] | undefined>, key: string, fallback: string) {
  const value = query[key];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export default async function ProviderProofPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const defaults = dateDefaults();
  const environment = (first(query, 'environment', 'sandbox') === 'live' ? 'live' : 'sandbox') as ProviderProofEnvironment;
  const language = first(query, 'language', 'en') === 'ar' ? 'ar' : 'en';
  const destination = first(query, 'destination', 'Riyadh');
  const departureFrom = first(query, 'departureFrom', 'Cairo');
  const departureDate = first(query, 'departureDate', defaults.departureDate);
  const returnDate = first(query, 'returnDate', defaults.returnDate);
  const checkIn = first(query, 'checkIn', defaults.checkIn);
  const checkOut = first(query, 'checkOut', defaults.checkOut);
  const requestedProviders = Array.isArray(query.provider) ? query.provider : query.provider ? [query.provider] : [];
  const providers = requestedProviders.filter((provider): provider is ProviderProofProvider => provider === 'duffel' || provider === 'liteapi' || provider === 'sabre');
  const enabled = isProviderProofEnabled();
  const results = enabled
    ? await runProviderProofSearch({ environment, destination, departureFrom, departureDate, returnDate, checkIn, checkOut, language, providers: providers.length ? providers : undefined })
    : [];

  return <ProviderProofClient enabled={isProviderProofEnabled()} environment={environment} destination={destination} departureFrom={departureFrom} departureDate={departureDate} returnDate={returnDate} checkIn={checkIn} checkOut={checkOut} language={language} results={results} />;
}
