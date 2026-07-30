'use client';

import { FiCreditCard, FiShield } from 'react-icons/fi';
import SectionHeading from '@/components/home/SectionHeading';
import { paymentMethods } from '@/components/home/dir3-home-data';
import { cn } from '@/lib/utils';

export default function PaymentMethodsSection() {
  return (
    <section className="px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-[36px] border border-[color:var(--color-border)] bg-white/80 px-6 py-8 shadow-[0_24px_60px_rgba(13,27,42,0.08)] sm:px-8 lg:px-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <SectionHeading
            eyebrow="PAYMENTS"
            title="مدفوعات خليجية واضحة ومبنية على الثقة."
            description="قيم الخدمة قبل نحاسب. واجهة دفع محلية منظمة تحافظ على الشفافية وتبرز وسائل الدفع المطلوبة داخل السوق الخليجي."
          />
          <div className="space-y-3">
            <div className="inline-flex items-center gap-3 rounded-full border border-[var(--color-gold)]/25 bg-[var(--color-gold)]/10 px-4 py-3 text-sm font-medium text-[var(--color-navy)]">
              <FiCreditCard className="text-[var(--color-gold)]" />
              قيم الخدمة قبل نحاسب.
            </div>
            <div className="inline-flex items-center gap-3 rounded-full border border-[color:var(--color-border)] bg-[var(--color-shell)] px-4 py-3 text-sm font-medium text-[var(--color-navy)]">
              <FiShield className="text-[var(--color-gold)]" />
              إذا صار شيء... حنا معك.
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {paymentMethods.map((method) => (
            <div
              key={method}
              className={cn(
                'rounded-2xl border border-[color:var(--color-border)] bg-[var(--color-shell)] px-4 py-4 text-center text-sm font-semibold text-[var(--color-navy)]',
                method === 'mada' && 'text-[#1a9b6d]'
              )}
            >
              {method}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}