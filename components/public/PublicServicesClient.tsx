'use client';

import DynamicServices from '@/components/home/DynamicServices';
import PaymentMethodsSection from '@/components/home/PaymentMethodsSection';
import PartnersShowcase from '@/components/home/PartnersShowcase';
import ShieldOffers from '@/components/home/ShieldOffers';
import MarketplaceExplorer from '@/components/public/MarketplaceExplorer';
import PublicCtaBanner from '@/components/public/PublicCtaBanner';
import PublicFeatureStrip from '@/components/public/PublicFeatureStrip';
import PublicHero from '@/components/public/PublicHero';
import PublicRouteIndex from '@/components/public/PublicRouteIndex';
import PublicStats from '@/components/public/PublicStats';

export default function PublicServicesClient() {
  return (
    <div className="page-stack-shell">
      <PublicHero
        eyebrow="ALL SERVICES"
        title="خدمات dir3com"
        description="واجهة موحدة تعرض كامل الخدمات العامة بنفس الهوية المعتمدة، مع قابلية ربط مباشرة بالكتالوج والمحتوى مستقبلاً."
        highlight="استكشف كل المسارات العامة من صفحة واحدة: بحث، عروض، فئات خدمة، وتفاصيل مصممة بوضوح عربي فاخر."
        chips={['سيارات', 'فنادق', 'شقق', 'مطار', 'كونسيرج', 'تجارب', 'عروض']}
      />
      <div className="luxury-section-shell">
        <PublicStats
          stats={[
            { label: 'الفئات العامة', value: '7' },
            { label: 'مسار موحد', value: 'System' },
            { label: 'جاهزية التوسع', value: 'Production' },
          ]}
        />
      </div>
      <div className="luxury-section-shell">
        <PublicFeatureStrip trustMessage="كل خدمات dir3com تستخدم نفس نظام الثقة، اللغة، والمسارات البصرية." />
      </div>
      <div className="luxury-section-shell">
        <MarketplaceExplorer
          title="سوق الخدمات الديناميكي"
          description="طبقة بيانات مشتركة تربط صفحات الخدمات بالفئات، البحث، الترتيب، والحالات الديناميكية دون أي تغيير في المصادقة أو المدفوعات."
        />
      </div>

      <div className="luxury-section-shell">
        <DynamicServices />
      </div>
      <div className="luxury-section-shell">
        <ShieldOffers />
      </div>
      <div className="luxury-section-shell">
        <PartnersShowcase />
      </div>
      <div className="luxury-section-shell">
        <PaymentMethodsSection />
      </div>
      <div className="luxury-section-shell">
        <PublicRouteIndex />
      </div>
      <div className="luxury-section-shell">
        <PublicCtaBanner
          title="كل الخدمات العامة أصبحت ضمن نظام dir3com نفسه."
          description="هذه الصفحة الآن تتكامل بصرياً مع باقي المنصة العامة وتبقى جاهزة لربط البيانات الحية لاحقاً."
        />
      </div>
    </div>
  );
}