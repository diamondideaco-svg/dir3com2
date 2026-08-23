'use client';

import MarketplaceExplorer from '@/components/public/MarketplaceExplorer';
import PublicCtaBanner from '@/components/public/PublicCtaBanner';
import PublicFeatureStrip from '@/components/public/PublicFeatureStrip';
import PublicHero from '@/components/public/PublicHero';
import PublicRouteIndex from '@/components/public/PublicRouteIndex';
import PublicStats from '@/components/public/PublicStats';
import type { PublicCategoryConfig } from '@/components/public/public-page-data';
import { useLanguage } from '@/components/i18n/LanguageProvider';

const englishCopy: Record<string, { title: string; eyebrow: string; description: string; highlight: string; chips: string[]; stats: string[]; trust: string }> = {
  cars: { title: 'Cars', eyebrow: 'DIR3 DRIVE', description: 'Premium transport, professional drivers, and a smooth journey designed to begin calmly and end with confidence.', highlight: 'A protected transport service for business trips, families, and refined hospitality across Saudi Arabia.', chips: ['Private driver', 'Airport pickup', 'Executive cars'], stats: ['Readiness level', 'Coverage cities', 'Protected routes'], trust: 'Your journey is supported by clear service and responsive communication before and during the trip.' },
  hotels: { title: 'Hotels', eyebrow: 'DIR3 STAY', description: 'Thoughtfully selected stays with clear amenities and policies to make every decision feel easy.', highlight: 'A refined hotel experience ready for connected inventory and dynamic offers.', chips: ['Luxury stays', 'Flexible booking', 'Family options'], stats: ['Stay options', 'Key cities', 'Trusted experience'], trust: 'Service transparency comes before payment, and comfort begins with clear details.' },
  apartments: { title: 'Apartments', eyebrow: 'DIR3 STAY · APARTMENTS', description: 'Short and extended stays with privacy, space, and practical comfort for families and groups.', highlight: 'A flexible way to discover serviced apartments and longer stays within the dir3com identity.', chips: ['Serviced apartments', 'Extended stay', 'More privacy'], stats: ['Stay styles', 'Families and groups', 'Clear review'], trust: 'The right space is presented clearly, with flexibility that respects your comfort and time.' },
  'airport-transfers': { title: 'Airport transfers', eyebrow: 'DIR3 FLY', description: 'Smooth arrivals and departures with a calm, coordinated experience from the first detail.', highlight: 'An airport service built as a complete experience inside dir3com, with the shield as a promise of confidence.', chips: ['Meet and greet', 'Fast lane', 'Arrival coordination'], stats: ['Response time', 'Arrival point', 'Service coverage'], trust: 'Arrivals and departures need complete clarity, and the experience starts there.' },
  concierge: { title: 'Concierge', eyebrow: 'DIR3 CONCIERGE', description: 'Personal coordination for requests, appointments, and the details that shape a refined journey.', highlight: 'A foundation for tailored requests and VIP relationships without operational complexity.', chips: ['Personal assistant', 'VIP', 'Daily follow-up'], stats: ['Service style', 'Personalization', 'Ready experience'], trust: 'Every special request deserves calm, clarity, and thoughtful attention.' },
  experiences: { title: 'Experiences', eyebrow: 'CATALOG · EXPERIENCES', description: 'Selected cultural and leisure experiences with clean presentation and considered detail.', highlight: 'A flexible foundation for seasonal experiences and changing events.', chips: ['Culture', 'Events', 'Private trips'], stats: ['Selected experiences', 'Active seasons', 'Flexible display'], trust: 'A memorable experience does not need noise; it needs a respectful, convincing presentation.' },
  offers: { title: 'Offers', eyebrow: 'CATALOG · OFFERS', description: 'Seasonal and executive offers that present value clearly and keep the language of trust.', highlight: '', chips: ['Seasonal', 'Executive', 'Family'], stats: ['Featured offers', 'Growth readiness', 'Value clarity'], trust: 'A good offer explains its value first and stays transparent to the end.' },
};

function present(value: string | { ar: string; en: string }, language: 'ar' | 'en', english?: string) {
  return language === 'en' && english ? english : typeof value === 'string' ? value : value[language];
}

export default function PublicCategoryPage({ config }: { config: PublicCategoryConfig }) {
  const { language } = useLanguage();
  const en = englishCopy[config.slug];
  const stats = config.stats.map((stat, index) => ({ label: present(stat.label, language, en?.stats[index]), value: stat.value }));
  return (
    <div className="page-stack-shell">
      <PublicHero
        eyebrow={present(config.eyebrow, language, en?.eyebrow)}
        title={present(config.title, language, en?.title)}
        description={present(config.description, language, en?.description)}
        highlight={config.slug === 'offers' ? '' : present(config.highlight, language, en?.highlight)}
        chips={config.chips.map((chip, index) => present(chip, language, en?.chips[index]))}
      />
      <div className="luxury-section-shell">
        <PublicStats stats={stats} />
      </div>
      <div className="luxury-section-shell">
        <PublicFeatureStrip trustMessage={present(config.trustMessage, language, en?.trust)} />
      </div>
      <div className="luxury-section-shell">
        <MarketplaceExplorer
          title={`${present(config.title, language, en?.title)} ${language === 'ar' ? 'داخل سوق dir3com' : 'in the dir3com marketplace'}`}
          description={config.slug === 'offers' ? '' : language === 'ar' ? 'نفس البيانات المشتركة تغذي البحث والترتيب والفئات عبر الصفحات العامة.' : 'Shared data powers search, sorting, and category discovery across the public pages.'}
          family={config.marketplaceFamily}
          defaultCategory={config.marketplaceCategory}
          defaultCollection={config.defaultCollection}
        />
      </div>
      {config.slug !== 'offers' ? <div className="luxury-section-shell"><PublicRouteIndex /></div> : null}
      {config.slug !== 'offers' ? <div className="luxury-section-shell">
        <PublicCtaBanner
          title={language === 'ar' ? `جهز صفحة ${present(config.title, language, en?.title)} لتخدم رحلتك التالية.` : `Prepare your ${present(config.title, language, en?.title).toLowerCase()} page for your next journey.`}
          description={language === 'ar' ? 'المكونات هنا جاهزة لتوصيل المحتوى والعروض والحجوزات مع الحفاظ على الهوية المعتمدة.' : 'These components are ready for content, offers, and bookings within the approved identity.'}
        />
      </div> : null}
    </div>
  );
}
