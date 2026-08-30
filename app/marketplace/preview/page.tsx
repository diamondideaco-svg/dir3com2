import RealMarketplacePreviewClient from '@/components/public/RealMarketplacePreviewClient';
import { getRealMarketplacePreview } from '@/lib/marketplace/real-preview';
import type { PreviewCitySelection } from '@/lib/marketplace/real-preview-contract';

export const dynamic = 'force-dynamic';

function defaultStayDates() {
  const checkIn = new Date();
  checkIn.setUTCDate(checkIn.getUTCDate() + 30);
  const checkOut = new Date(checkIn);
  checkOut.setUTCDate(checkOut.getUTCDate() + 2);
  return {
    checkIn: checkIn.toISOString().slice(0, 10),
    checkOut: checkOut.toISOString().slice(0, 10),
  };
}

export default async function RealMarketplacePreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const defaults = defaultStayDates();
  const city: PreviewCitySelection = query.city === 'Riyadh' || query.city === 'Cairo' ? query.city : 'all';
  const checkIn = typeof query.checkIn === 'string' ? query.checkIn : defaults.checkIn;
  const checkOut = typeof query.checkOut === 'string' ? query.checkOut : defaults.checkOut;
  const result = await getRealMarketplacePreview({ city, checkIn, checkOut });

  return (
    <RealMarketplacePreviewClient
      stays={result.stays}
      events={result.events}
      providers={result.providers}
      search={{ city, checkIn, checkOut }}
      retrievedAt={result.retrievedAt}
    />
  );
}
