'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { FiCompass, FiFilter, FiSearch } from 'react-icons/fi';
import SectionHeading from '@/components/home/SectionHeading';
import ServicesGrid from '@/components/home/ServicesGrid';
import MarketplaceFilters from '@/components/public/MarketplaceFilters';
import { useMarketplaceServices } from '@/components/public/useMarketplaceServices';
import { fadeUpItem, revealViewport, sectionStagger, subtleEasing } from '@/components/shared/motion';
import { Card, CardContent } from '@/components/ui/card';
import {
  countMarketplaceCollection,
  filterMarketplaceServices,
  getMarketplaceCategoryOptions,
  marketplaceSortOptions,
  type MarketplaceCollectionKey,
  type MarketplaceFamilyKey,
  type MarketplacePageCategory,
  type MarketplaceSortKey,
} from '@/lib/marketplace/data';

type MarketplaceExplorerProps = {
  title: string;
  description: string;
  family?: MarketplaceFamilyKey;
  defaultCategory?: MarketplacePageCategory;
  defaultCollection?: MarketplaceCollectionKey;
};

const collectionLabels: Array<{ value: MarketplaceCollectionKey; label: string }> = [
  { value: 'all', label: 'الكل' },
  { value: 'featured', label: 'المميز' },
  { value: 'popular', label: 'الشائع' },
  { value: 'recommended', label: 'موصى به' },
];

const destinationOptions = [
  { value: 'all', label: 'كل الوجهات' },
  { value: 'riyadh', label: 'الرياض' },
  { value: 'jeddah', label: 'جدة' },
  { value: 'alula', label: 'العلا' },
  { value: 'cairo', label: 'القاهرة' },
];

const destinationKeywords: Record<string, string[]> = {
  riyadh: ['الرياض', 'riyadh'],
  jeddah: ['جدة', 'jeddah'],
  alula: ['العلا', 'alula'],
  cairo: ['القاهرة', 'cairo'],
};

export default function MarketplaceExplorer({
  title,
  description,
  family,
  defaultCategory,
  defaultCollection = 'all',
}: MarketplaceExplorerProps) {
  const { services, loading, error } = useMarketplaceServices();

  const [query, setQuery] = useState('');
  const [collection, setCollection] = useState<MarketplaceCollectionKey>(defaultCollection);
  const [sort, setSort] = useState<MarketplaceSortKey>('recommended');
  const [category, setCategory] = useState<MarketplacePageCategory | 'all'>(defaultCategory ?? 'all');
  const [advancedFilters, setAdvancedFilters] = useState({
    destination: 'all',
    serviceType: defaultCategory ?? 'all',
    budget: 'all',
    checkIn: '',
    checkOut: '',
    travelers: 'all',
  });

  const deferredQuery = useDeferredValue(query);
  const availableCategories = getMarketplaceCategoryOptions(services, family);
  const serviceTypeCategory = advancedFilters.serviceType === 'all' ? undefined : (advancedFilters.serviceType as MarketplacePageCategory);
  const activeCategory = serviceTypeCategory ?? (category === 'all' ? undefined : category);

  const categoryBrowseItems = useMemo(
    () =>
      availableCategories.map((option) => ({
        ...option,
        count: services.filter((service) => service.category === option.category).length,
      })),
    [availableCategories, services]
  );

  const filteredByCore = filterMarketplaceServices(services, {
    family,
    category: activeCategory,
    query: deferredQuery,
    collection,
    sort,
  });

  const visibleServices = filteredByCore.filter((service) => {
    if (advancedFilters.budget !== 'all') {
      const price = service.basePrice ?? 0;

      if (advancedFilters.budget === '0-2000' && !(price > 0 && price <= 2000)) {
        return false;
      }
      if (advancedFilters.budget === '2000-5000' && !(price >= 2000 && price <= 5000)) {
        return false;
      }
      if (advancedFilters.budget === '5000+' && !(price >= 5000)) {
        return false;
      }
    }

    if (advancedFilters.destination !== 'all') {
      const keywords = destinationKeywords[advancedFilters.destination] ?? [];
      if (!keywords.length) {
        return true;
      }

      const haystack = [service.name_ar, service.description_ar, ...(service.tags ?? [])].join(' ').toLowerCase();
      return keywords.some((keyword) => haystack.includes(keyword));
    }

    return true;
  });

  const serviceTypeOptions = [
    { value: 'all', label: 'كل الخدمات' },
    ...availableCategories.map((option) => ({ value: option.category, label: option.categoryLabel })),
  ];

  return (
    <section className="px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionHeading eyebrow="MARKETPLACE" title={title} description={description} />

        <motion.div variants={sectionStagger} initial="hidden" whileInView="visible" viewport={revealViewport} className="mt-8 space-y-5">
          <motion.div variants={fadeUpItem}>
            <Card className="overflow-hidden border-[var(--color-gold)]/18 bg-[linear-gradient(150deg,rgba(255,255,255,0.9)_0%,rgba(248,242,231,0.84)_100%)] shadow-[0_24px_58px_rgba(13,27,42,0.1)]">
              <CardContent className="p-5 sm:p-6 lg:p-7">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold tracking-[0.24em] text-[var(--color-gold)]">SMART SEARCH</p>
                    <h3 className="mt-2 text-2xl font-semibold text-[var(--color-navy)] sm:text-3xl">ابحث في سوق dir3com بذكاء وبساطة.</h3>
                    <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">واجهة اكتشاف راقية مهيأة للمستخدم الخليجي، مع مرشحات مرنة وتجربة قراءة سريعة.</p>
                  </div>
                  <div className="inline-flex items-center gap-2 self-start rounded-full border border-[var(--color-gold)]/24 bg-[var(--color-gold)]/10 px-4 py-2 text-xs font-semibold text-[var(--color-gold)] sm:text-sm">
                    <FiCompass /> اكتشاف فاخر
                  </div>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-[var(--color-muted)]">البحث</span>
                    <span className="flex min-h-11 items-center gap-3 rounded-[22px] border border-[color:var(--color-border)] bg-[var(--color-shell)] px-4 py-3">
                      <FiSearch className="text-[var(--color-gold)]" />
                      <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="ابحث عن خدمة، فئة، أو تجربة"
                        className="w-full bg-transparent text-sm text-[var(--color-navy)] outline-none placeholder:text-[var(--color-muted)]/70"
                      />
                    </span>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-[var(--color-muted)]">الترتيب</span>
                    <select
                      value={sort}
                      onChange={(event) => setSort(event.target.value as MarketplaceSortKey)}
                      className="min-h-11 w-full rounded-[22px] border border-[color:var(--color-border)] bg-[var(--color-shell)] px-4 py-3 text-sm text-[var(--color-navy)] outline-none"
                    >
                      {marketplaceSortOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="mt-6 rounded-[24px] border border-[var(--color-gold)]/14 bg-white/72 p-4 sm:p-5">
                  <div className="mb-3 inline-flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-[var(--color-gold)] sm:text-sm">
                    <FiFilter /> FILTERS
                  </div>
                  <MarketplaceFilters
                    value={advancedFilters}
                    destinationOptions={destinationOptions}
                    serviceTypeOptions={serviceTypeOptions}
                    onChange={setAdvancedFilters}
                  />
                  <p className="mt-3 text-xs leading-6 text-[var(--color-muted)]">
                    التواريخ وعدد المسافرين واجهة جاهزة للربط المباشر في مراحل التكامل القادمة.
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={fadeUpItem} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {categoryBrowseItems.map((option) => (
              <motion.button
                key={option.category}
                type="button"
                whileHover={{ y: -4, transition: { duration: 0.2, ease: subtleEasing } }}
                onClick={() => {
                  setCategory(option.category);
                  setAdvancedFilters((previous) => ({ ...previous, serviceType: option.category }));
                }}
                className={`rounded-[22px] border px-4 py-4 text-right transition ${
                  activeCategory === option.category
                    ? 'border-[var(--color-gold)]/45 bg-[var(--color-gold)]/14'
                    : 'border-[color:var(--color-border)] bg-white/74 hover:border-[var(--color-gold)]/35'
                }`}
              >
                <p className="text-sm font-semibold text-[var(--color-navy)]">{option.categoryLabel}</p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">{option.count} نتيجة</p>
              </motion.button>
            ))}
            {categoryBrowseItems.length === 0
              ? Array.from({ length: 2 }).map((_, index) => (
                  <div key={index} className="rounded-[22px] border border-dashed border-[var(--color-border)] bg-white/60 px-4 py-4 text-sm text-[var(--color-muted)]">
                    فئات السوق تظهر تلقائيا عند توفر البيانات.
                  </div>
                ))
              : null}
          </motion.div>

          <motion.div variants={fadeUpItem} className="rounded-[26px] border border-[color:var(--color-border)] bg-white/72 p-4 sm:p-5">
            <div className="flex flex-wrap gap-2">
              {collectionLabels.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setCollection(option.value)}
                  className={`min-h-10 rounded-full px-4 py-2 text-sm font-medium transition ${
                    collection === option.value
                      ? 'bg-[var(--color-navy)] text-[var(--color-light)]'
                      : 'border border-[color:var(--color-border)] bg-[var(--color-shell)] text-[var(--color-navy)] hover:border-[var(--color-gold)]'
                  }`}
                >
                  {option.label} ({countMarketplaceCollection(services, option.value, family)})
                </button>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setCategory('all');
                  setAdvancedFilters((previous) => ({ ...previous, serviceType: 'all' }));
                }}
                className={`min-h-10 rounded-full px-4 py-2 text-sm font-medium transition ${
                  category === 'all' && advancedFilters.serviceType === 'all'
                    ? 'bg-[var(--color-gold)] text-[var(--color-navy)]'
                    : 'border border-[color:var(--color-border)] bg-[var(--color-shell)] text-[var(--color-navy)] hover:border-[var(--color-gold)]'
                }`}
              >
                تصفح الفئات: الكل
              </button>
              {availableCategories.map((option) => (
                <button
                  key={option.category}
                  type="button"
                  onClick={() => {
                    setCategory(option.category);
                    setAdvancedFilters((previous) => ({ ...previous, serviceType: option.category }));
                  }}
                  className={`min-h-10 rounded-full px-4 py-2 text-sm font-medium transition ${
                    category === option.category || advancedFilters.serviceType === option.category
                      ? 'bg-[var(--color-gold)] text-[var(--color-navy)]'
                      : 'border border-[color:var(--color-border)] bg-[var(--color-shell)] text-[var(--color-navy)] hover:border-[var(--color-gold)]'
                  }`}
                >
                  {option.categoryLabel}
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>

        {error && (
          <Card className="mt-6 border-[var(--color-gold)]/25 bg-[var(--color-gold)]/10 shadow-none">
            <CardContent className="p-4 text-sm text-[var(--color-navy)]">
              {error} تم عرض طبقة البيانات المشتركة الاحتياطية بدلا من ذلك.
            </CardContent>
          </Card>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--color-muted)]">
          <span>النتائج الظاهرة: {visibleServices.length}</span>
          <span>{family ? 'عرض مفلتر حسب عائلة الخدمة' : 'عرض السوق الكامل'}</span>
        </div>

        <div className="mt-6">
          <ServicesGrid services={visibleServices} loading={loading} emptyMessage="لا توجد نتائج مطابقة للمرشحات الحالية. غيّر الفئة أو الميزانية وجرب مرة أخرى." />
        </div>
      </div>
    </section>
  );
}
