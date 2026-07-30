'use client';

import { useDeferredValue, useState } from 'react';
import { FiSearch } from 'react-icons/fi';
import SectionHeading from '@/components/home/SectionHeading';
import ServicesGrid from '@/components/home/ServicesGrid';
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
import { useMarketplaceServices } from '@/components/public/useMarketplaceServices';

type MarketplaceExplorerProps = {
  title: string;
  description: string;
  family?: MarketplaceFamilyKey;
  defaultCategory?: MarketplacePageCategory;
  defaultCollection?: MarketplaceCollectionKey;
};

const collectionLabels: Array<{ value: MarketplaceCollectionKey; label: string }> = [
  { value: 'all', label: 'الكل' },
  { value: 'featured', label: 'Featured' },
  { value: 'popular', label: 'Popular' },
  { value: 'recommended', label: 'Recommended' },
];

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
  const deferredQuery = useDeferredValue(query);

  const availableCategories = getMarketplaceCategoryOptions(services, family);
  const activeCategory = category === 'all' ? undefined : category;
  const visibleServices = filterMarketplaceServices(services, {
    family,
    category: activeCategory,
    query: deferredQuery,
    collection,
    sort,
  });

  return (
    <section className="px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionHeading eyebrow="MARKETPLACE" title={title} description={description} />

        <Card className="mt-8 bg-white/84">
          <CardContent className="p-5 sm:p-6">
            <div className="grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-muted)]">Search</span>
                <span className="flex items-center gap-3 rounded-[22px] border border-[color:var(--color-border)] bg-[var(--color-shell)] px-4 py-3">
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
                <span className="mb-2 block text-sm font-medium text-[var(--color-muted)]">Sort</span>
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as MarketplaceSortKey)}
                  className="w-full rounded-[22px] border border-[color:var(--color-border)] bg-[var(--color-shell)] px-4 py-3 text-sm text-[var(--color-navy)] outline-none"
                >
                  {marketplaceSortOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {collectionLabels.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setCollection(option.value)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
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
                onClick={() => setCategory('all')}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  category === 'all'
                    ? 'bg-[var(--color-gold)] text-[var(--color-navy)]'
                    : 'border border-[color:var(--color-border)] bg-[var(--color-shell)] text-[var(--color-navy)] hover:border-[var(--color-gold)]'
                }`}
              >
                Categories: الكل
              </button>
              {availableCategories.map((option) => (
                <button
                  key={option.category}
                  type="button"
                  onClick={() => setCategory(option.category)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    category === option.category
                      ? 'bg-[var(--color-gold)] text-[var(--color-navy)]'
                      : 'border border-[color:var(--color-border)] bg-[var(--color-shell)] text-[var(--color-navy)] hover:border-[var(--color-gold)]'
                  }`}
                >
                  {option.categoryLabel}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {error && (
          <Card className="mt-6 border-[var(--color-gold)]/25 bg-[var(--color-gold)]/10 shadow-none">
            <CardContent className="p-4 text-sm text-[var(--color-navy)]">
              {error} تم عرض طبقة البيانات المشتركة الاحتياطية بدلاً من ذلك.
            </CardContent>
          </Card>
        )}

        <div className="mt-6 flex items-center justify-between gap-3 text-sm text-[var(--color-muted)]">
          <span>النتائج الظاهرة: {visibleServices.length}</span>
          <span>{family ? 'عرض مفلتر حسب عائلة الخدمة' : 'عرض السوق الكامل'}</span>
        </div>

        <div className="mt-6">
          <ServicesGrid services={visibleServices} loading={loading} emptyMessage="لا توجد نتائج مطابقة للمرشحات الحالية." />
        </div>
      </div>
    </section>
  );
}