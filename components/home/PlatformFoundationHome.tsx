'use client';

import Link from 'next/link';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const serviceCards = [
  { key: 'drive', ar: 'تنقل', en: 'Drive' },
  { key: 'stay', ar: 'إقامة', en: 'Stay' },
  { key: 'concierge', ar: 'كونسيرج', en: 'Concierge' },
  { key: 'vip', ar: 'VIP', en: 'VIP' },
] as const;

function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-12 w-12 items-center justify-center rounded-[1.4rem] border border-[rgba(212,175,55,0.55)] bg-[linear-gradient(180deg,#f2d78d_0%,#c28e2b_100%)] text-[1.65rem] font-black text-[#08111c] shadow-[0_18px_40px_rgba(212,175,55,0.22)]">
        3
      </div>
      <div className="leading-tight">
        <div className="text-[1.9rem] font-semibold tracking-[-0.03em] text-white">dir3com</div>
        <div className="text-[0.72rem] font-medium tracking-[0.24em] text-[rgba(245,245,245,0.72)]">YOUR SHIELD FOR TOURISM.</div>
      </div>
    </div>
  );
}

function DabraCard({ language }: { language: 'ar' | 'en' }) {
  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-[rgba(212,175,55,0.28)] bg-[linear-gradient(180deg,rgba(10,18,30,0.95)_0%,rgba(7,13,24,0.98)_100%)] p-5 shadow-[0_30px_70px_rgba(0,0,0,0.32)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_12%,rgba(212,175,55,0.15),transparent_38%),radial-gradient(circle_at_20%_80%,rgba(212,175,55,0.08),transparent_26%)]" />
      <div className="relative flex flex-col items-center text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-[1.9rem] border border-[rgba(212,175,55,0.46)] bg-[linear-gradient(180deg,#24150d_0%,#0d1726_100%)] text-[2.1rem] font-black text-[var(--color-gold)] shadow-[0_0_0_8px_rgba(212,175,55,0.08)]">
          3
        </div>
        <div className="mt-4 text-[1.85rem] font-semibold text-white">DABRA</div>
        <div className="mt-1 text-[0.8rem] tracking-[0.24em] text-[rgba(245,245,245,0.72)]">AI CONCIERGE</div>
        <p className="mt-4 max-w-xs text-[0.98rem] leading-8 text-[rgba(245,245,245,0.86)]">
          {language === 'ar'
            ? 'مساعدك الذكي لتنظيم رحلتك وخدمتك بثقة وهدوء.'
            : 'Your calm smart helper for planning travel and service choices.'}
        </p>
        <Link href="/ai/pilot" className={cn(buttonVariants({ variant: 'gold', size: 'lg' }), 'mt-5 w-full justify-center')}>
          {language === 'ar' ? 'تحدث مع الدبرة' : 'Talk to DABRA'}
        </Link>
      </div>
    </div>
  );
}

export default function PlatformFoundationHome() {
  const { language, direction } = useLanguage();

  return (
    <div className="overflow-x-hidden bg-[#08111c] text-white" dir={direction}>
      <section className="relative isolate overflow-hidden px-4 pb-8 pt-4 sm:px-6 lg:px-8 lg:pt-5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_14%,rgba(212,175,55,0.13),transparent_22%),radial-gradient(circle_at_14%_12%,rgba(212,175,55,0.08),transparent_18%),linear-gradient(180deg,#08111c_0%,#07101a_100%)]" />
        <div className="absolute inset-x-0 top-0 h-44 bg-[linear-gradient(120deg,transparent_0%,rgba(212,175,55,0.12)_36%,transparent_72%)] opacity-60" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-[linear-gradient(180deg,transparent_0%,rgba(0,0,0,0.48)_100%)]" />

        <div className="relative mx-auto max-w-[1400px]">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[rgba(212,175,55,0.2)] pb-4">
            <BrandMark />
            <div className="flex flex-wrap items-center gap-2 text-[0.72rem] uppercase tracking-[0.28em] text-[rgba(245,245,245,0.7)]">
              <span className="rounded-full border border-[rgba(212,175,55,0.22)] bg-white/5 px-3 py-2">{language === 'ar' ? 'الرئيسية' : 'Home'}</span>
              <span className="rounded-full border border-[rgba(212,175,55,0.22)] bg-white/5 px-3 py-2">{language === 'ar' ? 'الخدمات' : 'Services'}</span>
              <span className="rounded-full border border-[rgba(212,175,55,0.22)] bg-white/5 px-3 py-2">{language === 'ar' ? 'الدبرة' : 'DABRA'}</span>
              <Link href="/login" className={cn(buttonVariants({ variant: 'gold', size: 'default' }), 'min-h-10')}>{language === 'ar' ? 'دخول / تسجيل' : 'Login / Sign up'}</Link>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="relative overflow-hidden rounded-[2rem] border border-[rgba(212,175,55,0.22)] bg-[linear-gradient(180deg,rgba(8,17,28,0.98)_0%,rgba(10,20,34,0.98)_100%)] p-5 shadow-[0_36px_80px_rgba(0,0,0,0.34)] sm:p-6 lg:p-8">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_20%,rgba(212,175,55,0.14),transparent_26%),radial-gradient(circle_at_30%_0%,rgba(212,175,55,0.1),transparent_18%)]" />
              <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,transparent_0%,rgba(212,175,55,0.7)_50%,transparent_100%)]" />
              <div className="relative grid gap-6 xl:grid-cols-[1.2fr_0.8fr] xl:items-end">
                <div>
                  <p className="text-[0.78rem] font-semibold tracking-[0.34em] text-[var(--color-gold)]">DIR3COM ECOSYSTEM VISION</p>
                  <h1 className="mt-4 max-w-2xl text-[clamp(2.6rem,5vw,5.2rem)] font-semibold leading-[0.95] text-white">
                    {language === 'ar' ? 'كل رحلة تحت الدرع.' : 'Every journey under the shield.'}
                  </h1>
                  <p className="mt-4 max-w-2xl text-[1rem] leading-8 text-[rgba(245,245,245,0.84)] sm:text-[1.08rem]">
                    {language === 'ar'
                      ? 'تصور موحد للويب والتطبيقات بخلفية ليلية كحلية، هوية ذهبية، وخطوط واضحة تقود المستخدم من الاكتشاف إلى القرار.'
                      : 'A unified web and app vision with a night-navy background, gold identity, and clear navigation from discovery to decision.'}
                  </p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <Link href="/services" className={cn(buttonVariants({ variant: 'gold', size: 'lg' }), 'min-w-[170px] justify-center')}>
                      {language === 'ar' ? 'ابدأ رحلتك الآن' : 'Start your journey'}
                    </Link>
                    <Link href="/ai/pilot" className="inline-flex min-h-12 min-w-[170px] items-center justify-center rounded-full border border-[rgba(212,175,55,0.42)] bg-white/5 px-5 text-sm font-semibold text-white transition hover:border-[rgba(212,175,55,0.7)] hover:bg-white/8">
                      {language === 'ar' ? 'استكشف الخدمات' : 'Explore services'}
                    </Link>
                  </div>
                </div>

                <div className="grid gap-4">
                  <div className="overflow-hidden rounded-[2rem] border border-[rgba(212,175,55,0.2)] bg-[linear-gradient(180deg,rgba(10,18,30,0.96)_0%,rgba(8,15,26,0.98)_100%)] p-4">
                    <div className="rounded-[1.5rem] border border-[rgba(212,175,55,0.2)] bg-[radial-gradient(circle_at_50%_16%,rgba(212,175,55,0.12),transparent_40%),linear-gradient(180deg,#09101a_0%,#07101a_100%)] p-4">
                      <div className="flex items-center justify-between text-sm text-[rgba(245,245,245,0.72)]">
                        <span>{language === 'ar' ? 'الدبرة' : 'DABRA'}</span>
                        <span>DABRA AI Concierge</span>
                      </div>
                      <div className="mt-4 flex items-center justify-center">
                        <div className="flex h-28 w-28 items-center justify-center rounded-[2rem] border border-[rgba(212,175,55,0.42)] bg-[linear-gradient(180deg,#1e120c_0%,#09101a_100%)] text-[3rem] font-black text-[var(--color-gold)]">3</div>
                      </div>
                      <p className="mt-4 text-center text-[0.98rem] leading-7 text-[rgba(245,245,245,0.88)]">
                        {language === 'ar'
                          ? 'مساعدك الذكي لتنظيم رحلتك وخدمتك بثقة وهدوء.'
                          : 'Your calm, confident helper for travel and service planning.'}
                      </p>
                    </div>
                  </div>
                  <DabraCard language={language} />
                </div>
              </div>

              <div className="relative mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {serviceCards.map((card, index) => (
                  <div key={card.key} className="rounded-[1.5rem] border border-[rgba(212,175,55,0.18)] bg-[linear-gradient(180deg,rgba(11,20,34,0.92)_0%,rgba(8,15,26,0.96)_100%)] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
                    <div className="text-[0.72rem] font-semibold tracking-[0.28em] text-[var(--color-gold)]">0{index + 1}</div>
                    <div className="mt-3 text-2xl font-semibold text-white">{card.en}</div>
                    <div className="mt-2 text-sm leading-7 text-[rgba(245,245,245,0.78)]">{language === 'ar' ? card.ar : card.en}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4">
              <div className="overflow-hidden rounded-[2rem] border border-[rgba(212,175,55,0.22)] bg-[linear-gradient(180deg,rgba(8,17,28,0.98)_0%,rgba(12,22,36,0.98)_100%)] p-4 sm:p-6">
                <div className="flex items-center justify-between text-sm text-[rgba(245,245,245,0.75)]">
                  <span>{language === 'ar' ? 'دخول التطبيق' : 'App sign-in'}</span>
                  <span>390 × 844</span>
                </div>
                <div className="mt-4 rounded-[2rem] border border-[rgba(212,175,55,0.2)] bg-[linear-gradient(180deg,rgba(5,11,19,0.98)_0%,rgba(8,17,28,0.98)_100%)] p-5 text-center">
                  <div className="mx-auto h-20 w-20 rounded-[1.8rem] border border-[rgba(212,175,55,0.42)] bg-[linear-gradient(180deg,#24150d_0%,#09101a_100%)] text-[2.3rem] font-black text-[var(--color-gold)] flex items-center justify-center">3</div>
                  <div className="mt-5 text-[1.35rem] font-semibold text-white">dir3com</div>
                  <div className="mt-1 text-sm tracking-[0.22em] text-[rgba(245,245,245,0.68)]">{language === 'ar' ? 'درك الحامي للسياحة' : 'Your shield for tourism'}</div>
                  <p className="mt-4 text-sm leading-7 text-[rgba(245,245,245,0.8)]">
                    {language === 'ar' ? 'واجهة الدخول الكحلية المتوافقة مع الهاتف.' : 'A dark, phone-first sign-in experience.'}
                  </p>
                  <Link href="/login" className={cn(buttonVariants({ variant: 'gold', size: 'lg' }), 'mt-5 w-full justify-center')}>
                    {language === 'ar' ? 'تسجيل الدخول' : 'Login'}
                  </Link>
                </div>
              </div>

              <div className="rounded-[2rem] border border-[rgba(212,175,55,0.18)] bg-[linear-gradient(180deg,rgba(9,16,27,0.98)_0%,rgba(12,22,36,0.98)_100%)] p-5">
                <div className="text-[0.78rem] font-semibold tracking-[0.28em] text-[var(--color-gold)]">MOBILE HOMEPAGE</div>
                <div className="mt-3 text-[1.45rem] font-semibold text-white">{language === 'ar' ? 'welcome / اسأل الدبرة' : 'welcome / Ask DABRA'}</div>
                <p className="mt-3 text-sm leading-7 text-[rgba(245,245,245,0.78)]">
                  {language === 'ar' ? 'عرض مخصص للموبايل مع خدمات سريعة، عرض، والرحلات القادمة.' : 'A mobile-oriented layout with quick services, offer card, and upcoming trips.'}
                </p>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  {['Drive', 'Stay', 'Concierge', 'VIP'].map((item) => (
                    <div key={item} className="rounded-[1.3rem] border border-[rgba(212,175,55,0.18)] bg-white/5 px-3 py-4 text-center text-sm font-semibold text-white">{item}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}