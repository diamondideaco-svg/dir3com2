'use client';

import { FiArrowUpLeft } from 'react-icons/fi';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import HomeUtilities from '@/components/home/HomeUtilities';
import PartnersTicker from '@/components/shared/PartnersTicker';
import ServiceSearchTable from '@/components/shared/ServiceSearchTable';
import StoriesCarousel from '@/components/shared/StoriesCarousel';
import { partners } from '@/lib/content/partners';
import type { PartnerScope } from '@/lib/content/partners';
import type { TravelStory, TravelStoryService } from '@/lib/content/travel-stories';

type ServicePageConfig = {
  key: TravelStoryService;
  scope: PartnerScope;
  title: { ar: string; en: string };
  eyebrow: string;
  description: { ar: string; en: string };
  heroImage: string;
};

const servicePages: Record<TravelStoryService, ServicePageConfig> = {
  drive: {
    key: 'drive',
    scope: 'drive',
    title: { ar: 'السيارات', en: 'Cars' },
    eyebrow: 'dir3com Drive',
    description: {
      ar: 'تنقلات مختارة، سائقون محترفون، ومسارات واضحة مصممة للضيف المحلي والدولي.',
      en: 'Carefully selected rides, professional drivers, and clear routes built for local and international guests.',
    },
    heroImage: '/brand/runtime/1000467135.png',
  },
  stay: {
    key: 'stay',
    scope: 'stay',
    title: { ar: 'الفنادق', en: 'Hotels' },
    eyebrow: 'dir3com Stay',
    description: {
      ar: 'إقامات راقية مختارة بعناية مع إبراز المزايا والسياسات بوضوح يريح العميل قبل القرار.',
      en: 'Carefully selected stays with amenities and policies presented clearly so the guest can decide with confidence.',
    },
    heroImage: '/brand/runtime/1000467134.png',
  },
  fly: {
    key: 'fly',
    scope: 'fly',
    title: { ar: 'dir3com Fly', en: 'dir3com Fly' },
    eyebrow: 'dir3com Fly',
    description: {
      ar: 'حجوزات رحلات الطيران بأفضل الأسعار.',
      en: 'Flight bookings at clear, competitive rates.',
    },
    heroImage: '/brand/runtime/1000467131.png',
  },
  concierge: {
    key: 'concierge',
    scope: 'concierge',
    title: { ar: 'الكونسيرج', en: 'Concierge' },
    eyebrow: 'dir3com Concierge',
    description: {
      ar: 'تنسيق شخصي للطلبات والمواعيد والتفاصيل الدقيقة في تجربة عربية راقية وسهلة القراءة.',
      en: 'Personal coordination for requests, schedules, and finer details inside a premium Arabic-first experience.',
    },
    heroImage: '/brand/runtime/1000467128 (1).png',
  },
  vip: {
    key: 'vip',
    scope: 'vip',
    title: { ar: 'dir3com VIP', en: 'dir3com VIP' },
    eyebrow: 'dir3com VIP',
    description: {
      ar: 'تجارب استثنائية بمستوى حصري.',
      en: 'Exclusive experiences with premium quality.',
    },
    heroImage: '/brand/runtime/1000467129 (1).png',
  },
};

const relatedServices = [
  { key: 'drive', title: 'dir3com Drive', body: { ar: 'تنقل بسيارات خاصة وسائقين موثوقين.', en: 'Private transport with trusted drivers.' }, href: '/services/drive', image: '/brand/runtime/1000467135.png' },
  { key: 'stay', title: 'dir3com Stay', body: { ar: 'إقامة فاخرة تناسب ميزانيتك.', en: 'Luxury stays aligned with your budget.' }, href: '/services/stay', image: '/brand/runtime/1000467134.png' },
  { key: 'fly', title: 'dir3com Fly', body: { ar: 'حجوزات رحلات الطيران بأفضل الأسعار.', en: 'Flight bookings at clear, competitive rates.' }, href: '/services/fly', image: '/brand/runtime/1000467131.png' },
  { key: 'concierge', title: 'dir3com Concierge', body: { ar: 'مساعد شخصي لتفاصيل الرحلة.', en: 'Personal support for every detail.' }, href: '/services/concierge', image: '/brand/runtime/1000467128 (1).png' },
  { key: 'vip', title: 'dir3com VIP', body: { ar: 'تجارب استثنائية بمستوى حصري.', en: 'Exclusive experiences with premium quality.' }, href: '/services/vip', image: '/brand/runtime/1000467129 (1).png' },
] as const;

export function ServicePageContent({ service, stories }: { service: TravelStoryService; stories: readonly TravelStory[] }) {
  const { language } = useLanguage();
  const page = servicePages[service];
  const related = relatedServices.filter((item) => item.key !== service);

  return (
    <div className="drive-master-page bg-[#fcfaf6] text-[var(--color-navy)]">
      <section className="drive-master-hero px-4 py-10 sm:px-6 lg:px-10">
        <div className="mx-auto grid max-w-7xl items-center gap-8 lg:grid-cols-[1fr_0.9fr]">
          <div>
            <p className="text-xs font-semibold tracking-[0.22em] text-[var(--home-gold)]">{page.eyebrow}</p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-6xl">{page.title[language]}</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[#5d6672]">{page.description[language]}</p>
            <a href="#service-search" className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--home-gold)] px-6 py-3 font-semibold text-white">
              {language === 'ar' ? 'ابدأ البحث' : 'Start search'} <FiArrowUpLeft />
            </a>
          </div>
          <div className="drive-master-hero__image">
            <img src={page.heroImage} alt={page.eyebrow} className="drive-master-hero__asset" />
          </div>
        </div>
      </section>

      <ServiceSearchTable />

      <section className="drive-master-products px-4 py-10 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <p className="text-xs font-semibold tracking-[0.22em] text-[var(--home-gold)]">{page.eyebrow}</p>
          <h2 className="mt-3 text-3xl font-semibold">{page.title[language]}</h2>
          <div className="drive-core-services mt-6">
            {related.map((item) => (
              <article key={item.href} className="drive-core-service-card">
                <a href={item.href} className="drive-core-service-card__media" aria-label={item.title}>
                  <img src={item.image} alt={item.title} />
                </a>
                <div className="drive-core-service-card__body">
                  <h3>{item.title}</h3>
                  <p>{item.body[language]}</p>
                  <a href={item.href} className="drive-core-service-card__cta">{language === 'ar' ? 'عرض الخدمات' : 'Explore services'} <FiArrowUpLeft /></a>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <StoriesCarousel stories={stories} />
      <PartnersTicker partners={partners} scope={page.scope} />
      <HomeUtilities />
    </div>
  );
}