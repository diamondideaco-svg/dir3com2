 'use client';

import MarketplaceExplorer from '@/components/public/MarketplaceExplorer';
import { useLanguage } from '@/components/i18n/LanguageProvider';

export default function MarketplacePage() {
  const { language } = useLanguage();
  const isArabic = language === 'ar';

  return (
    <div className="page-stack-shell">
      <MarketplaceExplorer
        title={isArabic ? 'سوق الخدمات' : 'Service marketplace'}
        description={isArabic ? 'اكتشف خدمات dir3com عبر البحث والفئات والترتيب الواضح.' : 'Discover dir3com services through clear search, categories, and sorting.'}
      />
    </div>
  );
}