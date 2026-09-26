import MarketplaceExplorer from '@/components/public/MarketplaceExplorer';
import { isMarketplaceFamilyKey } from '@/lib/marketplace/data';
import styles from '@/components/public/marketplace-local.module.css';
import { serializePageQuery } from '@/lib/marketplace/search-context';
import DriveMarketplace from '@/components/drive/DriveMarketplace';
import StaySandbox from '@/components/stay/StaySandbox';
import { stayDemoEnabled } from '@/lib/marketplace/stay-demo-mode';
import { normalizeStayDemoSearch } from '@/lib/marketplace/stay-demo';

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const requested = typeof query.family === 'string' ? query.family : undefined;
  const family = isMarketplaceFamilyKey(requested) ? requested : undefined;
  const liteApiSandboxProof = family === 'dir3-stay' && query.providerProof === 'liteapi';

  // Preserve explicit legacy searches; the unfiltered entry exposes the canonical Drive catalogue.
  if (family === 'dir3-drive' || (!requested && !query.q && !query.category && !query.service)) return <DriveMarketplace key={serializePageQuery(query)} initialSearch={serializePageQuery(query)} discovery={!family} />;

  if (family === 'dir3-stay' && query.inventory !== 'partners' && stayDemoEnabled()) {
    const search = normalizeStayDemoSearch(serializePageQuery(query));
    return <StaySandbox key={search} initialSearch={search}/>;
  }

  return (
    <div className={styles.page}>
    <MarketplaceExplorer
      key={serializePageQuery(query)}
      initialSearch={serializePageQuery(query)}
      family={family}
      liteApiSandboxProof={liteApiSandboxProof}
      publicNormalization
    />
    </div>
  );
}
