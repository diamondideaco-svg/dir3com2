'use client';

import { FiCreditCard } from 'react-icons/fi';
import AppDownload from '@/components/home/AppDownload';
import ArticlesGrid from '@/components/home/ArticlesGrid';
import DynamicServices from '@/components/home/DynamicServices';
import HomeCta from '@/components/home/HomeCta';
import HomeHero from '@/components/home/HomeHero';
import PartnersShowcase from '@/components/home/PartnersShowcase';
import SectionHeading from '@/components/home/SectionHeading';
import ShieldOffers from '@/components/home/ShieldOffers';
import SmartSearch from '@/components/home/SmartSearch';
import TrustBar from '@/components/home/TrustBar';
import { paymentMethods } from '@/components/home/dir3-home-data';
import { cn } from '@/lib/utils';

export default function PlatformFoundationHome() {
  return (
    <div className="pb-24">
      <HomeHero />
      <TrustBar />
      <SmartSearch />
      <ShieldOffers />
      <DynamicServices />
      <PartnersShowcase />
      <ArticlesGrid />

      <section className="px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[36px] border border-[color:var(--color-border)] bg-white/80 px-6 py-8 shadow-[0_24px_60px_rgba(13,27,42,0.08)] sm:px-8 lg:px-10">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <SectionHeading
              eyebrow="PAYMENTS"
              title="مدفوعات محلية واضحة، وواجهة جاهزة للتوسعة."
              description="الدفع داخل السعودية. مساحة عرض منظمة لوسائل الدفع وربطها مستقبلاً دون تعديل التصميم العام."
            />
            <div className="inline-flex items-center gap-3 rounded-full border border-[var(--color-gold)]/25 bg-[var(--color-gold)]/10 px-4 py-3 text-sm font-medium text-[var(--color-navy)]">
              <FiCreditCard className="text-[var(--color-gold)]" />
              جاهز لسيناريوهات عرض طرق الدفع داخل الواجهة
            </div>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {paymentMethods.map((method) => (
              <div
                key={method}
                className={cn(
                  'rounded-2xl border border-[color:var(--color-border)] bg-[var(--color-shell)] px-4 py-4 text-center text-sm font-semibold text-[var(--color-navy)]',
                  method === 'mada' && 'text-[#1a9b6d]'
                )}
              >
                {method}
              </div>
            ))}
          </div>
        </div>
      </section>
      <HomeCta />
      <AppDownload />
    </div>
  );
}