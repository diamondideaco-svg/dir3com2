'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { FiArrowLeft } from 'react-icons/fi';
import SectionHeading from '@/components/home/SectionHeading';
import { serviceCards } from '@/components/home/dir3-home-data';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type DynamicServicesProps = {
  title?: string;
  description?: string;
  category?: string;
};

export default function DynamicServices({ title, description, category }: DynamicServicesProps) {
  const filteredServices = category ? serviceCards.filter((service) => service.category === category) : serviceCards;

  return (
    <section id="services" className="px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="DYNAMIC SERVICES"
          title={title ? `${title} ضمن نظام خدمة ديناميكي متماسك.` : 'خدمات ديناميكية جاهزة للتوسعة ومتماسكة بصرياً.'}
          description={description ?? 'كل بطاقة يمكن تحويلها لاحقاً إلى مصدر بيانات حي أو ربط مباشر مع الكتالوج من دون كسر التصميم أو المسارات الحالية.'}
        />

        <div className={`mt-8 grid gap-5 ${filteredServices.length > 3 ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-2 xl:grid-cols-3'}`}>
          {filteredServices.map((service, index) => (
            <motion.div
              key={service.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.45, delay: index * 0.05 }}
            >
              <Card id={service.id} className="h-full overflow-hidden bg-white/82">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-2xl bg-[var(--color-surface)] p-3">
                      <Image src={service.icon} alt={service.title} width={36} height={36} className="h-9 w-9" />
                    </span>
                    <span className="rounded-full border border-[color:var(--color-border)] bg-[var(--color-shell)] px-3 py-2 text-xs font-semibold text-[var(--color-navy)]">
                      {service.metric}
                    </span>
                  </div>
                  <CardTitle className="mt-4">{service.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-base leading-8 text-[var(--color-muted)]">{service.description}</p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {service.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-[var(--color-surface)] px-3 py-2 text-xs font-medium text-[var(--color-navy)]">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <Link href={service.href} className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-gold)] transition hover:gap-3">
                    عرض الخدمة
                    <FiArrowLeft />
                  </Link>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}