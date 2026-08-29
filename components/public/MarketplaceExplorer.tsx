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
import { fadeUpItem, revealViewport, sectionStagger, subtleEasing } from '@/components/shared/motion';
import { Card, CardContent } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import {
  getMarketplaceFamilyLabel,
  marketplaceFamilyDefinitions,
  type MarketplaceCollectionKey,
  type MarketplaceFamilyKey,
  type MarketplacePageCategory,
  type MarketplaceSortKey,
} from '@/lib/marketplace/data';

type MarketplaceExplorerProps = {
  title?: string;
  description?: string;
  family?: MarketplaceFamilyKey;
  defaultCategory?: MarketplacePageCategory;
  defaultCollection?: MarketplaceCollectionKey;
};

const copy = {
  ar: {
    title: 'السوق', description: 'تصفّح بحرية، واعرف ما هو متاح فعلاً، واطلب ما يحتاج إلى تأكيد بشري.', all: 'الكل', featured: 'المميز', popular: 'الشائع', recommended: 'موصى به',
    destinations: ['كل الوجهات','السعودية','مصر','الرياض','جدة','مكة','المدينة','الدمام','الخبر','أبها','الطائف','العلا','نيوم','القاهرة','الجيزة','الإسكندرية','الغردقة','شرم الشيخ','الأقصر','أسوان','مرسى علم','العلمين الجديدة'],
    sorts: ['الأكثر ملاءمة','المميز أولا','الأكثر شعبية','السعر: الأقل أولا','السعر: الأعلى أولا','الاسم'],
    allServices: 'كل الخدمات', smartTitle: 'ابحث في سوق dir3com بوضوح وبساطة.', smartDescription: 'واجهة لاكتشاف الخدمات مع مرشحات مرنة وتجربة قراءة سريعة.', discovery: 'استكشاف السوق', searchPlaceholder: 'ابحث عن خدمة، فئة، أو تجربة', sort: 'الترتيب', searchNow: 'ابحث الآن', filters: 'المرشحات', filtersNote: 'اختر التواريخ وعدد المسافرين لتوضيح تفضيلات بحثك.', result: 'نتيجة', categoriesPending: 'فئات السوق تظهر تلقائيا عند توفر البيانات.', browseCategories: 'تصفح الفئات', safeError: 'لم نعرض أي مخزون غير متحقق بدلاً منه.', visible: 'النتائج الظاهرة', total: 'إجمالي النتائج', source: 'المصدر', verified: 'مخزون موثّق', noVerified: 'لا يوجد مخزون موثّق', emptyTitle: 'لا يوجد توفر موثّق يطابق بحثك حتى الآن.', emptyDescription: 'عدّل البحث، تصفّح عائلة أخرى، أو اطلب مساعدة DABRA من دون تصنيع نتائج أو أسعار.', reset: 'إعادة ضبط المرشحات', browseServices: 'تصفح كل الخدمات', askDabra: 'اسأل DABRA', noResults: 'لا توجد نتائج مطابقة للمرشحات الحالية.', previous: 'السابق', next: 'التالي', families: 'عائلات السوق',
  },
  en: {
    title: 'Marketplace', description: 'Browse freely, see what is genuinely available, and request anything that needs human confirmation.', all: 'All', featured: 'Featured', popular: 'Popular', recommended: 'Recommended',
    destinations: ['All destinations','Saudi Arabia','Egypt','Riyadh','Jeddah','Makkah','Madinah','Dammam','Khobar','Abha','Taif','AlUla','NEOM','Cairo','Giza','Alexandria','Hurghada','Sharm El Sheikh','Luxor','Aswan','Marsa Alam','New Alamein'],
    sorts: ['Most relevant','Featured first','Most popular','Price: low to high','Price: high to low','Name'],
    allServices: 'All services', smartTitle: 'Search the dir3com marketplace with clarity.', smartDescription: 'A clear discovery experience with flexible filters and quick browsing.', discovery: 'Marketplace discovery', searchPlaceholder: 'Search for a service, category, or experience', sort: 'Sort', searchNow: 'Search now', filters: 'Filters', filtersNote: 'Choose dates and traveller count to clarify your search preferences.', result: 'results', categoriesPending: 'Marketplace categories appear when verified data is available.', browseCategories: 'Browse categories', safeError: 'No unverified inventory was shown as a substitute.', visible: 'Visible results', total: 'Total results', source: 'Source', verified: 'Verified inventory', noVerified: 'No verified inventory', emptyTitle: 'No verified availability matches your search yet.', emptyDescription: 'Adjust your search, browse another family, or ask DABRA for help without fabricated results or prices.', reset: 'Reset filters', browseServices: 'Browse all services', askDabra: 'Ask DABRA', noResults: 'No results match the current filters.', previous: 'Previous', next: 'Next', families: 'Marketplace families',
  },
} as const;

const destinationValues = ['all','saudi-arabia','egypt','riyadh','jeddah','makkah','madinah','dammam','khobar','abha','taif','alula','neom','cairo','giza','alexandria','hurghada','sharm-el-sheikh','luxor','aswan','marsa-alam','new-alamein'];
const sortValues: MarketplaceSortKey[] = ['recommended','featured','popular','price-low','price-high','name'];
const categoryCopy: Record<MarketplacePageCategory, { ar: string; en: string }> = {
  cars: { ar: 'السيارات', en: 'Cars' }, hotels: { ar: 'الفنادق', en: 'Hotels' }, apartments: { ar: 'الشقق', en: 'Apartments' },
  'airport-transfers': { ar: 'النقل من وإلى المطار', en: 'Airport transfers' }, concierge: { ar: 'الكونسيرج', en: 'Concierge' }, experiences: { ar: 'التجارب', en: 'Experiences' }, offers: { ar: 'العروض', en: 'Offers' },
};

export default function MarketplaceExplorer({
  title,
  description,
  family,
  defaultCategory,
  defaultCollection = 'all',
}: MarketplaceExplorerProps) {
  const { language } = useLanguage();
  const t = copy[language];
  const activeFamilyLabel = getMarketplaceFamilyLabel(family, language, t.all);
  const collectionLabels: Array<{ value: MarketplaceCollectionKey; label: string }> = [
    { value: 'all', label: t.all }, { value: 'featured', label: t.featured }, { value: 'popular', label: t.popular }, { value: 'recommended', label: t.recommended },
  ];
  const destinationOptions = destinationValues.map((value, index) => ({ value, label: t.destinations[index] }));
  const sortOptions = sortValues.map((value, index) => ({ value, label: t.sorts[index] }));
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
    pageSize: 30,
  });

  const categoryBrowseItems = useMemo(
    () =>
      meta.facets.categories
        .filter((item) => item.count > 0)
        .map((item) => ({
          category: item.category as MarketplacePageCategory,
          categoryLabel: categoryCopy[item.category as MarketplacePageCategory]?.[language] ?? item.label,
          count: item.count,
        })),
    [language, meta.facets.categories]
  );

  const serviceTypeOptions = useMemo(
    () => [
      { value: 'all', label: t.allServices },
      ...categoryBrowseItems.map((option) => ({ value: option.category, label: option.categoryLabel })),
    ],
    [categoryBrowseItems, t.allServices]
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
        <SectionHeading eyebrow="MARKETPLACE" title={title ?? t.title} description={description ?? t.description} />

        <nav aria-label={t.families} className="mt-6 flex flex-wrap gap-2">
          {[{ key: undefined, label: t.all }, ...marketplaceFamilyDefinitions.map((definition) => ({
            key: definition.key,
            label: definition.label[language],
          }))].map((item) => {
            const isActive = family === item.key;
            const href = item.key ? `/marketplace?family=${item.key}` : '/marketplace';

            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={buttonVariants({ variant: isActive ? 'gold' : 'outline', size: 'default' })}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <motion.div variants={sectionStagger} initial="hidden" whileInView="visible" viewport={revealViewport} className="mt-8 space-y-5">
          <motion.div variants={fadeUpItem}>
            <SectionSurface className="overflow-hidden border-[var(--color-gold)]/18 bg-[linear-gradient(150deg,rgba(255,255,255,0.9)_0%,rgba(248,242,231,0.84)_100%)] shadow-[0_24px_58px_rgba(13,27,42,0.1)]">
              <CardContent className="p-5 sm:p-6 lg:p-7">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold tracking-[0.24em] text-[var(--color-gold)]">SMART SEARCH</p>
                    <h3 className="mt-2 text-2xl font-semibold text-[var(--color-navy)] sm:text-3xl">{t.smartTitle}</h3>
                    <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">{t.smartDescription}</p>
                  </div>
                  <Badge className="self-start">
                    <FiCompass /> {t.discovery}
                  </Badge>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
                  <SearchField label={language === 'en' ? 'Search' : 'البحث'} value={searchInput} onChange={setSearchInput} placeholder={t.searchPlaceholder} />
                  <SelectField label={t.sort} value={sort} onChange={(next) => setSort(next as MarketplaceSortKey)} options={sortOptions} />
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
                    {t.searchNow}
                  </button>
                </div>

                <div className="mt-6 rounded-[24px] border border-[var(--color-gold)]/14 bg-white/72 p-4 sm:p-5">
                  <div className="mb-3 inline-flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-[var(--color-gold)] sm:text-sm">
                    <FiFilter /> {t.filters}
                  </div>
                  <MarketplaceFilters
                    value={advancedFilters}
                    destinationOptions={destinationOptions}
                    serviceTypeOptions={serviceTypeOptions}
                    onChange={(next) => {
                      setAdvancedFilters(next);
                      setPage(1);
                    }}
                  />
                  <p className="mt-3 text-xs leading-6 text-[var(--color-muted)]">
                    {t.filtersNote}
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
                <p className="mt-1 text-xs text-[var(--color-muted)]">{option.count} {t.result}</p>
              </motion.button>
            ))}
            {categoryBrowseItems.length === 0
              ? Array.from({ length: 2 }).map((_, index) => (
                  <div key={index} className="rounded-[22px] border border-dashed border-[var(--color-border)] bg-white/60 px-4 py-4 text-sm text-[var(--color-muted)]">
                    {t.categoriesPending}
                  </div>
                ))
              : null}
          </motion.div>

          <motion.div variants={fadeUpItem} className="rounded-[26px] border border-[color:var(--color-border)] bg-white/72 p-4 sm:p-5">
            <div className="flex flex-wrap gap-2">
              {collectionLabels.map((option) => {
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
                {t.browseCategories}: {activeFamilyLabel}
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
              {error} {t.safeError}
            </CardContent>
          </Card>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--color-muted)]">
          <Chip className="text-sm">{t.visible}: {services.length}</Chip>
          <Chip className="text-sm">{t.total}: {meta.total}</Chip>
          <Chip className="text-sm">{t.source}: {meta.hasRealData ? t.verified : t.noVerified}</Chip>
        </div>

        <div id="marketplace-results" className="mt-6">
          {!loading && services.length === 0 ? (
            <SectionSurface>
              <p className="text-xl font-semibold text-[var(--color-navy)]">{t.emptyTitle}</p>
              <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">{t.emptyDescription}</p>
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
                  {t.reset}
                </button>
                <Link href="/services" className={buttonVariants({ variant: 'outline', size: 'default' })}>
                  {t.browseServices}
                </Link>
                <Link href="/dabra" className={buttonVariants({ variant: 'outline', size: 'default' })}>
                  {t.askDabra}
                </Link>
              </div>
            </SectionSurface>
          ) : (
            <ServicesGrid services={services} loading={loading} emptyMessage={t.noResults} skeletonCount={6} />
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
              {t.previous}
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
              {t.next}
            </button>
          </div>
        ) : null}
      </ContentContainer>
    </SectionContainer>
  );
}
