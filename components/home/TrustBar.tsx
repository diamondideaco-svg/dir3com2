'use client';

import { motion } from 'framer-motion';
import { FiShield } from 'react-icons/fi';
import { trustBarItems } from '@/components/home/dir3-home-data';

export default function TrustBar() {
  return (
    <section className="px-4 pb-8 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-3 rounded-[32px] border border-[color:var(--color-border)] bg-[var(--color-navy)] p-4 text-[var(--color-light)] shadow-[0_22px_55px_rgba(13,27,42,0.16)] md:grid-cols-2 xl:grid-cols-4">
        {trustBarItems.map((item, index) => (
          <motion.div
            key={item}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.4, delay: index * 0.06 }}
            className="rounded-[24px] border border-white/10 bg-white/6 px-4 py-4"
          >
            <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--color-gold)] text-[var(--color-navy)]">
              <FiShield size={18} />
            </span>
            <p className="text-base font-semibold leading-8">{item}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}