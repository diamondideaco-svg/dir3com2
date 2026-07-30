'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { HiSparkles } from 'react-icons/hi2';
import { buttonVariants } from '@/components/ui/button';
import { fadeUpItem, revealViewport, sectionStagger, subtleEasing } from '@/components/shared/motion';

export default function HomeCta() {
  return (
    <section id="contact" className="px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <motion.div
        variants={sectionStagger}
        initial="hidden"
        whileInView="visible"
        viewport={revealViewport}
        className="relative isolate mx-auto max-w-7xl overflow-hidden rounded-[42px] border border-[var(--color-gold)]/20 bg-[linear-gradient(135deg,#0D1B2A_0%,#17314A_58%,#D4AF37_168%)] px-6 py-10 text-[var(--color-light)] shadow-[0_34px_74px_rgba(13,27,42,0.24)] sm:px-8 lg:px-12 lg:py-14"
      >
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_82%_16%,rgba(255,255,255,0.2),transparent_28%)]" />
        <div className="grid gap-7 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <motion.div variants={fadeUpItem}>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm text-[var(--color-gold)]">
              <HiSparkles /> الدبرة قريباً داخل رحلتك
            </span>
            <h2 className="mt-5 text-3xl font-semibold leading-[1.25] sm:text-4xl lg:text-[2.7rem]">ابدأ تجربة dir3com الآن، واترك مساحة للذكاء حين يحين وقته.</h2>
            <p className="mt-4 max-w-2xl text-base leading-8 text-white/78 sm:text-lg">
              الصفحة أصبحت جاهزة لتوجيه الزوار، عرض الخدمات، إبراز الثقة، وتقديم دعوات واضحة لاتخاذ القرار من دون إدخال أي منطق غير مطلوب في هذه المرحلة. إذا صار شيء... حنا معك.
            </p>
          </motion.div>

          <motion.div variants={fadeUpItem} className="flex flex-col gap-3 lg:items-end">
            <motion.div whileHover={{ y: -2, scale: 1.015 }} whileTap={{ scale: 0.985 }} transition={{ duration: 0.22, ease: subtleEasing }}>
              <Link href="/booking" className={`${buttonVariants({ variant: 'gold', size: 'lg' })} min-h-12 min-w-[180px] justify-center shadow-[0_14px_35px_rgba(212,175,55,0.3)]`}>
                ابدأ رحلتك
              </Link>
            </motion.div>
            <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.99 }} transition={{ duration: 0.22, ease: subtleEasing }}>
              <Link href="/contact" className={`${buttonVariants({ variant: 'outline', size: 'lg' })} min-h-12 min-w-[180px] justify-center`}>
                تحدث مع فريق dir3com
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}