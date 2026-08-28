import MarketplaceExplorer from '@/components/public/MarketplaceExplorer';
import type { MarketplaceFamilyKey } from '@/lib/marketplace/data';

const allowedFamilies = new Set<MarketplaceFamilyKey>([
  'dir3-drive', 'dir3-stay', 'dir3-fly', 'dir3-concierge', 'dir3-vip',
]);

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const requested = typeof query.family === 'string' ? query.family : undefined;
  const family = allowedFamilies.has(requested as MarketplaceFamilyKey)
    ? requested as MarketplaceFamilyKey
    : undefined;

  return (
    <MarketplaceExplorer
      family={family}
    />
  );
}
