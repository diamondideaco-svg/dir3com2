'use client';

import Link from 'next/link';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import { FiArrowLeft, FiCheckCircle, FiShield } from 'react-icons/fi';
import { HiSparkles } from 'react-icons/hi2';
import Dir3LogoLockup from '@/components/branding/Dir3LogoLockup';
import { buttonVariants } from '@/components/ui/button';
import { heroHighlights } from '@/components/home/dir3-home-data';
import { fadeUpItem, revealViewport, sectionStagger, softScaleItem, subtleEasing } from '@/components/shared/motion';

export default function HomeHero() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end start'],
  });
  const glowY = useTransform(scrollYProgress, [0, 1], [0, -62]);
  const panelY = useTransform(scrollYProgress, [0, 1], [0, -28]);

  return (
    <section ref={sectionRef} id="home" className="relative isolate overflow-hidden px-4 pb-14 pt-8 sm:px-6 lg:px-8 lg:pb-20 lg:pt-14">
      <div className="identity-skyline-system" aria-hidden="true" />
      <motion.div style={{ y: glowY }} className="absolute inset-x-0 top-0 -z-10 h-[620px] bg-[radial-gradient(circle_at_80%_0%,rgba(212,175,55,0.34),transparent_36%),radial-gradient(circle_at_14%_8%,rgba(13,27,42,0.14),transparent_28%),linear-gradient(180deg,rgba(255,250,239,0.9)_0%,rgba(244,241,232,0)_86%)]" />
      <div className="absolute inset-x-0 top-0 -z-10 h-[560px] bg-[linear-gradient(135deg,rgba(13,27,42,0.09)_0%,rgba(13,27,42,0.02)_36%,rgba(212,175,55,0.15)_100%)]" />
      <motion.div variants={sectionStagger} initial="hidden" animate="visible" className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.04fr_0.96fr] lg:items-center">
        <motion.div variants={sectionStagger}>
          <div className="mb-5 flex justify-center sm:justify-start">
            <Dir3LogoLockup className="hero-lockup-shell" compact reveal />
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-gold)]/25 bg-[var(--color-gold)]/10 px-4 py-2 text-sm font-medium text-[var(--color-gold)]">
            <FiShield /> منصة عربية فاخرة ومحمية
          </span>
          <h1 className="mt-6 max-w-2xl text-4xl font-semibold leading-[1.13] text-[var(--color-navy)] sm:text-6xl lg:text-7xl">
            رحلتكم...
            <span className="mt-2 block font-[var(--font-display)] text-[var(--color-gold)] drop-shadow-[0_8px_28px_rgba(212,175,55,0.2)]">محمية بضمان الدرع.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-[var(--color-muted)] sm:text-lg sm:leading-9 lg:text-xl">
            dir3com تقدم واجهة سفر عربية فاخرة بروح سعودية ولمسة مصرية، جاهزة لاستيعاب التوسع والخدمات الذكية من دون المساس بأي منطق تشغيلي قائم اليوم.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <motion.div whileHover={{ y: -2, scale: 1.015 }} whileTap={{ scale: 0.985 }} transition={{ duration: 0.22, ease: subtleEasing }}>
              <Link href="/booking" className={`${buttonVariants({ variant: 'gold', size: 'lg' })} min-h-12 min-w-[170px] justify-center shadow-[0_14px_35px_rgba(212,175,55,0.28)]`}>
                ابدأ رحلتك
                <FiArrowLeft />
              </Link>
            </motion.div>
            <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.99 }} transition={{ duration: 0.22, ease: subtleEasing }}>
              <a href="#dibrah-section" className={`${buttonVariants({ variant: 'outline', size: 'lg' })} min-h-12 min-w-[190px] justify-center`}>
                <span className="flex flex-col leading-tight">
                  <span>تحتاج مساعدة؟</span>
                  <span>اسأل الدبرة</span>
                </span>
                <HiSparkles />
              </a>
            </motion.div>
          </div>

          <motion.div variants={sectionStagger} className="mt-8 grid gap-3 sm:grid-cols-3">
            {heroHighlights.map((item, index) => (
              <motion.div
                key={item}
                variants={fadeUpItem}
                transition={{ delay: index * 0.05 }}
                className="rounded-[24px] border border-[color:var(--color-border)] bg-white/74 px-4 py-4 text-sm font-medium text-[var(--color-navy)] shadow-[0_16px_35px_rgba(13,27,42,0.08)] backdrop-blur-md"
              >
                <FiCheckCircle className="mb-2 text-[var(--color-gold)]" />
                {item}
              </motion.div>
            ))}
          </motion.div>
        </motion.div>

        <motion.div variants={softScaleItem} viewport={revealViewport} whileInView="visible" initial="hidden" style={{ y: panelY }}>
          <div className="relative overflow-hidden rounded-[36px] border border-[color:var(--color-border)] bg-[linear-gradient(180deg,rgba(13,27,42,0.05)_0%,rgba(13,27,42,0.13)_100%)] p-4 shadow-[0_36px_80px_rgba(13,27,42,0.16)] sm:p-5">
            <div className="identity-gold-arc" aria-hidden="true" />
            <div className="absolute -right-8 top-6 h-28 w-28 rounded-full bg-[var(--color-gold)]/18 blur-3xl" />
            <div className="absolute -left-6 bottom-6 h-24 w-24 rounded-full bg-[var(--color-navy)]/15 blur-3xl" />
            <div className="grid gap-4 sm:grid-cols-[1.1fr_0.9fr]">
              <div className="min-h-[360px] rounded-[30px] bg-[linear-gradient(165deg,#61472b_0%,#d7b561_40%,#0d1b2a_100%)] p-5 text-[var(--color-light)] sm:min-h-[420px] sm:p-6">
                <p className="text-sm text-white/80">Saudi + Egypt feeling</p>
                <p className="mt-4 max-w-xs text-2xl font-semibold leading-tight sm:text-3xl">
                  مشاهد دافئة، استقبال أنيق، وتجربة تشبه السفر مع درع شخصي يرافقك.
                </p>
                <div className="mt-8 grid gap-3 text-sm">
                  <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">الرياض | ضيافة تنفيذية</div>
                  <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">العلا | تجارب مميزة</div>
                  <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">القاهرة | امتداد ثقافي أنيق</div>
                </div>
              </div>
              <div className="flex flex-col gap-4">
                <div className="rounded-[28px] bg-[var(--color-card)] p-5 shadow-[0_18px_45px_rgba(13,27,42,0.08)]">
                  <p className="text-sm text-[var(--color-muted)]">رسالة العلامة</p>
                  <p className="mt-3 text-2xl font-semibold text-[var(--color-navy)]">الخدمة أول... والحساب بعد رضاك.</p>
                </div>
                <div id="dibrah-section" className="flex-1 rounded-[28px] bg-[var(--color-navy)] p-5 text-[var(--color-light)] shadow-[0_22px_55px_rgba(13,27,42,0.18)]">
                  <p className="text-sm text-white/70">واجهة الذكاء المستقبلي</p>
                  <div className="mt-4 flex items-center gap-3">
                    <span className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-[linear-gradient(180deg,#f7e9c0_0%,#d4af37_100%)]">
                      <span className="absolute top-1 h-3 w-9 rounded-full bg-[#9B1C31] opacity-85" />
                      <span className="absolute top-3 h-5 w-10 rounded-b-[14px] rounded-t-sm bg-white/85" />
                      <span className="absolute bottom-1 h-5 w-5 rounded-full bg-[#F5D8BF]" />
                    </span>
                    <div>
                      <p className="font-semibold">الدبرة</p>
                      <p className="text-sm text-white/70">مساعد ودي جاهز للتكامل لاحقاً</p>
                    </div>
                  </div>
                  <p className="mt-6 text-sm leading-7 text-white/72">
                    مساحة مصممة لتستوعب الاقتراحات الذكية والحوارات لاحقاً، من دون تنفيذ أي منطق ذكاء اصطناعي في هذه المرحلة.
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