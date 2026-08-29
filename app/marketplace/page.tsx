import MarketplaceExplorer from '@/components/public/MarketplaceExplorer';
import { isMarketplaceFamilyKey } from '@/lib/marketplace/data';

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const requested = typeof query.family === 'string' ? query.family : undefined;
  const family = isMarketplaceFamilyKey(requested) ? requested : undefined;

  return (
    <MarketplaceExplorer
      family={family}
    />
  );
}
