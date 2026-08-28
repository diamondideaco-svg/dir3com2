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
import { getCanonicalService } from '@/lib/services/canonical';

type ServicePageConfig = {
  key: TravelStoryService;
  scope: PartnerScope;
  title: { ar: string; en: string };
  eyebrow: string;
  heroImage: string;
};

const servicePages: Record<TravelStoryService, ServicePageConfig> = {
  drive: {
    key: 'drive',
    scope: 'drive',
    title: { ar: 'السيارات', en: 'Cars' },
    eyebrow: 'dir3com Drive',
    heroImage: '/brand/runtime/1000467135.png',
  },
  stay: {
    key: 'stay',
    scope: 'stay',
    title: { ar: 'الفنادق', en: 'Hotels' },
    eyebrow: 'dir3com Stay',
    heroImage: '/brand/runtime/1000467134.png',
  },
  fly: {
    key: 'fly',
    scope: 'fly',
    title: { ar: 'dir3com Fly', en: 'dir3com Fly' },
    eyebrow: 'dir3com Fly',
    heroImage: '/brand/runtime/1000467131.png',
  },
  concierge: {
    key: 'concierge',
    scope: 'concierge',
    title: { ar: 'الكونسيرج', en: 'Concierge' },
    eyebrow: 'dir3com Concierge',
    heroImage: '/brand/runtime/1000467128 (1).png',
  },
  vip: {
    key: 'vip',
    scope: 'vip',
    title: { ar: 'dir3com VIP', en: 'dir3com VIP' },
    eyebrow: 'dir3com VIP',
    heroImage: '/brand/runtime/1000467129 (1).png',
  },
};

const relatedServices = [
  { key: 'drive', title: 'dir3com Drive', href: '/services/drive', image: '/brand/runtime/1000467135.png' },
  { key: 'stay', title: 'dir3com Stay', href: '/services/stay', image: '/brand/runtime/1000467134.png' },
  { key: 'fly', title: 'dir3com Fly', href: '/services/fly', image: '/brand/runtime/1000467131.png' },
  { key: 'concierge', title: 'dir3com Concierge', href: '/services/concierge', image: '/brand/runtime/1000467128 (1).png' },
  { key: 'vip', title: 'dir3com VIP', href: '/services/vip', image: '/brand/runtime/1000467129 (1).png' },
] as const;

export function ServicePageContent({ service, stories }: { service: TravelStoryService; stories: readonly TravelStory[] }) {
  const { language } = useLanguage();
  const page = servicePages[service];
  const canonicalPage = getCanonicalService(service);
  const related = relatedServices.filter((item) => item.key !== service);

  return (
    <div className="drive-master-page bg-[#fcfaf6] text-[var(--color-navy)]">
      <section className="drive-master-hero px-4 py-10 sm:px-6 lg:px-10">
        <div className="mx-auto grid max-w-7xl items-center gap-8 lg:grid-cols-[1fr_0.9fr]">
          <div>
            <p className="text-xs font-semibold tracking-[0.22em] text-[var(--home-gold)]">{page.eyebrow}</p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-6xl">{page.title[language]}</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[#5d6672]">{language === 'ar' ? canonicalPage?.descriptionAr : canonicalPage?.descriptionEn}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#service-search" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--home-gold)] px-6 py-3 font-semibold text-white">
                {language === 'ar' ? 'ابدأ البحث' : 'Start search'} <FiArrowUpLeft />
              </a>
              <a href={`/marketplace?family=dir3-${service}`} className="inline-flex min-h-12 items-center gap-2 rounded-full border border-[var(--home-gold)] px-6 py-3 font-semibold text-[var(--color-navy)]">
                {language === 'ar' ? `تصفح سوق ${page.eyebrow}` : `Browse ${page.eyebrow} marketplace`} <FiArrowUpLeft />
              </a>
            </div>
          </div>
          <div className="drive-master-hero__image">
            <img src={page.heroImage} alt={page.eyebrow} className="drive-master-hero__asset" />
          </div>
        </div>
      </section>

      <ServiceSearchTable initialService={service} />
      <HomeUtilities />

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
                  <p>{language === 'ar' ? getCanonicalService(item.key)?.descriptionAr : getCanonicalService(item.key)?.descriptionEn}</p>
                  <a href={item.href} className="drive-core-service-card__cta">{language === 'ar' ? 'عرض الخدمات' : 'Explore services'} <FiArrowUpLeft /></a>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <StoriesCarousel stories={stories} />
      <PartnersTicker partners={partners} scope={page.scope} />
    </div>
  );
}
