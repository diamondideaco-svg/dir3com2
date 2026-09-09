'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { canonicalServices } from '@/lib/services/canonical';
import styles from './services-overview.module.css';

export default function ServicesOverview() {
  const { language, direction } = useLanguage();
  const ar = language === 'ar';
  return <div className={styles.page} dir={direction} data-services-overview>
    <section className={styles.intro} aria-labelledby="services-title" data-dabra-avoid>
      <h1 id="services-title">{ar ? 'جميع الخدمات' : 'All services'}</h1>
      <p>{ar
        ? 'dir3com تجمع اكتشاف خدمات السفر ومقارنتها وطلبها في واجهة واضحة، مع الدبرة للمساعدة في التخطيط.'
        : 'dir3com brings travel-service discovery, comparison, and requests into one clear interface, with DABRA for planning support.'}</p>
    </section>
    <section className={styles.grid} aria-labelledby="services-title" data-service-families>
      {canonicalServices.map(service => <article key={service.slug} className={styles.card} data-service-card>
        <Image src={service.hero} alt={service.name} width={800} height={450} sizes="(max-width: 640px) 112px, (max-width: 1050px) 45vw, 20vw" />
        <div data-dabra-avoid>
          <h2>{service.name}</h2>
          <p>{ar ? service.descriptionAr : service.descriptionEn}</p>
          <Link href={`/services/${service.slug}`} aria-label={`${ar ? 'اكتشف الخدمة' : 'Explore service'} — ${service.name}`}>
            {ar ? 'اكتشف الخدمة' : 'Explore service'}<span aria-hidden="true">{ar ? '←' : '→'}</span>
          </Link>
        </div>
      </article>)}
    </section>
    <section className={styles.assistance} aria-labelledby="services-assistance-title" data-services-assistance>
      <div data-dabra-avoid><h2 id="services-assistance-title">{ar ? 'الدبرة' : 'DABRA Travel Assistant'}</h2>
        <p>{ar ? 'مساعدك الذكي لتنظيم خيارات الرحلة.' : 'Your smart assistant for organizing trip options.'}</p></div>
      <Link href="/dabra">{ar ? 'اسأل الدبرة' : 'Ask DABRA'}</Link>
    </section>
  </div>;
}
