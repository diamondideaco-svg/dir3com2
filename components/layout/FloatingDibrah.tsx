'use client';

import { motion } from 'framer-motion';
import { HiSparkles } from 'react-icons/hi2';

export default function FloatingDibrah() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.45 }}
      className="fixed bottom-5 left-5 z-50 sm:bottom-8 sm:left-8"
    >
      <button
        type="button"
        id="dibrah"
        aria-label="الدِّبرة - مساعد الرحلات قريباً"
        className="group flex items-center gap-3 rounded-full border border-[var(--color-gold)]/40 bg-[var(--color-navy)] px-3 py-3 text-right text-[var(--color-light)] shadow-[0_24px_50px_rgba(13,27,42,0.28)] transition hover:-translate-y-1"
      >
        <span className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-[linear-gradient(180deg,#f7e9c0_0%,#d4af37_100%)]">
          <span className="absolute top-1 h-3 w-9 rounded-full bg-[#9B1C31] opacity-85" />
          <span className="absolute top-3 h-5 w-10 rounded-b-[14px] rounded-t-sm bg-white/85" />
          <span className="absolute bottom-1 h-5 w-5 rounded-full bg-[#F5D8BF]" />
        </span>
        <span className="flex flex-col">
          <span className="inline-flex items-center gap-2 text-xs text-[var(--color-gold)]">
            <HiSparkles /> مساعد السفر الودود
          </span>
          <span className="text-sm font-semibold">الدِّبرة</span>
          <span className="text-[11px] text-[var(--color-light)]/70">واجهة جاهزة للتكامل المستقبلي</span>
        </span>
      </button>
    </motion.div>
  );
}