'use client';

import { motion, useAnimationControls } from 'framer-motion';
import { useCallback, useEffect } from 'react';
import SectionHeading from '@/components/home/SectionHeading';
import { partnerCards } from '@/components/home/dir3-home-data';
import { fadeUpItem, revealViewport, softScaleItem } from '@/components/shared/motion';

export default function PartnersShowcase() {
  const marqueeItems = [...partnerCards, ...partnerCards];
  const controls = useAnimationControls();

  const startMarquee = useCallback(() => {
    controls.start({
      x: ['0%', '-50%'],
      transition: {
        duration: 28,
        ease: 'linear',
        repeat: Number.POSITIVE_INFINITY,
      },
    });
  }, [controls]);

  useEffect(() => {
    startMarquee();
  }, [startMarquee]);

  return (
    <section id="about" className="px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="PARTNERS"
          title="شركاء مختارون ليظهروا الجودة قبل الكم."
          description="مساحة شراكات مرنة لعرض الجهات الموثوقة وتفاصيل التغطية والمدن ومستوى Shield readiness داخل الهوية نفسها."
        />

        <motion.div variants={softScaleItem} initial="hidden" whileInView="visible" viewport={revealViewport} className="mt-8 overflow-hidden rounded-[36px] border border-[color:var(--color-border)] bg-[linear-gradient(160deg,rgba(255,255,255,0.86)_0%,rgba(248,244,236,0.76)_100%)] p-4 shadow-[0_24px_54px_rgba(13,27,42,0.1)] sm:p-6">
          <div
            className="group relative overflow-hidden rounded-[28px] border border-[var(--color-gold)]/18 bg-[var(--color-surface-strong)]/2 py-4"
            onMouseEnter={() => controls.stop()}
            onMouseLeave={startMarquee}
          >
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-[linear-gradient(90deg,rgba(248,244,236,0.92)_0%,transparent_100%)]" />
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-[linear-gradient(270deg,rgba(248,244,236,0.92)_0%,transparent_100%)]" />
            <motion.div
              className="flex w-max gap-4 sm:gap-5"
              animate={controls}
            >
              {marqueeItems.map((partner, index) => (
                <motion.article
                  key={`${partner.name}-${index}`}
                  variants={fadeUpItem}
                  className="w-[250px] shrink-0 rounded-[24px] border border-white/25 bg-[linear-gradient(165deg,rgba(255,255,255,0.92)_0%,rgba(247,241,227,0.72)_100%)] px-4 py-4 shadow-[0_14px_32px_rgba(13,27,42,0.08)] backdrop-blur-sm sm:w-[290px] sm:px-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-[var(--color-navy)] sm:text-xl">{partner.name}</p>
                      <p className="mt-1 text-sm text-[var(--color-muted)]">{partner.city}</p>
                    </div>
                    <span className="rounded-full border border-[var(--color-gold)]/24 bg-[var(--color-gold)]/12 px-3 py-1.5 text-xs font-semibold text-[var(--color-gold)]">
                      {partner.score}
                    </span>
                  </div>
                  <div className="mt-5 rounded-[18px] bg-[var(--color-surface)] px-3 py-3 text-sm text-[var(--color-navy)]">{partner.specialty}</div>
                </motion.article>
              ))}
            </motion.div>
          </div>
          <p className="mt-4 text-center text-xs text-[var(--color-muted)] sm:text-sm">حركة سلسة لا نهائية مع إيقاف تلقائي عند التحويم.</p>
        </motion.div>
      </div>
    </section>
  );
}