'use client';

import DynamicServices from '@/components/home/DynamicServices';
import ShieldOffers from '@/components/home/ShieldOffers';
import MarketplaceExplorer from '@/components/public/MarketplaceExplorer';
import PublicCtaBanner from '@/components/public/PublicCtaBanner';
import PublicFeatureStrip from '@/components/public/PublicFeatureStrip';
import PublicHero from '@/components/public/PublicHero';
import PublicRouteIndex from '@/components/public/PublicRouteIndex';
import PublicStats from '@/components/public/PublicStats';

export default function PublicServicesClient() {
  return (
    <div className="pb-24">
      <PublicHero
        eyebrow="ALL SERVICES"
        title="خدمات dir3com"
        description="واجهة موحدة تعرض كامل الخدمات العامة بنفس الهوية المعتمدة، مع قابلية ربط مباشرة بالكتالوج والمحتوى مستقبلاً."
        highlight="استكشف كل المسارات العامة من صفحة واحدة: بحث، عروض، فئات خدمة، وتفاصيل مصممة بوضوح عربي فاخر."
        chips={['سيارات', 'فنادق', 'شقق', 'مطار', 'كونسيرج', 'تجارب', 'عروض']}
      />
      <PublicStats
        stats={[
          { label: 'الفئات العامة', value: '7' },
          { label: 'مسار موحد', value: 'System' },
          { label: 'جاهزية التوسع', value: 'Production' },
        ]}
      />
      <PublicFeatureStrip trustMessage="كل خدمات dir3com تستخدم نفس نظام الثقة، اللغة، والمسارات البصرية." />
      <MarketplaceExplorer
        title="سوق الخدمات الديناميكي"
        description="طبقة بيانات مشتركة تربط صفحات الخدمات بالفئات، البحث، الترتيب، والحالات الديناميكية دون أي تغيير في المصادقة أو المدفوعات."
      />

      <DynamicServices />
      <ShieldOffers />
      <PublicRouteIndex />
      <PublicCtaBanner
        title="كل الخدمات العامة أصبحت ضمن نظام dir3com نفسه."
        description="هذه الصفحة الآن تتكامل بصرياً مع باقي المنصة العامة وتبقى جاهزة لربط البيانات الحية لاحقاً."
      />
    </div>
  );
}