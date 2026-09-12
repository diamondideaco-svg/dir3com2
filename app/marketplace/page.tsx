import MarketplaceExplorer from '@/components/public/MarketplaceExplorer';
import { isMarketplaceFamilyKey } from '@/lib/marketplace/data';
import styles from '@/components/public/marketplace-local.module.css';
import { serializePageQuery } from '@/lib/marketplace/search-context';

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const requested = typeof query.family === 'string' ? query.family : undefined;
  const family = isMarketplaceFamilyKey(requested) ? requested : undefined;
  const liteApiSandboxProof = family === 'dir3-stay' && query.providerProof === 'liteapi';

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
