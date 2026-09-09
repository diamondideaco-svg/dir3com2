'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { FiSearch, FiArrowUpRight } from 'react-icons/fi';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import ServiceSearchTable from '@/components/shared/ServiceSearchTable';
import { canonicalServices } from '@/lib/services/canonical';
import homeStyles from '@/components/home/home-production.module.css';
import HomeUtilities from '@/components/home/HomeUtilities';
import StoriesCarousel from '@/components/shared/StoriesCarousel';
import PartnersTicker from '@/components/shared/PartnersTicker';
import { partners } from '@/lib/content/partners';
import { travelStories } from '@/lib/content/travel-stories';

export type ApprovedVisualKey = 'home' | 'drive' | 'fly' | 'concierge' | 'vip' | 'stay';

const approvedHomeCopy = {
  ar: {
    journey: <>من فكرة السفرة ....<br />إلى سلامة الرجعة .</>,
    book: 'احجز الآن',
    explore: 'استكشف',
    search: 'البحث',
    plan: 'خطط مع الدبرة',
    services: 'الخدمات الأساسية',
    close: 'إغلاق البحث',
  },
  en: {
    journey: <>From planning the journey...<br />to returning safely.</>,
    book: 'Book now',
    explore: 'Explore',
    search: 'Search',
    plan: 'Plan with DABRA',
    services: 'Core services',
    close: 'Close search',
  },
} as const;

const approvedVisuals: Record<ApprovedVisualKey, {
  src: string;
  width: number;
  height: number;
  alt: { ar: string; en: string };
}> = {
  home: {
    src: '/brand/dir3com-home-page-approved.png',
    width: 1672,
    height: 941,
    alt: { ar: 'الصفحة الرئيسية المعتمدة لمنصة dir3com', en: 'Approved dir3com home page' },
  },
  drive: {
    src: '/brand/approved-web/03_DRIVE_FINAL_APPROVED.png',
    width: 1122,
    height: 1402,
    alt: { ar: 'صفحة درع Drive المعتمدة', en: 'Approved Dir3 Drive page' },
  },
  fly: {
    src: '/brand/approved-web/04_FLY_FINAL_APPROVED.png',
    width: 1024,
    height: 1536,
    alt: { ar: 'صفحة درع Fly المعتمدة', en: 'Approved Dir3 Fly page' },
  },
  concierge: {
    src: '/brand/approved-web/05_CONCIERGE_FINAL_APPROVED.png',
    width: 1086,
    height: 1448,
    alt: { ar: 'صفحة درع Concierge المعتمدة', en: 'Approved Dir3 Concierge page' },
  },
  vip: {
    src: '/brand/approved-web/06_VIP_FINAL_APPROVED.png',
    width: 1122,
    height: 1402,
    alt: { ar: 'صفحة درع VIP المعتمدة', en: 'Approved Dir3 VIP page' },
  },
  stay: {
    src: '/brand/approved-web/07_STAY_FINAL_APPROVED.png',
    width: 1448,
    height: 1086,
    alt: { ar: 'صفحة درع Stay المعتمدة', en: 'Approved Dir3 Stay page' },
  },
};

export default function ApprovedVisualPage({ page }: { page: ApprovedVisualKey }) {
  const { language, direction } = useLanguage();
  const visual = approvedVisuals[page];
  const homeCopy = approvedHomeCopy[language];
  const [searchOpen, setSearchOpen] = useState(false);
  const searchPanel = useRef<HTMLDivElement>(null);
  const searchTrigger = useRef<HTMLButtonElement>(null);

  function openHomeSearch() {
    setSearchOpen(true);
    requestAnimationFrame(() => {
      searchPanel.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
      searchPanel.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    });
  }

  return (
    <main className={`approved-visual-page${page === 'home' ? ` ${homeStyles.home}` : ''}`} dir={direction} data-approved-page={page}>
      <h1 className="sr-only">{visual.alt[language]}</h1>

      <div className="approved-visual-frame">
        <div className="approved-visual-viewport">
          <div className="approved-visual-canvas">
        {page === 'home' ? (
          <>
            <video
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              className="approved-visual-video"
              aria-hidden="true"
            >
              <source src="/brand/home/dir3com-home-hero.cropped.web.mp4" type="video/mp4" />
            </video>
            <div className="approved-home-hero-copy" dir={direction}>
              <h1><span>dir3com</span></h1>
              <p>{homeCopy.journey}</p>
              <div className="approved-home-hero-actions">
                <Link href="/login?redirect=%2Fbooking&next=%2Fbooking">{homeCopy.book}</Link>
                <Link href="#home-services-title">{homeCopy.explore}</Link>
              </div>
              <div className={homeStyles.entry} data-home-search-entry>
                <button ref={searchTrigger} type="button" aria-expanded={searchOpen} aria-controls="home-search-panel" onClick={openHomeSearch}><FiSearch aria-hidden="true" />{homeCopy.search}</button>
                <Link href="/dabra">{homeCopy.plan}<FiArrowUpRight aria-hidden="true" /></Link>
              </div>
            </div>
          </>
        ) : (
          <Image
            src={visual.src}
            width={visual.width}
            height={visual.height}
            alt={visual.alt[language]}
            sizes={`(max-width: ${visual.width}px) 100vw, ${visual.width}px`}
            loading="eager"
            fetchPriority="high"
            unoptimized
            className="approved-visual-image"
          />
        )}
        {page !== 'home' ? (
          <Link
            href="/booking"
            className="approved-visual-hotspot approved-visual-hotspot--booking"
            aria-label={language === 'ar' ? 'ابدأ رحلتك الآن' : 'Start your journey'}
          />
        ) : null}
          </div>
        </div>
        {page !== 'home' ? <Link
          href="/dabra"
          className="approved-visual-hotspot approved-visual-hotspot--dabra"
          aria-label={language === 'ar' ? 'تحدث مع DABRA PRIME' : 'Talk to DABRA PRIME'}
        /> : null}
      </div>
      {page === 'home' && <>
        <section className={homeStyles.services} aria-labelledby="home-services-title" data-home-services>
          <h2 id="home-services-title">{homeCopy.services}</h2>
          <div className={homeStyles.serviceGrid}>{canonicalServices.map(service => <Link key={service.slug} href={`/services/${service.slug}`} className={homeStyles.service}>
            <Image src={service.hero} alt="" width={800} height={450} sizes="(max-width: 640px) 100vw, (max-width: 1050px) 50vw, 20vw" />
            <div><h3>{service.name}</h3><p>{language === 'ar' ? service.descriptionAr : service.descriptionEn}</p><span>{homeCopy.explore}<FiArrowUpRight aria-hidden="true" /></span></div>
          </Link>)}</div>
        </section>
        <div id="home-search-panel" ref={searchPanel} className={homeStyles.searchPanel} hidden={!searchOpen}>
          <button type="button" className={homeStyles.close} onClick={() => { setSearchOpen(false); searchTrigger.current?.focus(); }}>{homeCopy.close}</button>
          <ServiceSearchTable />
        </div>
        <HomeUtilities homePresentation />
        <StoriesCarousel stories={travelStories} homeDiscovery />
        <PartnersTicker partners={partners} homePresentation />
      </>}
    </main>
  );
}
