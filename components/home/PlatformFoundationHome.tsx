'use client';

import dynamic from 'next/dynamic';
import HomeCta from '@/components/home/HomeCta';
import HomeHero from '@/components/home/HomeHero';
import PartnersShowcase from '@/components/home/PartnersShowcase';
import ShieldOffers from '@/components/home/ShieldOffers';
import SmartSearch from '@/components/home/SmartSearch';
import TravelTips from '@/components/home/TravelTips';
import TrustBar from '@/components/home/TrustBar';

const DynamicServices = dynamic(() => import('@/components/home/DynamicServices'));
const ArticlesGrid = dynamic(() => import('@/components/home/ArticlesGrid'));
const PaymentMethodsSection = dynamic(() => import('@/components/home/PaymentMethodsSection'));
const AppDownload = dynamic(() => import('@/components/home/AppDownload'));

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