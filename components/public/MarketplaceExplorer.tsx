'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { FiCompass, FiFilter } from 'react-icons/fi';
import SectionHeading from '@/components/home/SectionHeading';
import { Badge, Chip, ContentContainer, SearchField, SectionContainer, SectionSurface, SelectField } from '@/components/design-system';
import ServicesGrid from '@/components/home/ServicesGrid';
import MarketplaceFilters from '@/components/public/MarketplaceFilters';
import { useMarketplaceServices } from '@/components/public/useMarketplaceServices';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { fadeUpItem, revealViewport, sectionStagger, subtleEasing } from '@/components/shared/motion';
import { Card, CardContent } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import {
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
  { value: 'saudi-arabia', label: 'Saudi Arabia | السعودية' },
  { value: 'egypt', label: 'Egypt | مصر' },
  { value: 'riyadh', label: 'Riyadh | الرياض' },
  { value: 'jeddah', label: 'Jeddah | جدة' },
  { value: 'makkah', label: 'Makkah | مكة' },
  { value: 'madinah', label: 'Madinah | المدينة' },
  { value: 'dammam', label: 'Dammam | الدمام' },
  { value: 'khobar', label: 'Khobar | الخبر' },
  { value: 'abha', label: 'Abha | أبها' },
  { value: 'taif', label: 'Taif | الطائف' },
  { value: 'alula', label: 'AlUla | العلا' },
  { value: 'neom', label: 'NEOM | نيوم' },
  { value: 'cairo', label: 'Cairo | القاهرة' },
  { value: 'giza', label: 'Giza | الجيزة' },
  { value: 'alexandria', label: 'Alexandria | الإسكندرية' },
  { value: 'hurghada', label: 'Hurghada | الغردقة' },
  { value: 'sharm-el-sheikh', label: 'Sharm El Sheikh | شرم الشيخ' },
  { value: 'luxor', label: 'Luxor | الأقصر' },
  { value: 'aswan', label: 'Aswan | أسوان' },
  { value: 'marsa-alam', label: 'Marsa Alam | مرسى علم' },
  { value: 'new-alamein', label: 'New Alamein | العلمين الجديدة' },
];

const sortOptions: Array<{ value: MarketplaceSortKey; label: string }> = [
  { value: 'recommended', label: 'الأكثر ملاءمة' },
  { value: 'featured', label: 'المميز أولا' },
  { value: 'popular', label: 'الأكثر شعبية' },
  { value: 'price-low', label: 'السعر: الأقل أولا' },
  { value: 'price-high', label: 'السعر: الأعلى أولا' },
  { value: 'name', label: 'الاسم' },
];

const englishCollectionLabels: Record<MarketplaceCollectionKey, string> = {
  all: 'All',
  featured: 'Featured',
  popular: 'Popular',
  recommended: 'Recommended',
};

const englishCategoryLabels: Record<string, string> = {
  cars: 'Cars',
  hotels: 'Hotels',
  apartments: 'Apartments',
  'airport-transfers': 'Airport transfers',
  concierge: 'Concierge',
  experiences: 'Experiences',
  offers: 'Offers',
};

export default function MarketplaceExplorer({
  title,
  description,
  family,
  defaultCategory,
  defaultCollection = 'all',
}: MarketplaceExplorerProps) {
  const { language } = useLanguage();
  const isArabic = language === 'ar';
  const displayedCollectionLabels = isArabic ? collectionLabels : collectionLabels.map((option) => ({ ...option, label: englishCollectionLabels[option.value] }));
  const displayedDestinationOptions = destinationOptions.map((option) => ({ ...option, label: isArabic ? option.label.split(' | ').reverse().join(' | ') : option.label }));
  const initialUrlParams =
    typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const initialQuery = initialUrlParams.get('query') ?? '';
  const initialDestination = initialUrlParams.get('destination') ?? 'all';

  const [searchInput, setSearchInput] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [collection, setCollection] = useState<MarketplaceCollectionKey>(defaultCollection);
  const [sort, setSort] = useState<MarketplaceSortKey>('recommended');
  const [category, setCategory] = useState<MarketplacePageCategory | 'all'>(defaultCategory ?? 'all');
  const [page, setPage] = useState(1);
  const [advancedFilters, setAdvancedFilters] = useState({
    destination: initialDestination,
    serviceType: defaultCategory ?? 'all',
    budget: 'all',
    checkIn: '',
    checkOut: '',
    travelers: 'all',
  });

  const serviceTypeCategory = advancedFilters.serviceType === 'all' ? undefined : (advancedFilters.serviceType as MarketplacePageCategory);
  const activeCategory = serviceTypeCategory ?? (category === 'all' ? undefined : category);
  const inferredLanguage = /[\u0600-\u06FF]/.test(query)
    ? /[A-Za-z]/.test(query)
      ? 'mixed'
      : 'ar'
    : /[A-Za-z]/.test(query)
      ? 'en'
      : 'ar';

  const { services, loading, error, meta } = useMarketplaceServices({
    family,
    category: activeCategory,
    query,
    userIntent: query,
    language: inferredLanguage,
    collection,
    sort,
    destination: advancedFilters.destination,
    checkIn: advancedFilters.checkIn,
    checkOut: advancedFilters.checkOut,
    budget: advancedFilters.budget,
    travelers: advancedFilters.travelers,
    page,
    pageSize: 9,
  });

  const categoryBrowseItems = useMemo(
    () =>
      meta.facets.categories
        .filter((item) => item.count > 0)
        .map((item) => ({
          category: item.category as MarketplacePageCategory,
          categoryLabel: isArabic ? item.label : englishCategoryLabels[item.category] || item.label,
          count: item.count,
        })),
    [isArabic, meta.facets.categories]
  );

  const serviceTypeOptions = useMemo(
    () => [
      { value: 'all', label: isArabic ? 'كل الخدمات' : 'All services' },
      ...categoryBrowseItems.map((option) => ({ value: option.category, label: option.categoryLabel })),
    ],
    [categoryBrowseItems, isArabic]
  );

  const paginationPages = useMemo(() => {
    const pages: number[] = [];
    const totalPages = meta.totalPages;
    const start = Math.max(1, meta.page - 1);
    const end = Math.min(totalPages, start + 2);

    for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
      pages.push(pageNumber);
    }

    return pages;
  }, [meta.page, meta.totalPages]);

  return (
    <SectionContainer>
      <ContentContainer>
        <SectionHeading eyebrow={isArabic ? 'سوق الخدمات' : 'Service marketplace'} title={title} description={description} />

        <motion.div variants={sectionStagger} initial="hidden" whileInView="visible" viewport={revealViewport} className="mt-8 space-y-5">
          <motion.div variants={fadeUpItem}>
            <SectionSurface className="overflow-hidden border-[var(--color-gold)]/18 bg-[linear-gradient(150deg,rgba(255,255,255,0.9)_0%,rgba(248,242,231,0.84)_100%)] shadow-[0_24px_58px_rgba(13,27,42,0.1)]">
              <CardContent className="p-5 sm:p-6 lg:p-7">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold tracking-[0.24em] text-[var(--color-gold)]">{isArabic ? 'بحث ذكي' : 'Smart search'}</p>
                    <h3 className="mt-2 text-2xl font-semibold text-[var(--color-navy)] sm:text-3xl">{isArabic ? 'ابحث في سوق dir3com بذكاء وبساطة.' : 'Find your next dir3com service with ease.'}</h3>
                    <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">{isArabic ? 'واجهة اكتشاف راقية مع مرشحات مرنة وتجربة قراءة سريعة.' : 'A refined discovery experience with flexible filters and fast scanning.'}</p>
                  </div>
                  <Badge className="self-start">
                    <FiCompass /> {isArabic ? 'اكتشاف فاخر' : 'Curated discovery'}
                  </Badge>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
                  <SearchField value={searchInput} onChange={setSearchInput} placeholder={isArabic ? 'ابحث عن خدمة، فئة، أو تجربة' : 'Search for a service, category, or experience'} />
                  <SelectField label={isArabic ? 'الترتيب' : 'Sort by'} value={sort} onChange={(next) => setSort(next as MarketplaceSortKey)} options={isArabic ? sortOptions : sortOptions.map((option) => ({ ...option, label: option.value === 'recommended' ? 'Recommended' : option.value === 'featured' ? 'Featured first' : option.value === 'popular' ? 'Most popular' : option.value === 'price-low' ? 'Price: low to high' : option.value === 'price-high' ? 'Price: high to low' : 'Name' }))} />
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      const nextQuery = searchInput.trim();
                      setQuery(nextQuery);
                      setPage(1);
                      document.getElementById('marketplace-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className={buttonVariants({ variant: 'gold', size: 'default' })}
                  >
                    {isArabic ? 'ابحث الآن' : 'Search'}
                  </button>
                </div>

                <div className="mt-6 rounded-[24px] border border-[var(--color-gold)]/14 bg-white/72 p-4 sm:p-5">
                  <div className="mb-3 inline-flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-[var(--color-gold)] sm:text-sm">
                    <FiFilter /> {isArabic ? 'المرشحات' : 'Filters'}
                  </div>
                  <MarketplaceFilters
                    value={advancedFilters}
                    destinationOptions={displayedDestinationOptions}
                    serviceTypeOptions={serviceTypeOptions}
                    onChange={(next) => {
                      setAdvancedFilters(next);
                      setPage(1);
                    }}
                  />
                  <p className="mt-3 text-xs leading-6 text-[var(--color-muted)]">
                    {isArabic ? 'التواريخ وعدد المسافرين متاحان لتخصيص نتائجك.' : 'Use dates and traveller count to refine your results.'}
                  </p>
                </div>
              </CardContent>
            </SectionSurface>
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
                  setPage(1);
                }}
                aria-pressed={activeCategory === option.category}
                className={`rounded-[22px] border px-4 py-4 text-right transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/35 ${
                  activeCategory === option.category
                    ? 'border-[var(--color-gold)]/45 bg-[var(--color-gold)]/14'
                    : 'border-[color:var(--color-border)] bg-white/74 hover:border-[var(--color-gold)]/35'
                }`}
              >
                <p className="text-sm font-semibold text-[var(--color-navy)]">{option.categoryLabel}</p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">{option.count} {isArabic ? 'نتيجة' : option.count === 1 ? 'result' : 'results'}</p>
              </motion.button>
            ))}
            {categoryBrowseItems.length === 0
              ? Array.from({ length: 2 }).map((_, index) => (
                  <div key={index} className="rounded-[22px] border border-dashed border-[var(--color-border)] bg-white/60 px-4 py-4 text-sm text-[var(--color-muted)]">
                    {isArabic ? 'ستظهر الفئات عند توفر الخيارات.' : 'Categories will appear when options are available.'}
                  </div>
                ))
              : null}
          </motion.div>

          <motion.div variants={fadeUpItem} className="rounded-[26px] border border-[color:var(--color-border)] bg-white/72 p-4 sm:p-5">
            <div className="flex flex-wrap gap-2">
              {displayedCollectionLabels.map((option) => {
                const collectionCount = meta.facets.collections[option.value] ?? 0;
                const isUnavailable = option.value !== 'all' && collectionCount === 0;

                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={isUnavailable}
                    onClick={() => {
                      setCollection(option.value);
                      setPage(1);
                    }}
                    aria-pressed={collection === option.value}
                    className={`min-h-10 rounded-full px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/35 ${
                      collection === option.value
                        ? 'bg-[var(--color-surface-strong)] text-[var(--color-light)]'
                        : isUnavailable
                          ? 'cursor-not-allowed border border-dashed border-[color:var(--color-border)] bg-white/60 text-[var(--color-muted)]'
                          : 'border border-[color:var(--color-border)] bg-[var(--color-shell)] text-[var(--color-navy)] hover:border-[var(--color-gold)]'
                    }`}
                  >
                    {option.label} ({collectionCount})
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setCategory('all');
                  setAdvancedFilters((previous) => ({ ...previous, serviceType: 'all' }));
                  setPage(1);
                }}
                aria-pressed={category === 'all' && advancedFilters.serviceType === 'all'}
                className={`min-h-10 rounded-full px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/35 ${
                  category === 'all' && advancedFilters.serviceType === 'all'
                    ? 'bg-[var(--color-gold)] text-[var(--color-navy)]'
                    : 'border border-[color:var(--color-border)] bg-[var(--color-shell)] text-[var(--color-navy)] hover:border-[var(--color-gold)]'
                }`}
              >
                {isArabic ? 'تصفح الفئات: الكل' : 'Browse categories: All'}
              </button>
              {categoryBrowseItems.map((option) => (
                <button
                  key={option.category}
                  type="button"
                  onClick={() => {
                    setCategory(option.category);
                    setAdvancedFilters((previous) => ({ ...previous, serviceType: option.category }));
                    setPage(1);
                  }}
                  aria-pressed={category === option.category || advancedFilters.serviceType === option.category}
                  className={`min-h-10 rounded-full px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/35 ${
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
              {error} {isArabic ? 'نعرض خيارات بديلة مؤقتاً لمواصلة التصفح.' : 'Showing alternative options temporarily so you can keep browsing.'}
            </CardContent>
          </Card>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--color-muted)]">
          <Chip className="text-sm">{isArabic ? 'النتائج الظاهرة' : 'Showing'}: {services.length}</Chip>
          <Chip className="text-sm">{isArabic ? 'إجمالي النتائج' : 'Total results'}: {meta.total}</Chip>
          <Chip className="text-sm">{meta.hasRealData ? (isArabic ? 'خيارات متاحة' : 'Available options') : (isArabic ? 'خيارات مقترحة' : 'Suggested options')}</Chip>
        </div>

        <div id="marketplace-results" className="mt-6">
          {!loading && services.length === 0 ? (
            <SectionSurface>
              <p className="text-xl font-semibold text-[var(--color-navy)]">{isArabic ? 'لا توجد خدمات مطابقة للمرشحات الحالية.' : 'No services match your current filters.'}</p>
              <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">{isArabic ? 'جرّب إعادة ضبط المرشحات أو تصفح جميع الخدمات.' : 'Try resetting the filters or browse all services.'}</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setCollection('all');
                    setSort('recommended');
                    setCategory('all');
                    setSearchInput('');
                    setQuery('');
                    setAdvancedFilters({
                      destination: 'all',
                      serviceType: 'all',
                      budget: 'all',
                      checkIn: '',
                      checkOut: '',
                      travelers: 'all',
                    });
                    setPage(1);
                  }}
                  className={buttonVariants({ variant: 'gold', size: 'default' })}
                >
                  {isArabic ? 'إعادة ضبط المرشحات' : 'Reset filters'}
                </button>
                <Link href="/services" className={buttonVariants({ variant: 'outline', size: 'default' })}>
                  {isArabic ? 'تصفح كل الخدمات' : 'Browse all services'}
                </Link>
              </div>
            </SectionSurface>
          ) : (
            <ServicesGrid services={services} loading={loading} emptyMessage={isArabic ? 'لا توجد نتائج مطابقة للمرشحات الحالية.' : 'No results match the current filters.'} skeletonCount={6} />
          )}
        </div>

        {meta.totalPages > 1 ? (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setPage((previous) => Math.max(1, previous - 1))}
              disabled={meta.page <= 1}
              className={`min-h-10 rounded-full px-4 py-2 text-sm font-medium transition ${
                meta.page <= 1
                  ? 'cursor-not-allowed border border-dashed border-[color:var(--color-border)] text-[var(--color-muted)]'
                  : 'border border-[color:var(--color-border)] bg-[var(--color-shell)] text-[var(--color-navy)] hover:border-[var(--color-gold)]'
              }`}
            >
              {isArabic ? 'السابق' : 'Previous'}
            </button>

            {paginationPages.map((pageNumber) => (
              <button
                key={pageNumber}
                type="button"
                onClick={() => setPage(pageNumber)}
                className={`min-h-10 min-w-10 rounded-full px-3 py-2 text-sm font-medium transition ${
                  meta.page === pageNumber
                    ? 'bg-[var(--color-surface-strong)] text-[var(--color-light)]'
                    : 'border border-[color:var(--color-border)] bg-[var(--color-shell)] text-[var(--color-navy)] hover:border-[var(--color-gold)]'
                }`}
              >
                {pageNumber}
              </button>
            ))}

            <button
              type="button"
              onClick={() => setPage((previous) => Math.min(meta.totalPages, previous + 1))}
              disabled={meta.page >= meta.totalPages}
              className={`min-h-10 rounded-full px-4 py-2 text-sm font-medium transition ${
                meta.page >= meta.totalPages
                  ? 'cursor-not-allowed border border-dashed border-[color:var(--color-border)] text-[var(--color-muted)]'
                  : 'border border-[color:var(--color-border)] bg-[var(--color-shell)] text-[var(--color-navy)] hover:border-[var(--color-gold)]'
              }`}
            >
              {isArabic ? 'التالي' : 'Next'}
            </button>
          </div>
        ) : null}
      </ContentContainer>
    </SectionContainer>
  );
}
