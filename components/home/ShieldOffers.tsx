'use client';

import { motion } from 'framer-motion';
import { FiArrowLeft, FiShield } from 'react-icons/fi';
import SectionHeading from '@/components/home/SectionHeading';
import { shieldOffers } from '@/components/home/dir3-home-data';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fadeUpItem, revealViewport, sectionStagger, subtleEasing } from '@/components/shared/motion';

export default function ShieldOffers() {
  return (
    <section id="offers" className="px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="SHIELD OFFERS"
          title="عروض مبنية على الطمأنينة قبل الإقناع."
          description="كل عرض يبرز قيمة الخدمة، حالة الحماية، وسهولة المراجعة قبل إتمام أي خطوة مالية."
        />

        <motion.div variants={sectionStagger} initial="hidden" whileInView="visible" viewport={revealViewport} className="mt-8 grid gap-5 lg:grid-cols-3">
          {shieldOffers.map((offer, index) => {
            const amount = offer.price.match(/[\d,]+/)?.[0] ?? offer.price;
            const hasFrom = offer.price.includes('من');

            return (
            <motion.div
              key={offer.title}
              variants={fadeUpItem}
              transition={{ delay: index * 0.06 }}
              whileHover={{ y: -6, transition: { duration: 0.24, ease: subtleEasing } }}
            >
              <Card
                id={offer.id}
                className={`h-full overflow-hidden border-[var(--color-gold)]/16 bg-white/88 ${index === 0 ? 'ring-1 ring-[var(--color-gold)]/45 shadow-[0_24px_58px_rgba(13,27,42,0.14)]' : 'shadow-[0_18px_46px_rgba(13,27,42,0.1)]'}`}
              >
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-gold)]/20 bg-[var(--color-gold)]/10 px-3 py-2 text-xs font-medium text-[var(--color-gold)]">
                      <FiShield /> {offer.badge}
                    </span>
                    {index === 0 ? <span className="rounded-full bg-[var(--color-surface-strong)] px-3 py-1 text-xs font-semibold text-white">Featured</span> : null}
                  </div>
                  <CardTitle className="mt-4 text-[1.35rem]">{offer.title}</CardTitle>
                  <div className="mt-3 flex items-end gap-2 text-[var(--color-navy)]">
                    <span className="font-[var(--font-display)] text-4xl leading-none text-[var(--color-gold)]">{amount}</span>
                    <span className="pb-1 text-sm font-semibold">{hasFrom ? 'من ' : ''}ر.س</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-base leading-8 text-[var(--color-muted)]">{offer.description}</p>
                  <a
                    href="/booking"
                    className={`${buttonVariants({ variant: index === 0 ? 'gold' : 'ghost', size: 'default' })} mt-6 min-h-10 w-fit ${index === 0 ? '' : 'px-0 text-[var(--color-gold)] hover:bg-transparent'}`}
                  >
                    اكتشف العرض
                    <FiArrowLeft />
                  </a>
                </CardContent>
              </Card>
            </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}