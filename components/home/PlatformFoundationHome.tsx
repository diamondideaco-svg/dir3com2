'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import HomeUtilities from '@/components/home/HomeUtilities';
import ServiceSearchTable from '@/components/shared/ServiceSearchTable';
import PartnersTicker from '@/components/shared/PartnersTicker';
import StoriesCarousel from '@/components/shared/StoriesCarousel';
import { partners } from '@/lib/content/partners';
import { travelStories } from '@/lib/content/travel-stories';
import { canonicalServices } from '@/lib/services/canonical';

const copy = {
  ar: {
    heroTitle: 'كل رحلة تحت الدرع.',
    heroBody:
      'dir3com تقدم تجربة سفر فاخرة بواجهة واضحة، خدمات موثوقة، ومساعد ذكي يرافقك من أول اكتشاف حتى إتمام الحجز.',
    primaryCta: 'ابدأ رحلتك الآن',
    dabraTitle: 'الدبرة',
    dabraBody: 'مساعدك الذكي لتنظيم رحلتك وخدمتك بثقة.',
    features: ['ثقة وأمان', 'خدمات فاخرة', 'مساعد شخصي', 'تجارب استثنائية'],
    servicesTitle: 'الخدمات الأساسية',
    services: [
      { title: 'dir3com Drive', subtitle: 'تنقل بسيارات خاصة وسائقين موثوقين.', href: '/services/drive', image: '/brand/runtime/1000467135.png' },
      { title: 'dir3com Stay', subtitle: 'إقامة فاخرة تناسب ميزانيتك.', href: '/services/stay', image: '/brand/runtime/1000467134.png' },
      { title: 'dir3com Fly', subtitle: 'حجوزات رحلات الطيران بأفضل الأسعار.', href: '/services/fly', image: '/brand/runtime/1000467131.png' },
      { title: 'dir3com Concierge', subtitle: 'مساعد شخصي لتفاصيل الرحلة.', href: '/services/concierge', image: '/brand/runtime/1000467128 (1).png' },
      { title: 'dir3com VIP', subtitle: 'تجارب استثنائية بمستوى حصري.', href: '/services/vip', image: '/brand/runtime/1000467129 (1).png' },
    ],
    products: [
      { title: 'الحجوزات المرنة', body: 'حجز الفنادق والنقل والخدمات اليومية ضمن مسار موحد.' },
      { title: 'تنسيق الدبرة', body: 'اقتراحات ذكية للخيارات الأنسب بحسب احتياج الرحلة.' },
      { title: 'ضمان التجربة', body: 'شبكة شركاء موثوقين مع متابعة مستمرة أثناء الرحلة.' },
    ],
  },
  en: {
    heroTitle: 'Every journey under the shield.',
    heroBody:
      'dir3com delivers a premium travel journey with clear flows, trusted services, and a smart concierge from discovery to booking.',
    primaryCta: 'Start your journey',
    secondaryCta: 'Explore services',
    dabraTitle: 'DABRA',
    dabraBody: 'Your smart assistant for confident travel planning.',
    features: ['Trust and safety', 'Premium services', 'Personal concierge', 'Exceptional experiences'],
    servicesTitle: 'Core services',
    services: [
      { title: 'dir3com Drive', subtitle: 'Private transport with trusted drivers.', href: '/services/drive', image: '/brand/runtime/1000467135.png' },
      { title: 'dir3com Stay', subtitle: 'Luxury stays aligned with your budget.', href: '/services/stay', image: '/brand/runtime/1000467134.png' },
      { title: 'dir3com Fly', subtitle: 'Flight bookings at clear, competitive rates.', href: '/services/fly', image: '/brand/runtime/1000467131.png' },
      { title: 'dir3com Concierge', subtitle: 'Personal support for every detail.', href: '/services/concierge', image: '/brand/runtime/1000467128 (1).png' },
      { title: 'dir3com VIP', subtitle: 'Exclusive experiences with premium quality.', href: '/services/vip', image: '/brand/runtime/1000467129 (1).png' },
    ],
    products: [
      { title: 'Flexible bookings', body: 'Hotels, transport, and daily services in one unified flow.' },
      { title: 'DABRA guidance', body: 'Smart recommendations aligned with your travel intent.' },
      { title: 'Trusted execution', body: 'Reliable partners with end-to-end trip follow-up.' },
    ],
  },
} as const;

export default function PlatformFoundationHome({
  stories = travelStories,
  useStandardServiceImages = false,
}: {
  stories?: readonly import('@/lib/content/travel-stories').TravelStory[];
  useStandardServiceImages?: boolean;
}) {
  const { language, direction } = useLanguage();
  const t = copy[language];

  return (
    <div id="home" className={`home-identity overflow-x-hidden bg-[#fcfaf6] text-[var(--color-navy)]${useStandardServiceImages ? ' home-identity--standard-services' : ''}`} dir={direction}>
      <section className="bg-[linear-gradient(180deg,#fffdf9_0%,#fcfaf6_76%,#f8f1e6_100%)] px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
        <div className="mx-auto w-full max-w-[1240px] overflow-hidden px-0 sm:px-2 lg:px-10">
          <div className="grid grid-cols-1 items-center gap-6 overflow-hidden lg:grid-cols-[minmax(0,55fr)_minmax(380px,45fr)] lg:gap-8" dir="ltr">
            <div className="flex min-w-0 items-center justify-center" dir={direction}>
              <div className="w-full min-w-0 lg:max-w-[78%]">
                <h1 className="text-[clamp(2.25rem,3.4vw,3.375rem)] font-semibold leading-[1.12] text-[var(--color-navy)]">{t.heroTitle}</h1>
                <p className="mt-4 max-w-[60ch] text-[clamp(1.125rem,1.35vw,1.25rem)] leading-[1.7] text-[#4d5663]">{t.heroBody}</p>

                <p className="mt-4 max-w-[60ch] text-sm leading-7 text-[var(--home-gold)]">{t.dabraTitle} - {t.dabraBody}</p>

                <div className="mt-7 flex flex-wrap items-center gap-4 sm:flex-nowrap lg:gap-4">
                  <Link href="/booking" className={cn(buttonVariants({ variant: 'gold', size: 'lg' }), 'min-h-12 min-w-[196px] justify-center px-7')}>
                    {t.primaryCta}
                  </Link>
                </div>
              </div>
            </div>

            <div className="relative aspect-[4/3] max-h-[360px] overflow-hidden rounded-3xl sm:aspect-[16/10] lg:max-h-[480px]">
              <Image
                src="/brand/runtime/DABRA emoji.png"
                alt="الدبرة"
                fill
                preload
                sizes="(min-width: 1024px) 45vw, 100vw"
                unoptimized
                className="object-cover object-[56%_center]"
              />
            </div>
          </div>

        </div>
      </section>

      <ServiceSearchTable />
      <HomeUtilities />

      <section id="core-services" className="drive-master-products px-4 py-10 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <p className="text-xs font-semibold tracking-[0.22em] text-[var(--home-gold)]">DIR3COM SERVICES</p>
          <h2 className="mt-3 text-3xl font-semibold text-[var(--color-navy)] sm:text-4xl">{t.servicesTitle}</h2>
          <div className="drive-core-services mt-7">
            {canonicalServices.map((service) => (
              <article key={service.slug} className="drive-core-service-card">
                <Link href={`/services/${service.slug}`} className="drive-core-service-card__media" aria-label={service.name}>
                  <Image src={service.hero} alt={service.name} width={800} height={450} sizes="(min-width: 1100px) 25vw, (min-width: 640px) 50vw, 100vw" className="h-full w-full object-cover" />
                </Link>
                <div className="drive-core-service-card__body">
                  <h3>{service.name}</h3>
                  <p>{language === 'ar' ? service.descriptionAr : service.descriptionEn}</p>
                  <Link href={`/services/${service.slug}`} className="drive-core-service-card__cta">
                    {language === 'ar' ? 'اكتشف الخدمة' : 'Explore service'}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <StoriesCarousel stories={stories} />
      <PartnersTicker partners={partners} />

      <div className="h-14" aria-hidden />
    </div>
  );
}
