'use client';

import dynamic from 'next/dynamic';
import CanonicalServicesGrid from '@/components/public/CanonicalServicesGrid';
import MarketplaceExplorer from '@/components/public/MarketplaceExplorer';
import PublicCtaBanner from '@/components/public/PublicCtaBanner';
import PublicFeatureStrip from '@/components/public/PublicFeatureStrip';
import PublicHero from '@/components/public/PublicHero';
import PublicRouteIndex from '@/components/public/PublicRouteIndex';
import PublicStats from '@/components/public/PublicStats';
import { useLanguage } from '@/components/i18n/LanguageProvider';

const DynamicServices = dynamic(() => import('@/components/home/DynamicServices'));
const ShieldOffers = dynamic(() => import('@/components/home/ShieldOffers'));
const PartnersShowcase = dynamic(() => import('@/components/home/PartnersShowcase'));
const PaymentMethodsSection = dynamic(() => import('@/components/home/PaymentMethodsSection'));

export default function PublicServicesClient() {
  const { language } = useLanguage();
  const isArabic = language === 'ar';
  return (
    <div className="page-stack-shell">
      <PublicHero
        eyebrow={isArabic ? 'كل الخدمات' : 'All services'}
        title={isArabic ? 'خدمات dir3com' : 'dir3com services'}
        description={isArabic ? 'واجهة موحدة تعرض كامل الخدمات العامة بنفس الهوية المعتمدة.' : 'One clear view of every public service within the approved identity.'}
        highlight={isArabic ? 'استكشف كل المسارات العامة من صفحة واحدة: بحث، عروض، فئات خدمة، وتفاصيل واضحة.' : 'Explore every public path from one place: search, offers, categories, and clear service details.'}
        chips={['dir3 Drive', 'dir3 Stay', 'dir3 Fly', 'dir3 Concierge', 'dir3 VIP']}
      />
      <div className="luxury-section-shell">
        <CanonicalServicesGrid />
      </div>
      <div className="luxury-section-shell">
        <PublicStats
          stats={[
            { label: isArabic ? 'الخدمات الأساسية' : 'Core services', value: '5' },
            { label: isArabic ? 'مسار موحد' : 'Unified journey', value: isArabic ? 'موحد' : 'Unified' },
            { label: isArabic ? 'جاهزية التوسع' : 'Growth readiness', value: isArabic ? 'جاهز' : 'Ready' },
          ]}
        />
      </div>
      <div className="luxury-section-shell">
        <PublicFeatureStrip trustMessage={isArabic ? 'كل خدمات dir3com تستخدم نفس نظام الثقة واللغة والمسارات البصرية.' : 'Every dir3com service follows the same trust, language, and visual journey.'} />
      </div>
      <div className="luxury-section-shell">
        <MarketplaceExplorer
          title={isArabic ? 'سوق الخدمات' : 'Service marketplace'}
          description={isArabic ? 'بيانات مشتركة تربط صفحات الخدمات بالفئات والبحث والترتيب.' : 'Shared data connects services with categories, search, and sorting.'}
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
          title={isArabic ? 'كل الخدمات العامة ضمن نظام dir3com نفسه.' : 'Every public service belongs to the same dir3com system.'}
          description={isArabic ? 'تتكامل هذه الصفحة بصرياً مع بقية المنصة العامة.' : 'This page stays visually connected to the rest of the public platform.'}
        />
      </div>
    </div>
  );
}