'use client';

import { motion } from 'framer-motion';
import SectionHeading from '@/components/home/SectionHeading';
import ServicesGrid from '@/components/home/ServicesGrid';
import { useMarketplaceServices } from '@/components/public/useMarketplaceServices';
import { fadeUpItem, revealViewport, sectionStagger } from '@/components/shared/motion';
import type { MarketplacePageCategory } from '@/lib/marketplace/data';
import { useLanguage } from '@/components/i18n/LanguageProvider';

type DynamicServicesProps = {
  title?: string;
  description?: string;
  category?: MarketplacePageCategory;
};

export default function DynamicServices({ title, description, category }: DynamicServicesProps) {
  const { language } = useLanguage();
  const isArabic = language === 'ar';
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
          eyebrow={isArabic ? 'خدمات متجددة' : 'Curated services'}
          title={title ? (isArabic ? `${title} ضمن تجربة متجددة ومتماسكة.` : `${title} within one clear service experience.`) : isArabic ? 'خدمات متجددة جاهزة للتوسع.' : 'Curated services ready to grow.'}
          description={description ?? (isArabic ? 'كل بطاقة ترتبط بالكتالوج المشترك مباشرة مع الحفاظ على الهوية البصرية.' : 'Each card connects to the shared catalogue while preserving the visual identity.')}
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
              emptyMessage={isArabic ? 'لا توجد خدمات متاحة حالياً ضمن هذه الفئة.' : 'No services are currently available in this category.'}
            />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
