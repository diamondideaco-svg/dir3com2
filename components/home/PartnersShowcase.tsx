'use client';

import { motion } from 'framer-motion';
import SectionHeading from '@/components/home/SectionHeading';
import { partnerCards } from '@/components/home/dir3-home-data';
import { Card, CardContent } from '@/components/ui/card';

export default function PartnersShowcase() {
  return (
    <section id="about" className="px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="PARTNERS"
          title="شركاء مختارون ليظهروا الجودة قبل الكم."
          description="مساحة شراكات مرنة لعرض الجهات الموثوقة وتفاصيل التغطية والمدن ومستوى Shield readiness داخل الهوية نفسها."
        />

        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {partnerCards.map((partner, index) => (
            <motion.div
              key={partner.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.45, delay: index * 0.05 }}
            >
              <Card className="h-full bg-white/82">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xl font-semibold text-[var(--color-navy)]">{partner.name}</p>
                      <p className="mt-2 text-sm text-[var(--color-muted)]">{partner.city}</p>
                    </div>
                    <span className="rounded-full border border-[var(--color-gold)]/20 bg-[var(--color-gold)]/10 px-3 py-2 text-xs font-semibold text-[var(--color-gold)]">
                      {partner.score}
                    </span>
                  </div>
                  <div className="mt-8 rounded-[24px] bg-[var(--color-navy)] px-4 py-4 text-sm text-[var(--color-light)]">
                    {partner.specialty}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}