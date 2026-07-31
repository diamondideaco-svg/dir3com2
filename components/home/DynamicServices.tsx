'use client';

import { motion } from 'framer-motion';
import SectionHeading from '@/components/home/SectionHeading';
import ServicesGrid from '@/components/home/ServicesGrid';
import { useMarketplaceServices } from '@/components/public/useMarketplaceServices';
import { fadeUpItem, revealViewport, sectionStagger } from '@/components/shared/motion';
import type { MarketplacePageCategory } from '@/lib/marketplace/data';

type DynamicServicesProps = {
  title?: string;
  description?: string;
  category?: MarketplacePageCategory;
};

export default function DynamicServices({ title, description, category }: DynamicServicesProps) {
  const { services, loading } = useMarketplaceServices({
    category,
    collection: 'recommended',
    sort: 'recommended',
    page: 1,
    pageSize: 8,
  });

  return (
    <section id="services" className="px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="DYNAMIC SERVICES"
          title={title ? `${title} ضمن نظام خدمة ديناميكي متماسك.` : 'خدمات ديناميكية جاهزة للتوسعة ومتماسكة بصرياً.'}
          description={description ?? 'كل بطاقة ترتبط بالكتالوج المشترك مباشرة مع حماية نمط العرض الحالي دون تغيير الهوية البصرية.'}
        />

        <motion.div
          variants={sectionStagger}
          initial="hidden"
          whileInView="visible"
          viewport={revealViewport}
          className="mt-8"
        >
          <motion.div variants={fadeUpItem}>
            <ServicesGrid
              services={services}
              loading={loading}
              skeletonCount={8}
              emptyMessage="لا توجد خدمات متاحة حالياً ضمن هذه الفئة."
            />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
