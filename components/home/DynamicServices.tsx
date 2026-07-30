'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { FiArrowLeft } from 'react-icons/fi';
import SectionHeading from '@/components/home/SectionHeading';
import { serviceCards } from '@/components/home/dir3-home-data';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fadeUpItem, revealViewport, sectionStagger, subtleEasing } from '@/components/shared/motion';
import type { MarketplacePageCategory } from '@/lib/marketplace/data';

type DynamicServicesProps = {
  title?: string;
  description?: string;
  category?: MarketplacePageCategory;
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

        <motion.div
          variants={sectionStagger}
          initial="hidden"
          whileInView="visible"
          viewport={revealViewport}
          className={`mt-8 grid gap-5 ${filteredServices.length > 3 ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-2 xl:grid-cols-3'}`}
        >
          {filteredServices.map((service, index) => (
            <motion.div
              key={service.id}
              variants={fadeUpItem}
              transition={{ delay: index * 0.05 }}
              whileHover={{ y: -7, transition: { duration: 0.24, ease: subtleEasing } }}
            >
              <Card id={service.id} className="group h-full overflow-hidden border-[var(--color-gold)]/20 bg-white/88 shadow-[0_20px_48px_rgba(13,27,42,0.1)]">
                <CardHeader className="pb-4">
                  <div className="relative -mx-6 -mt-6 mb-4 overflow-hidden rounded-b-[28px] border-b border-[var(--color-gold)]/15">
                    <div className="absolute inset-0 bg-[linear-gradient(155deg,rgba(13,27,42,0.88)_0%,rgba(20,39,57,0.58)_55%,rgba(212,175,55,0.45)_125%)]" />
                    <div className="relative flex items-center justify-between gap-3 px-5 py-5">
                      <span className="rounded-2xl bg-white/85 p-3 shadow-[0_10px_20px_rgba(13,27,42,0.18)]">
                        <Image src={service.icon} alt={service.title} width={38} height={38} className="h-9 w-9" />
                      </span>
                      <span className="rounded-full border border-white/30 bg-white/14 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
                        {service.metric}
                      </span>
                    </div>
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-9 bg-[linear-gradient(180deg,transparent_0%,rgba(13,27,42,0.45)_100%)]" />
                  </div>
                  <CardTitle className="mt-2 text-[1.35rem] leading-8 sm:leading-9">{service.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-base leading-8 text-[var(--color-muted)]">{service.description}</p>
                  <div className="mt-5 flex flex-wrap gap-2.5">
                    {service.tags.map((tag) => (
                      <span key={tag} className="rounded-full border border-[var(--color-gold)]/16 bg-[var(--color-surface)] px-3 py-2 text-xs font-medium text-[var(--color-navy)]">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <Link href={service.href} className="mt-7 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[var(--color-gold)] transition group-hover:gap-3">
                    عرض الخدمة
                    <FiArrowLeft />
                  </Link>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}