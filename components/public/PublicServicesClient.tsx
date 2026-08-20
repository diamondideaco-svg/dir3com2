'use client';

import dynamic from 'next/dynamic';
import CanonicalServicesGrid from '@/components/public/CanonicalServicesGrid';
import MarketplaceExplorer from '@/components/public/MarketplaceExplorer';
import PublicCtaBanner from '@/components/public/PublicCtaBanner';
import PublicFeatureStrip from '@/components/public/PublicFeatureStrip';
import PublicHero from '@/components/public/PublicHero';
import PublicRouteIndex from '@/components/public/PublicRouteIndex';
import PublicStats from '@/components/public/PublicStats';

const DynamicServices = dynamic(() => import('@/components/home/DynamicServices'));
const ShieldOffers = dynamic(() => import('@/components/home/ShieldOffers'));
const PartnersShowcase = dynamic(() => import('@/components/home/PartnersShowcase'));
const PaymentMethodsSection = dynamic(() => import('@/components/home/PaymentMethodsSection'));

export default function PublicServicesClient() {
  return (
    <div className="page-stack-shell">
      <PublicHero
        eyebrow="ALL SERVICES"
        title="خدمات dir3com"
        description="واجهة موحدة تعرض كامل الخدمات العامة بنفس الهوية المعتمدة، مع قابلية ربط مباشرة بالكتالوج والمحتوى مستقبلاً."
        highlight="استكشف كل المسارات العامة من صفحة واحدة: بحث، عروض، فئات خدمة، وتفاصيل مصممة بوضوح عربي فاخر."
        chips={['dir3 Drive', 'dir3 Stay', 'dir3 Fly', 'dir3 Concierge', 'dir3 VIP']}
      />
      <div className="luxury-section-shell">
        <CanonicalServicesGrid />
      </div>
      <div className="luxury-section-shell">
        <PublicStats
          stats={[
            { label: 'الخدمات الأساسية', value: '5' },
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