'use client';

import { motion } from 'framer-motion';
import { HiSparkles } from 'react-icons/hi2';
import { subtleEasing } from '@/components/shared/motion';

export default function FloatingDibrah() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.45, ease: subtleEasing }}
      whileHover={{ y: -2 }}
      className="fixed bottom-5 left-5 z-50 sm:bottom-8 sm:left-8"
    >
      <button
        type="button"
        id="dibrah"
        title="اسأل الدبرة"
        aria-label="الدبرة"
        className="group relative flex min-h-14 items-center gap-3 overflow-hidden rounded-full border border-[var(--color-gold)]/40 bg-[linear-gradient(150deg,#0d1b2a_0%,#163149_100%)] px-3 py-3 text-right text-[var(--color-light)] shadow-[0_26px_56px_rgba(13,27,42,0.3)] transition"
      >
        <span className="pointer-events-none absolute -left-4 top-1/2 h-12 w-12 -translate-y-1/2 rounded-full bg-[var(--color-gold)]/20 blur-2xl" />
        <span className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-[linear-gradient(180deg,#f7e9c0_0%,#d4af37_100%)]">
          <span className="absolute top-1 h-3 w-9 rounded-full bg-[#9B1C31] opacity-85" />
          <span className="absolute top-3 h-5 w-10 rounded-b-[14px] rounded-t-sm bg-white/85" />
          <span className="absolute bottom-1 h-5 w-5 rounded-full bg-[#F5D8BF]" />
        </span>
        <span className="hidden flex-col sm:flex">
          <span className="inline-flex items-center gap-2 text-xs text-[var(--color-gold)]">
            <HiSparkles /> مساعد السفر الودود
          </span>
          <span className="text-sm font-semibold">الدبرة</span>
          <span className="text-[11px] text-[var(--color-light)]/70">اسأل الدبرة</span>
        </span>
      </button>
    </motion.div>
  );
}