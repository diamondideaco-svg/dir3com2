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
    <div className="pb-24">
      <HomeHero />
      <TrustBar />
      <SmartSearch />
      <ShieldOffers />
      <DynamicServices />
      <PartnersShowcase />
      <TravelTips />
      <ArticlesGrid />
      <PaymentMethodsSection />
      <HomeCta />
      <AppDownload />
    </div>
  );
}