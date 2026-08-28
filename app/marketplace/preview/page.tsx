import RealMarketplacePreviewClient from '@/components/public/RealMarketplacePreviewClient';
import { getRealFlightPreview } from '@/lib/marketplace/real-preview';

export const dynamic = 'force-dynamic';

function futureDate() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 30);
  return date.toISOString().slice(0, 10);
}

export default async function RealMarketplacePreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const from = typeof query.from === 'string' ? query.from.toUpperCase() : 'RUH';
  const to = typeof query.to === 'string' ? query.to.toUpperCase() : 'JED';
  const departureDate = typeof query.date === 'string' ? query.date : futureDate();
  const language = query.lang === 'en' ? 'en' : 'ar';
  const countryCode = query.country === 'EG' ? 'EG' : 'SA';
  const result = await getRealFlightPreview({ from, to, departureDate, language, countryCode });
  return <RealMarketplacePreviewClient offers={result.offers} stays={result.stays} events={result.events} dabraContext={result.dabraContext} search={{ from, to, departureDate, countryCode }} />;
}
