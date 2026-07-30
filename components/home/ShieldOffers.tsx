'use client';

import { motion } from 'framer-motion';
import { FiArrowLeft, FiShield } from 'react-icons/fi';
import SectionHeading from '@/components/home/SectionHeading';
import { shieldOffers } from '@/components/home/dir3-home-data';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ShieldOffers() {
  return (
    <section id="offers" className="px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="SHIELD OFFERS"
          title="عروض مبنية على الطمأنينة قبل الإقناع."
          description="كل عرض يبرز قيمة الخدمة، حالة الحماية، وسهولة المراجعة قبل إتمام أي خطوة مالية."
        />

        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {shieldOffers.map((offer, index) => (
            <motion.div
              key={offer.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ duration: 0.45, delay: index * 0.06 }}
            >
              <Card id={offer.id} className="h-full overflow-hidden bg-white/82">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-gold)]/20 bg-[var(--color-gold)]/10 px-3 py-2 text-xs font-medium text-[var(--color-gold)]">
                      <FiShield /> {offer.badge}
                    </span>
                    <span className="text-sm font-semibold text-[var(--color-navy)]">{offer.price}</span>
                  </div>
                  <CardTitle className="mt-4">{offer.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-base leading-8 text-[var(--color-muted)]">{offer.description}</p>
                  <a href="/booking" className={`${buttonVariants({ variant: 'ghost', size: 'default' })} mt-6 w-fit px-0 text-[var(--color-gold)] hover:bg-transparent`}>
                    اكتشف العرض
                    <FiArrowLeft />
                  </a>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}