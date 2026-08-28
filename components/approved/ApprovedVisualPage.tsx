'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import ServiceSearchTable from '@/components/shared/ServiceSearchTable';

export type ApprovedVisualKey = 'home' | 'drive' | 'fly' | 'concierge' | 'vip' | 'stay';

const approvedHomeCopy = {
  ar: {
    journey: <>من فكرة السفرة ....<br />إلى سلامة الرجعة .</>,
    book: 'احجز الآن',
    explore: 'استكشف',
  },
  en: {
    journey: <>From planning the journey...<br />to returning safely.</>,
    book: 'Book now',
    explore: 'Explore',
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

  return (
    <main className="approved-visual-page" dir={direction} data-approved-page={page}>
      <h1 className="sr-only">{visual.alt[language]}</h1>

      {page === 'home' ? <ServiceSearchTable /> : null}

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
              <source src="/brand/home/dir3com-home-hero.web.mp4" type="video/mp4" />
            </video>
            <div className="approved-home-hero-copy" dir={direction}>
              <h1><span>dir3com</span></h1>
              <p>{homeCopy.journey}</p>
              <div className="approved-home-hero-actions">
                <Link href="/login?redirect=%2Fbooking&next=%2Fbooking">{homeCopy.book}</Link>
                <Link href="/services">{homeCopy.explore}</Link>
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
    </main>
  );
}
