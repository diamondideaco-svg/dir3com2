'use client';

import { motion } from 'framer-motion';
import { FiCreditCard, FiShield } from 'react-icons/fi';
import SectionHeading from '@/components/home/SectionHeading';
import { paymentMethods } from '@/components/home/dir3-home-data';
import { fadeUpItem, revealViewport, sectionStagger, subtleEasing } from '@/components/shared/motion';
import { cn } from '@/lib/utils';

export default function PaymentMethodsSection() {
  return (
    <section className="px-4 py-10 sm:px-6 lg:px-8">
      <motion.div
        variants={sectionStagger}
        initial="hidden"
        whileInView="visible"
        viewport={revealViewport}
        className="mx-auto max-w-7xl rounded-[38px] border border-[var(--color-gold)]/18 bg-[linear-gradient(155deg,rgba(255,255,255,0.9)_0%,rgba(248,243,233,0.82)_100%)] px-6 py-8 shadow-[0_26px_62px_rgba(13,27,42,0.1)] sm:px-8 lg:px-10"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <SectionHeading
            eyebrow="PAYMENTS"
            title="مدفوعات خليجية واضحة ومبنية على الثقة."
            description="قيم الخدمة قبل نحاسب. واجهة دفع محلية منظمة تحافظ على الشفافية وتبرز وسائل الدفع المطلوبة داخل السوق الخليجي."
          />
          <motion.div variants={fadeUpItem} className="space-y-3">
            <div className="inline-flex items-center gap-3 rounded-full border border-[var(--color-gold)]/25 bg-[var(--color-gold)]/10 px-4 py-3 text-sm font-medium text-[var(--color-navy)]">
              <FiCreditCard className="text-[var(--color-gold)]" />
              قيم الخدمة قبل نحاسب.
            </div>
            <div className="inline-flex items-center gap-3 rounded-full border border-[color:var(--color-border)] bg-[var(--color-shell)] px-4 py-3 text-sm font-medium text-[var(--color-navy)]">
              <FiShield className="text-[var(--color-gold)]" />
              إذا صار شيء... حنا معك.
            </div>
          </motion.div>
        </div>

        <motion.div variants={sectionStagger} className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {paymentMethods.map((method, index) => (
            <motion.div
              key={method}
              variants={fadeUpItem}
              transition={{ delay: index * 0.03 }}
              whileHover={{ y: -3, transition: { duration: 0.2, ease: subtleEasing } }}
              className={cn(
                'min-h-11 rounded-2xl border border-[color:var(--color-border)] bg-[var(--color-shell)] px-4 py-4 text-center text-sm font-semibold text-[var(--color-navy)] shadow-[0_10px_24px_rgba(13,27,42,0.06)]',
                method === 'mada' && 'text-[#1a9b6d]'
              )}
            >
              {method}
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
    </section>
  );
}