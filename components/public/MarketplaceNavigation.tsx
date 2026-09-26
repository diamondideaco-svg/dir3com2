'use client';
import Link from 'next/link';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { marketplaceFamilyDefinitions, type MarketplaceFamilyKey } from '@/lib/marketplace/data';
import { isComingSoonMarketplaceFamily } from '@/lib/marketplace/launch-catalog';
import { discoveryFamilies, discoveryHref } from '@/lib/marketplace/discovery';
import styles from './marketplace-navigation.module.css';

export default function MarketplaceNavigation({ family, search = '' }: { family?: MarketplaceFamilyKey; search?: string }) {
  const { language } = useLanguage(); const ar = language === 'ar';
  return <nav className={styles.nav} aria-label={ar ? 'أقسام السوق' : 'Marketplace sections'}>
    <Link href={discoveryHref(undefined, family, search)} aria-current={!family ? 'page' : undefined}>{ar ? 'السوق' : 'Marketplace'}</Link>
    {discoveryFamilies.map(key => <Link key={key} prefetch={false} href={discoveryHref(key, family, search)} aria-current={family === key ? 'page' : undefined}>
      {marketplaceFamilyDefinitions.find(item => item.key === key)!.label[language]}
      {isComingSoonMarketplaceFamily(key) && <small>{ar ? 'قريبًا' : 'Coming soon'}</small>}
    </Link>)}
  </nav>;
}
