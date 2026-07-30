import DynamicServices from '@/components/home/DynamicServices';
import PublicCtaBanner from '@/components/public/PublicCtaBanner';
import PublicFeatureStrip from '@/components/public/PublicFeatureStrip';
import PublicHero from '@/components/public/PublicHero';
import PublicRouteIndex from '@/components/public/PublicRouteIndex';
import PublicStats from '@/components/public/PublicStats';
import type { PublicCategoryConfig } from '@/components/public/public-page-data';

export default function PublicCategoryPage({ config }: { config: PublicCategoryConfig }) {
  return (
    <div className="pb-24">
      <PublicHero
        eyebrow={config.eyebrow}
        title={config.title}
        description={config.description}
        highlight={config.highlight}
        chips={config.chips}
      />
      <PublicStats stats={config.stats} />
      <PublicFeatureStrip trustMessage={config.trustMessage} />
      <DynamicServices title={config.title} description={config.highlight} category={config.slug} />
      <PublicRouteIndex />
      <PublicCtaBanner
        title={`جهز صفحة ${config.title} لتخدم رحلتك التالية.`}
        description="المكونات هنا جاهزة لتوصيل المحتوى والعروض والحجوزات لاحقاً مع الحفاظ على نفس الهوية المعتمدة للمنصة العامة."
      />
    </div>
  );
}