'use client';

import Image from 'next/image';
import Link from 'next/link';
import { FiArrowUpLeft, FiShield } from 'react-icons/fi';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import HomeUtilities from '@/components/home/HomeUtilities';
import ServiceSearchTable from '@/components/shared/ServiceSearchTable';
import PartnersTicker from '@/components/shared/PartnersTicker';
import StoriesCarousel from '@/components/shared/StoriesCarousel';
import { partners } from '@/lib/content/partners';
import { travelStories } from '@/lib/content/travel-stories';

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
    secondaryCta: 'View services',
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

const standardizedServiceImages: Record<string, string> = {
  '/services/drive': '/brand/runtime/services-generated/dir3com-drive-1600x900.png',
  '/services/stay': '/brand/runtime/services-generated/dir3com-stay-1600x900.png',
  '/services/fly': '/brand/runtime/services-generated/dir3com-fly-1600x900.png',
  '/services/concierge': '/brand/runtime/services-generated/dir3com-concierge-1600x900.png',
  '/services/vip': '/brand/runtime/services-generated/dir3com-vip-1600x900.png',
};

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
      <section className="bg-[linear-gradient(180deg,#fffdf9_0%,#fcfaf6_76%,#f8f1e6_100%)] px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
        <div className="mx-auto w-full max-w-[1240px] overflow-hidden px-0 sm:px-2 lg:px-10">
          <div className="grid grid-cols-1 items-center gap-8 overflow-hidden lg:grid-cols-[minmax(0,1.05fr)_minmax(380px,0.95fr)] lg:gap-10" dir="ltr">
            <div className="flex min-w-0 items-center justify-center" dir={direction}>
              <div className="w-full min-w-0 max-w-[36rem]">
                <h1 className="text-[clamp(2.5rem,3.4vw,3.375rem)] font-semibold leading-[1.12] text-[var(--color-navy)]">{useStandardServiceImages ? (language === 'ar' ? 'خدمات dir3com' : 'dir3com services') : t.heroTitle}</h1>
                <p className="mt-4 max-w-[60ch] text-[clamp(1.0625rem,1.3vw,1.2rem)] leading-[1.7] text-[#4d5663]">{useStandardServiceImages ? (language === 'ar' ? 'ابحث أولاً، ثم استخدم معلومات الطقس والعملات والخريطة قبل استكشاف فئات الخدمة.' : 'Search first, then use weather, currency, and maps before exploring service categories.') : t.heroBody}</p>

                <p className="mt-4 max-w-[60ch] text-sm leading-7 text-[var(--home-gold)]">{t.dabraTitle} - {t.dabraBody}</p>

                <div className="mt-7 flex flex-wrap items-center gap-4 sm:flex-nowrap lg:gap-4">
                  <Link href="/booking" className={cn(buttonVariants({ variant: 'gold', size: 'lg' }), 'min-h-12 min-w-[196px] justify-center px-7')}>
                    {t.primaryCta}
                  </Link>
                </div>
              </div>
            </div>

            <div className="relative aspect-[4/3] max-h-[480px] min-h-[320px] overflow-hidden rounded-3xl border border-[var(--home-gold)]/20 bg-[#f5eee3] sm:aspect-[16/10] lg:aspect-[4/3]">
              <Image
                src="/brand/runtime/DABRA emoji.png"
                alt="الدبرة"
                width={1024}
                height={1024}
                priority
                sizes="(min-width: 1024px) 45vw, 100vw"
                unoptimized
                className="h-full w-full object-cover object-[56%_center]"
              />
            </div>
          </div>

        </div>
      </section>

      <ServiceSearchTable />

      <HomeUtilities />

      <section className="px-4 pb-12 pt-12 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-[1240px] px-0 sm:px-2 lg:px-10">
          <h2 className="text-xs font-semibold tracking-[0.22em] text-[var(--home-gold)]">{t.servicesTitle}</h2>
          <div className="mt-5 grid items-stretch gap-5 md:grid-cols-2 xl:grid-cols-4">
            {t.services.map((service) => (
              <article key={service.title} className="flex h-full flex-col justify-between rounded-2xl border border-[var(--home-gold)]/20 bg-white p-6 text-[var(--color-navy)] shadow-[0_18px_40px_rgba(88,65,31,0.08)]">
                <Link href={service.href} className="home-service-image" aria-label={service.title}>
                  <Image src={useStandardServiceImages ? standardizedServiceImages[service.href] ?? service.image : service.image} alt={service.title} fill sizes="(max-width: 767px) 100vw, (max-width: 1279px) 50vw, 25vw" loading="eager" unoptimized />
                </Link>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-[var(--color-navy)]">{service.title}</h3>
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--home-gold)]/32 bg-[var(--home-gold)]/08 text-[var(--home-gold)]">
                    <FiShield size={16} />
                  </span>
                </div>
                <p className="mt-3 text-sm leading-7 text-[#5d6672]">{service.subtitle}</p>
                <div className="mt-5 inline-flex items-center gap-2 self-start rounded-full border border-[var(--home-gold)]/28 bg-[var(--home-gold)]/08 px-3 py-1.5 text-xs font-medium text-[var(--home-gold)]">
                  <Link href={service.href}>
                    {service.title}
                    <FiArrowUpLeft size={12} />
                  </Link>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            {t.products.map((product, index) => (
              <article key={product.title} className="flex items-start gap-3 rounded-2xl border border-[var(--home-gold)]/20 bg-white/85 p-6 shadow-[0_14px_32px_rgba(88,65,31,0.06)]">
                <span className={`home-premium-icon home-premium-icon--${index + 4}`} aria-hidden="true" />
                <div>
                  <h3 className="text-sm font-semibold tracking-[0.08em] text-[var(--home-gold)]">{product.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-[#5d6672]">{product.body}</p>
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
