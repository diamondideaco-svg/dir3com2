'use client';

import { motion } from 'framer-motion';
import { FiCompass } from 'react-icons/fi';
import SectionHeading from '@/components/home/SectionHeading';
import { travelTips } from '@/components/home/dir3-home-data';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function TravelTips() {
  return (
    <section className="px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="TRAVEL TIPS"
          title="نصائح سفر مختصرة لرحلة خليجية أكثر سلاسة."
          description="قسم تحريري سريع وقابل لإعادة الاستخدام، يضيف قيمة عملية للصفحة الرئيسية من دون أي تعقيد أو منطق خارجي."
        />

        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {travelTips.map((tip, index) => (
            <motion.div
              key={tip.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.45, delay: index * 0.05 }}
            >
              <Card className="h-full bg-white/82">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--color-surface)] text-[var(--color-gold)]">
                      <FiCompass size={18} />
                    </span>
                    <span className="rounded-full border border-[var(--color-gold)]/20 bg-[var(--color-gold)]/10 px-3 py-2 text-xs font-medium text-[var(--color-gold)]">
                      {tip.label}
                    </span>
                  </div>
                  <CardTitle className="mt-4">{tip.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-base leading-8 text-[var(--color-muted)]">{tip.description}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}