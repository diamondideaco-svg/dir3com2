'use client';

import AppDownload from '@/components/home/AppDownload';
import ArticlesGrid from '@/components/home/ArticlesGrid';
import DynamicServices from '@/components/home/DynamicServices';
import HomeCta from '@/components/home/HomeCta';
import HomeHero from '@/components/home/HomeHero';
import PaymentMethodsSection from '@/components/home/PaymentMethodsSection';
import PartnersShowcase from '@/components/home/PartnersShowcase';
import ShieldOffers from '@/components/home/ShieldOffers';
import SmartSearch from '@/components/home/SmartSearch';
import TravelTips from '@/components/home/TravelTips';
import TrustBar from '@/components/home/TrustBar';

export default function PlatformFoundationHome() {
  return (
    <div className="page-stack-shell">
      <HomeHero />
      <div className="luxury-section-shell">
        <TrustBar />
      </div>
      <div className="luxury-section-shell">
        <SmartSearch />
      </div>
      <div className="luxury-section-shell">
        <ShieldOffers />
      </div>
      <div className="luxury-section-shell">
        <DynamicServices />
      </div>
      <div className="luxury-section-shell">
        <PartnersShowcase />
      </div>
      <div className="luxury-section-shell">
        <TravelTips />
      </div>
      <div className="luxury-section-shell">
        <ArticlesGrid />
      </div>
      <div className="luxury-section-shell">
        <PaymentMethodsSection />
      </div>
      <div className="luxury-section-shell">
        <HomeCta />
      </div>
      <div className="luxury-section-shell">
        <AppDownload />
      </div>
    </div>
  );
}