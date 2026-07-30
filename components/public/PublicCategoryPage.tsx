import MarketplaceExplorer from '@/components/public/MarketplaceExplorer';
import PublicCtaBanner from '@/components/public/PublicCtaBanner';
import PublicFeatureStrip from '@/components/public/PublicFeatureStrip';
import PublicHero from '@/components/public/PublicHero';
import PublicRouteIndex from '@/components/public/PublicRouteIndex';
import PublicStats from '@/components/public/PublicStats';
import type { PublicCategoryConfig } from '@/components/public/public-page-data';

export default function PublicCategoryPage({ config }: { config: PublicCategoryConfig }) {
  return (
    <div className="space-y-2 pb-24 sm:space-y-3 lg:space-y-4">
      <PublicHero
        eyebrow={config.eyebrow}
        title={config.title}
        description={config.description}
        highlight={config.highlight}
        chips={config.chips}
      />
      <div className="luxury-section-shell">
        <PublicStats stats={config.stats} />
      </div>
      <div className="luxury-section-shell">
        <PublicFeatureStrip trustMessage={config.trustMessage} />
      </div>
      <div className="luxury-section-shell">
        <MarketplaceExplorer
          title={`${config.title} داخل سوق dir3com`}
          description="نفس البيانات المشتركة تغذي البحث، الترتيب، الفئات، وحالات featured وpopular وrecommended عبر الصفحات العامة."
          family={config.marketplaceFamily}
          defaultCategory={config.marketplaceCategory}
          defaultCollection={config.defaultCollection}
        />
      </div>
      <div className="luxury-section-shell">
        <PublicRouteIndex />
      </div>
      <div className="luxury-section-shell">
        <PublicCtaBanner
          title={`جهز صفحة ${config.title} لتخدم رحلتك التالية.`}
          description="المكونات هنا جاهزة لتوصيل المحتوى والعروض والحجوزات لاحقاً مع الحفاظ على نفس الهوية المعتمدة للمنصة العامة."
        />
      </div>
    </div>
  );
}