'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { FiArrowLeft, FiCheckCircle, FiShield } from 'react-icons/fi';
import { HiSparkles } from 'react-icons/hi2';
import { buttonVariants } from '@/components/ui/button';
import { heroHighlights } from '@/components/home/dir3-home-data';

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, delay: index * 0.08 },
  }),
};

export default function HomeHero() {
  return (
    <section id="home" className="relative isolate overflow-hidden px-4 pb-12 pt-8 sm:px-6 lg:px-8 lg:pb-18 lg:pt-12">
      <div className="absolute inset-x-0 top-0 -z-10 h-[540px] bg-[radial-gradient(circle_at_top_right,rgba(212,175,55,0.22),transparent_34%),radial-gradient(circle_at_top_left,rgba(13,27,42,0.12),transparent_26%)]" />
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={0}>
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-gold)]/25 bg-[var(--color-gold)]/10 px-4 py-2 text-sm font-medium text-[var(--color-gold)]">
            <FiShield /> منصة عربية فاخرة ومحمية
          </span>
          <h1 className="mt-6 max-w-2xl text-5xl font-semibold leading-[1.15] text-[var(--color-navy)] sm:text-6xl lg:text-7xl">
            رحلتكم...
            <span className="mt-2 block font-[var(--font-display)] text-[var(--color-gold)]">محمية بضمان الدرع.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-9 text-[var(--color-muted)] sm:text-xl">
            dir3com تقدم واجهة سفر عربية فاخرة بروح سعودية ولمسة مصرية، جاهزة لاستيعاب التوسع والخدمات الذكية من دون المساس بأي منطق تشغيلي قائم اليوم.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/booking" className={buttonVariants({ variant: 'gold', size: 'lg' })}>
              ابدأ رحلتك
              <FiArrowLeft />
            </Link>
            <a href="#dibrah-section" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
              الدِّبرة
              <HiSparkles />
            </a>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {heroHighlights.map((item, index) => (
              <motion.div
                key={item}
                initial="hidden"
                animate="visible"
                variants={fadeUp}
                custom={index + 1}
                className="rounded-[24px] border border-[color:var(--color-border)] bg-white/72 px-4 py-4 text-sm font-medium text-[var(--color-navy)] shadow-[0_16px_35px_rgba(13,27,42,0.08)]"
              >
                <FiCheckCircle className="mb-2 text-[var(--color-gold)]" />
                {item}
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={2}>
          <div className="relative overflow-hidden rounded-[36px] border border-[color:var(--color-border)] bg-[linear-gradient(180deg,rgba(13,27,42,0.04)_0%,rgba(13,27,42,0.12)_100%)] p-5 shadow-[0_30px_70px_rgba(13,27,42,0.12)]">
            <div className="absolute -right-8 top-6 h-28 w-28 rounded-full bg-[var(--color-gold)]/18 blur-3xl" />
            <div className="absolute -left-6 bottom-6 h-24 w-24 rounded-full bg-[var(--color-navy)]/15 blur-3xl" />
            <div className="grid gap-4 sm:grid-cols-[1.1fr_0.9fr]">
              <div className="min-h-[420px] rounded-[30px] bg-[linear-gradient(160deg,#60442a_0%,#d6b25a_38%,#0d1b2a_100%)] p-6 text-[var(--color-light)]">
                <p className="text-sm text-white/80">Saudi + Egypt feeling</p>
                <p className="mt-4 max-w-xs text-3xl font-semibold leading-tight">
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
                      <p className="font-semibold">الدِّبرة</p>
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
      </div>
    </section>
  );
}