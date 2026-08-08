'use client';

import Link from 'next/link';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import { FiArrowLeft, FiCheckCircle, FiShield } from 'react-icons/fi';
import { HiSparkles } from 'react-icons/hi2';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { buttonVariants } from '@/components/ui/button';
import { homeCopy } from '@/components/home/dir3-home-data';
import { fadeUpItem, revealViewport, sectionStagger, softScaleItem, subtleEasing } from '@/components/shared/motion';

export default function HomeHero() {
  const { language, direction } = useLanguage();
  const t = homeCopy[language];
  const sectionRef = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end start'],
  });
  const glowY = useTransform(scrollYProgress, [0, 1], [0, -62]);
  const panelY = useTransform(scrollYProgress, [0, 1], [0, -28]);

  return (
    <section ref={sectionRef} id="home" className="relative isolate overflow-hidden px-4 pb-14 pt-8 sm:px-6 lg:px-8 lg:pb-20 lg:pt-14" dir={direction}>
      <motion.div style={{ y: glowY }} className="absolute inset-x-0 top-0 -z-10 h-[680px] bg-[radial-gradient(circle_at_82%_0%,rgba(200,168,107,0.32),transparent_34%),radial-gradient(circle_at_18%_10%,rgba(157,92,77,0.15),transparent_30%),linear-gradient(180deg,rgba(255,250,242,0.96)_0%,rgba(255,250,242,0)_86%)]" />
      <div className="absolute inset-x-0 top-0 -z-10 h-[560px] bg-[linear-gradient(130deg,rgba(16,32,51,0.07)_0%,rgba(16,32,51,0.01)_36%,rgba(200,168,107,0.11)_100%)]" />
      <motion.div variants={sectionStagger} initial="hidden" animate="visible" className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.04fr_0.96fr] lg:items-center">
        <motion.div variants={sectionStagger}>
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-gold)]/25 bg-[linear-gradient(135deg,rgba(200,168,107,0.18)_0%,rgba(255,255,255,0.6)_100%)] px-4 py-2 text-sm font-medium text-[var(--color-gold)] shadow-[0_14px_34px_rgba(16,32,51,0.08)]">
            <FiShield /> {language === 'ar' ? 'Brand rollout | dir3com' : 'Brand rollout | dir3com'}
          </span>
          <h1 className="mt-6 max-w-2xl text-4xl font-semibold leading-[1.13] text-[var(--color-navy)] sm:text-6xl lg:text-7xl">
            {language === 'ar' ? 'dir3com بهوية' : 'dir3com with a'}
            <span className="mt-2 block font-[var(--font-display)] text-[var(--color-gold)] drop-shadow-[0_8px_28px_rgba(200,168,107,0.22)]">{language === 'ar' ? 'تنفيذية جديدة.' : 'new executive identity.'}</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-[var(--color-muted)] sm:text-lg sm:leading-9 lg:text-xl">
            {language === 'ar' ? 'الواجهة الجديدة تثبّت الاسم الرسمي dir3com وتعيد صياغة الإيقاع البصري للعناوين، البطاقات، والتنقل لتبدو أكثر ثقة ووضوحاً على الجوال وسطح المكتب.' : 'The new surface locks the official dir3com name and reshapes the visual rhythm of titles, cards, and navigation for a clearer, more premium experience on mobile and desktop.'}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-card-strong)] px-4 py-2 text-sm font-medium text-[var(--color-navy)] shadow-[0_12px_28px_rgba(16,32,51,0.07)]">
              {language === 'ar' ? 'درعك الحامي للسياحة.' : 'Your protective shield for tourism.'}
            </span>
            <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-card-strong)] px-4 py-2 text-sm font-medium text-[var(--color-navy)] shadow-[0_12px_28px_rgba(16,32,51,0.07)]">
              {language === 'ar' ? 'RTL / LTR مضبوط' : 'Balanced RTL / LTR'}
            </span>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <motion.div whileHover={{ y: -2, scale: 1.015 }} whileTap={{ scale: 0.985 }} transition={{ duration: 0.22, ease: subtleEasing }}>
              <Link href="/booking" className={`${buttonVariants({ variant: 'gold', size: 'lg' })} min-h-12 min-w-[170px] justify-center shadow-[0_14px_35px_rgba(212,175,55,0.28)]`}>
                {language === 'ar' ? 'ابدأ رحلتك' : 'Start your journey'}
                <FiArrowLeft />
              </Link>
            </motion.div>
            <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.99 }} transition={{ duration: 0.22, ease: subtleEasing }}>
              <a href="#dibrah-section" className={`${buttonVariants({ variant: 'outline', size: 'lg' })} min-h-12 min-w-[190px] justify-center`}>
                <span className="flex flex-col leading-tight">
                  <span>{language === 'ar' ? 'تحتاج مساعدة؟' : 'Need help?'}</span>
                  <span>{language === 'ar' ? 'اسأل الدبرة' : 'Ask DABRA'}</span>
                </span>
                <HiSparkles />
              </a>
            </motion.div>
          </div>

          <motion.div variants={sectionStagger} className="mt-8 grid gap-3 sm:grid-cols-3">
            {t.heroHighlights.map((item, index) => (
              <motion.div
                key={item}
                variants={fadeUpItem}
                transition={{ delay: index * 0.05 }}
                className="rounded-[24px] border border-[color:var(--color-border)] bg-[var(--color-card-strong)] px-4 py-4 text-sm font-medium text-[var(--color-navy)] shadow-[0_16px_35px_rgba(16,32,51,0.08)] backdrop-blur-md"
              >
                <FiCheckCircle className="mb-2 text-[var(--color-gold)]" />
                {item}
              </motion.div>
            ))}
          </motion.div>
        </motion.div>

        <motion.div variants={softScaleItem} viewport={revealViewport} whileInView="visible" initial="hidden" style={{ y: panelY }}>
          <div className="relative overflow-hidden rounded-[36px] border border-[color:var(--color-border)] bg-[linear-gradient(180deg,rgba(16,32,51,0.05)_0%,rgba(16,32,51,0.13)_100%)] p-4 shadow-[0_36px_80px_rgba(16,32,51,0.16)] sm:p-5">
            <div className="absolute -right-8 top-6 h-28 w-28 rounded-full bg-[var(--color-gold)]/18 blur-3xl" />
            <div className="absolute -left-6 bottom-6 h-24 w-24 rounded-full bg-[var(--color-clay)]/18 blur-3xl" />
            <div className="grid gap-4 sm:grid-cols-[1.1fr_0.9fr]">
              <div className="min-h-[360px] rounded-[30px] bg-[linear-gradient(165deg,#9d5c4d_0%,#d7bf92_38%,#102033_100%)] p-5 text-[var(--color-light)] sm:min-h-[420px] sm:p-6">
                <p className="text-sm text-white/80">{language === 'ar' ? 'اللغة الجديدة للعلامة' : 'The new brand language'}</p>
                <p className="mt-4 max-w-xs text-2xl font-semibold leading-tight sm:text-3xl">
                  {language === 'ar' ? 'ألوان أهدأ، طبقات أعمق، وعلامة تبدو أقرب إلى منصة سفر تنفيذية لا مجرد صفحة عرض.' : 'Calmer tones, deeper layers, and a brand that feels closer to an executive travel platform than a simple showcase.'}
                </p>
                <div className="mt-8 grid gap-3 text-sm">
                  <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">{language === 'ar' ? 'Header + Navigation أكثر وضوحاً' : 'Clearer header + navigation'}</div>
                  <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">{language === 'ar' ? 'Buttons + Cards بملمس تنفيذي' : 'Buttons + cards with executive tactility'}</div>
                  <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">{language === 'ar' ? 'Responsive rhythm للجوال وسطح المكتب' : 'Responsive rhythm for mobile and desktop'}</div>
                </div>
              </div>
              <div className="flex flex-col gap-4">
                <div className="rounded-[28px] bg-[var(--color-card-strong)] p-5 shadow-[0_18px_45px_rgba(16,32,51,0.08)]">
                  <p className="text-sm text-[var(--color-muted)]">{language === 'ar' ? 'رسالة العلامة' : 'Brand promise'}</p>
                  <p className="mt-3 text-2xl font-semibold text-[var(--color-navy)]">{language === 'ar' ? 'درعك الحامي للسياحة.' : 'Your protective shield for tourism.'}</p>
                </div>
                <div id="dibrah-section" className="flex-1 rounded-[28px] bg-[linear-gradient(145deg,#102033_0%,#1c3550_62%,#9d5c4d_130%)] p-5 text-[var(--color-light)] shadow-[0_22px_55px_rgba(16,32,51,0.2)]">
                  <p className="text-sm text-white/70">{language === 'ar' ? 'واجهة الذكاء المستقبلي' : 'Future intelligence surface'}</p>
                  <div className="mt-4 flex items-center gap-3">
                    <span className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-[linear-gradient(180deg,#f7e9c0_0%,#d4af37_100%)]">
                      <span className="absolute top-1 h-3 w-9 rounded-full bg-[#9B1C31] opacity-85" />
                      <span className="absolute top-3 h-5 w-10 rounded-b-[14px] rounded-t-sm bg-white/85" />
                      <span className="absolute bottom-1 h-5 w-5 rounded-full bg-[#F5D8BF]" />
                    </span>
                    <div>
                      <p className="font-semibold">DABRA</p>
                      <p className="text-sm text-white/70">{language === 'ar' ? 'واجهة مرئية متوافقة مع الهوية الجديدة' : 'A visual surface aligned with the new identity'}</p>
                    </div>
                  </div>
                  <p className="mt-6 text-sm leading-7 text-white/72">
                    {language === 'ar' ? 'المساحة هنا تحافظ على مكان الدبرة كعنصر بصري مألوف ضمن العلامة، من دون إدخال أي تغيير على المنطق أو طبقات التكامل.' : 'This space keeps DABRA present as a familiar visual element in the brand without introducing any logic or integration changes.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}