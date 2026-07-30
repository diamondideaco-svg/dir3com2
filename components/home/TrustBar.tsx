'use client';

import { motion } from 'framer-motion';
import { FiCreditCard, FiHeadphones, FiLock, FiShield } from 'react-icons/fi';
import { trustBarItems } from '@/components/home/dir3-home-data';
import { fadeUpItem, revealViewport, sectionStagger, subtleEasing } from '@/components/shared/motion';

const trustIcons = [FiShield, FiCreditCard, FiHeadphones, FiLock];

export default function TrustBar() {
  return (
    <section className="px-4 pb-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-[36px] border border-[color:var(--color-border)] bg-[linear-gradient(155deg,rgba(13,27,42,0.98)_0%,rgba(18,37,56,0.95)_75%,rgba(212,175,55,0.2)_160%)] p-4 text-[var(--color-light)] shadow-[0_28px_70px_rgba(13,27,42,0.24)] sm:p-6">
        <div className="mb-5 rounded-[24px] border border-[var(--color-gold)]/30 bg-[var(--color-gold)]/12 px-5 py-4 text-center text-base font-semibold text-[var(--color-light)] sm:text-xl">
          رحلتكم محمية بضمان الدرع.
        </div>
        <motion.div variants={sectionStagger} initial="hidden" whileInView="visible" viewport={revealViewport} className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-4">
        {trustBarItems.map((item, index) => (
          <motion.div
            key={item}
            variants={fadeUpItem}
            transition={{ delay: index * 0.05 }}
            whileHover={{ y: -5, scale: 1.01, transition: { duration: 0.22, ease: subtleEasing } }}
            className="rounded-[24px] border border-white/12 bg-[linear-gradient(165deg,rgba(255,255,255,0.14)_0%,rgba(255,255,255,0.04)_100%)] px-4 py-4 shadow-[0_18px_35px_rgba(0,0,0,0.2)] backdrop-blur-md sm:px-5 sm:py-5"
          >
            <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(180deg,#f6e6be_0%,#d4af37_100%)] text-[var(--color-navy)] shadow-[0_10px_20px_rgba(212,175,55,0.32)]">
              {(() => {
                const Icon = trustIcons[index % trustIcons.length];
                return <Icon size={18} />;
              })()}
            </span>
            <p className="text-sm font-semibold leading-8 sm:text-base">{item}</p>
          </motion.div>
        ))}
        </motion.div>
      </div>
    </section>
  );
}