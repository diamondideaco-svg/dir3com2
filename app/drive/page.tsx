import { FiArrowUpLeft } from 'react-icons/fi';
import { permanentRedirect } from 'next/navigation';
import HomeUtilities from '@/components/home/HomeUtilities';
import PartnersTicker from '@/components/shared/PartnersTicker';
import ServiceSearchTable from '@/components/shared/ServiceSearchTable';
import StoriesCarousel from '@/components/shared/StoriesCarousel';
import { getTravelStoriesFeed } from '@/lib/content/travel-stories-feed';
import { partners } from '@/lib/content/partners';

const coreServices = [
  { title: 'dir3com Stay', body: 'إقامة فاخرة تناسب ميزانيتك.', href: '/services/stay', image: '/brand/runtime/1000467134.png' },
  { title: 'dir3com Fly', body: 'حجوزات رحلات الطيران بأفضل الأسعار.', href: '/services/fly', image: '/brand/runtime/1000467131.png' },
  { title: 'dir3com Concierge', body: 'مساعد شخصي لتفاصيل الرحلة.', href: '/services/concierge', image: '/brand/runtime/1000467128 (1).png' },
  { title: 'dir3com VIP', body: 'تجارب استثنائية بمستوى حصري.', href: '/services/vip', image: '/brand/runtime/1000467129 (1).png' },
] as const;

export async function DrivePageContent() {
  const feed = await getTravelStoriesFeed();

  return (
    <div className="drive-master-page bg-[#fcfaf6] text-[var(--color-navy)]">
      <section className="drive-master-hero px-4 py-10 sm:px-6 lg:px-10">
        <div className="mx-auto grid max-w-7xl items-center gap-8 lg:grid-cols-[1fr_0.9fr]">
          <div>
            <p className="text-xs font-semibold tracking-[0.22em] text-[var(--home-gold)]">dir3com Drive</p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-6xl">السيارات</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[#5d6672]">تنقلات مختارة، سائقون محترفون، ومسارات واضحة مصممة للضيف المحلي والدولي.</p>
            <a href="#service-search" className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--home-gold)] px-6 py-3 font-semibold text-white">ابدأ البحث <FiArrowUpLeft /></a>
          </div>
          <div className="drive-master-hero__image">
            <img src="/brand/runtime/1000467135.png" alt="dir3com Drive" className="drive-master-hero__asset" />
          </div>
        </div>
      </section>

      <ServiceSearchTable />

      <section className="drive-master-products px-4 py-10 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <p className="text-xs font-semibold tracking-[0.22em] text-[var(--home-gold)]">dir3 Drive</p>
          <h2 className="mt-3 text-3xl font-semibold">خدمة Drive</h2>
          <div className="drive-core-services mt-6">
            {coreServices.map((service) => (
              <article key={service.title} className="drive-core-service-card">
                <a href={service.href} className="drive-core-service-card__media" aria-label={service.title}>
                  <img src={service.image} alt={service.title} />
                </a>
                <div className="drive-core-service-card__body">
                  <h3>{service.title}</h3>
                  <p>{service.body}</p>
                  <a href={service.href} className="drive-core-service-card__cta">عرض الخدمات <FiArrowUpLeft /></a>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <StoriesCarousel stories={feed.items} service="drive" />
      <PartnersTicker partners={partners} scope="drive" />
      <HomeUtilities />
    </div>
  );
}

export default function LegacyDrivePage() {
  permanentRedirect('/services/drive');
}
