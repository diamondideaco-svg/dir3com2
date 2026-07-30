export type MarketplaceFamilyKey =
  | 'dir3-drive'
  | 'dir3-stay'
  | 'dir3-airport'
  | 'dir3-concierge'
  | 'dir3-experiences';

export type MarketplacePageCategory =
  | 'cars'
  | 'hotels'
  | 'apartments'
  | 'airport-transfers'
  | 'concierge'
  | 'experiences'
  | 'offers';

export type MarketplaceCollectionKey = 'all' | 'featured' | 'popular' | 'recommended';

export type MarketplaceSortKey = 'recommended' | 'featured' | 'popular' | 'price-low' | 'price-high' | 'name';

export type MarketplaceCatalogEntry = {
  id: string;
  family: MarketplaceFamilyKey;
  title: string;
  description: string;
  icon: string;
  href: string;
  metric: string;
  category: MarketplacePageCategory;
  familyLabel: string;
  tags: string[];
};

type RawServiceProduct = {
  id?: string | number | null;
  price_per_unit?: number | null;
};

type RawServiceApiItem = {
  id?: string | number | null;
  slug?: string | null;
  name_ar?: string | null;
  name_en?: string | null;
  description_ar?: string | null;
  description_en?: string | null;
  base_price?: number | null;
  currency?: string | null;
  status?: string | null;
  featured?: boolean | null;
  created_at?: string | null;
  products?: RawServiceProduct[] | null;
};

export type MarketplaceService = {
  id: string | number;
  slug: string;
  name_ar: string;
  description_ar: string;
  badge: string;
  family: MarketplaceFamilyKey;
  familyLabel: string;
  category: MarketplacePageCategory;
  categoryLabel: string;
  icon: string;
  href: string;
  metric: string;
  tags: string[];
  basePrice: number;
  currency: string;
  productCount: number;
  featured: boolean;
  popular: boolean;
  recommended: boolean;
  createdAt?: string | null;
};

export const marketplaceCatalogEntries: MarketplaceCatalogEntry[] = [
  {
    id: 'dir3-drive',
    family: 'dir3-drive',
    title: 'السيارات',
    description: 'تنقلات مختارة، سائقون محترفون، ومسارات واضحة مصممة للضيف المحلي والدولي.',
    icon: '/icons/drive.svg',
    href: '/cars',
    metric: '24/7',
    category: 'cars',
    familyLabel: 'dir3 drive',
    tags: ['سائق خاص', 'تنقلات مطار', 'سيارات تنفيذية'],
  },
  {
    id: 'dir3-stay-hotels',
    family: 'dir3-stay',
    title: 'الفنادق',
    description: 'إقامات فاخرة مع عرض ذكي للمزايا وسياسات واضحة قبل الحجز.',
    icon: '/icons/stay.svg',
    href: '/hotels',
    metric: '120+',
    category: 'hotels',
    familyLabel: 'dir3 stay',
    tags: ['إقامة راقية', 'إفطار فاخر', 'خيارات مرنة'],
  },
  {
    id: 'dir3-stay-apartments',
    family: 'dir3-stay',
    title: 'الشقق',
    description: 'خيارات إقامة مرنة للعائلات والإقامات المطولة ضمن نفس تجربة dir3com الراقية.',
    icon: '/icons/stay.svg',
    href: '/apartments',
    metric: 'Long Stay',
    category: 'apartments',
    familyLabel: 'dir3 stay',
    tags: ['شقق مخدومة', 'عائلات', 'إقامة مطولة'],
  },
  {
    id: 'dir3-airport',
    family: 'dir3-airport',
    title: 'المطار والاستقبال',
    description: 'خدمة استقبال وانطلاق ناعمة مع جاهزية مستقبلية للربط مع الحالات الحية والتنبيهات.',
    icon: '/icons/airport.svg',
    href: '/airport-transfers',
    metric: 'Fast Lane',
    category: 'airport-transfers',
    familyLabel: 'dir3 airport',
    tags: ['استقبال', 'مسار سريع', 'مرافقة'],
  },
  {
    id: 'dir3-concierge',
    family: 'dir3-concierge',
    title: 'الكونسيرج',
    description: 'تنسيق متكامل للطلبات الخاصة، من الطيران الأرضي حتى تفاصيل الضيافة اليومية.',
    icon: '/icons/concierge.svg',
    href: '/concierge',
    metric: 'VIP',
    category: 'concierge',
    familyLabel: 'dir3 concierge',
    tags: ['مساعدة شخصية', 'متابعة يومية', 'دعم فوري'],
  },
  {
    id: 'dir3-experiences',
    family: 'dir3-experiences',
    title: 'التجارب',
    description: 'أنشطة مختارة تنقل روح السعودية بلمسة ثقافية قريبة من الذائقة المصرية.',
    icon: '/icons/experiences.svg',
    href: '/experiences',
    metric: '48',
    category: 'experiences',
    familyLabel: 'dir3 experiences',
    tags: ['فعاليات', 'ثقافة', 'رحلات خاصة'],
  },
];

export const marketplaceSortOptions: Array<{ value: MarketplaceSortKey; label: string }> = [
  { value: 'recommended', label: 'الأكثر ملاءمة' },
  { value: 'featured', label: 'المميز أولاً' },
  { value: 'popular', label: 'الأكثر شعبية' },
  { value: 'price-low', label: 'السعر: الأقل أولاً' },
  { value: 'price-high', label: 'السعر: الأعلى أولاً' },
  { value: 'name', label: 'الاسم' },
];

const categoryKeywords: Array<{ category: MarketplacePageCategory; keywords: string[] }> = [
  { category: 'cars', keywords: ['drive', 'car', 'cars', 'driver', 'سيار', 'نقل'] },
  { category: 'hotels', keywords: ['stay', 'hotel', 'hotels', 'فندق', 'إقامة'] },
  { category: 'apartments', keywords: ['apartment', 'apartments', 'شقق', 'شقة', 'residence'] },
  { category: 'airport-transfers', keywords: ['airport', 'مطار', 'arrival', 'transfer'] },
  { category: 'concierge', keywords: ['concierge', 'كونسيرج', 'vip'] },
  { category: 'experiences', keywords: ['experience', 'experiences', 'تجارب', 'فعاليات'] },
];

const categoryLabels: Record<MarketplacePageCategory, string> = {
  cars: 'السيارات',
  hotels: 'الفنادق',
  apartments: 'الشقق',
  'airport-transfers': 'النقل من وإلى المطار',
  concierge: 'الكونسيرج',
  experiences: 'التجارب',
  offers: 'العروض',
};

function normalizeText(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase();
}

function inferCategory(item: RawServiceApiItem): MarketplacePageCategory {
  const haystack = [item.slug, item.name_ar, item.name_en, item.description_ar, item.description_en]
    .map(normalizeText)
    .join(' ');

  const match = categoryKeywords.find(({ keywords }) => keywords.some((keyword) => haystack.includes(keyword)));

  return match?.category ?? 'hotels';
}

function categoryToFamily(category: MarketplacePageCategory): MarketplaceFamilyKey {
  if (category === 'cars') return 'dir3-drive';
  if (category === 'hotels' || category === 'apartments') return 'dir3-stay';
  if (category === 'airport-transfers') return 'dir3-airport';
  if (category === 'concierge') return 'dir3-concierge';
  return 'dir3-experiences';
}

function findCatalogEntry(category: MarketplacePageCategory) {
  return marketplaceCatalogEntries.find((entry) => entry.category === category) ?? marketplaceCatalogEntries[0];
}

function buildFallbackService(entry: MarketplaceCatalogEntry, index: number): MarketplaceService {
  return {
    id: `fallback-${entry.category}-${index}`,
    slug: `fallback-${entry.category}`,
    name_ar: entry.title,
    description_ar: entry.description,
    badge: entry.familyLabel,
    family: entry.family,
    familyLabel: entry.familyLabel,
    category: entry.category,
    categoryLabel: entry.title,
    icon: entry.icon,
    href: entry.href,
    metric: entry.metric,
    tags: entry.tags,
    basePrice: 0,
    currency: 'SAR',
    productCount: 0,
    featured: entry.family === 'dir3-stay' || entry.family === 'dir3-drive',
    popular: entry.category === 'cars' || entry.category === 'hotels',
    recommended: true,
    createdAt: null,
  };
}

export function createMarketplaceFallbackServices() {
  return marketplaceCatalogEntries.map(buildFallbackService);
}

export function normalizeMarketplaceServices(data: unknown, includeFallback = true): MarketplaceService[] {
  const source = Array.isArray(data) ? (data as RawServiceApiItem[]) : [];
  const normalized = source.map((item, index) => {
    const category = inferCategory(item);
    const catalogEntry = findCatalogEntry(category);
    const family = categoryToFamily(category);
    const productCount = Array.isArray(item.products) ? item.products.length : 0;
    const basePriceFromProducts = Array.isArray(item.products)
      ? item.products
          .map((product) => Number(product.price_per_unit ?? 0))
          .filter((price) => Number.isFinite(price) && price > 0)
          .sort((left, right) => left - right)[0] ?? 0
      : 0;
    const basePrice = Number(item.base_price ?? basePriceFromProducts ?? 0);
    const featured = Boolean(item.featured) || item.status === 'featured';
    const popular = productCount >= 2 || index < 2;
    const recommended = featured || productCount > 0 || family === 'dir3-stay' || family === 'dir3-drive';

    return {
      id: item.id ?? index + 1,
      slug: item.slug ?? `${family}-${index + 1}`,
      name_ar: item.name_ar ?? item.name_en ?? catalogEntry.title,
      description_ar: item.description_ar ?? item.description_en ?? catalogEntry.description,
      badge: catalogEntry.familyLabel,
      family,
      familyLabel: catalogEntry.familyLabel,
      category,
      categoryLabel: categoryLabels[category],
      icon: catalogEntry.icon,
      href: `/services/${item.slug ?? `${family}-${index + 1}`}`,
      metric: productCount > 0 ? `${productCount} خيارات` : catalogEntry.metric,
      tags: catalogEntry.tags,
      basePrice,
      currency: item.currency ?? 'SAR',
      productCount,
      featured,
      popular,
      recommended,
      createdAt: item.created_at,
    } satisfies MarketplaceService;
  });

  if (!includeFallback) {
    return normalized;
  }

  const missingCategories = marketplaceCatalogEntries.filter(
    (entry) => !normalized.some((service) => service.category === entry.category)
  );

  return [...normalized, ...missingCategories.map((entry, index) => buildFallbackService(entry, index))];
}

export function filterMarketplaceServices(
  services: MarketplaceService[],
  options: {
    family?: MarketplaceFamilyKey;
    category?: MarketplacePageCategory;
    query?: string;
    collection?: MarketplaceCollectionKey;
    sort?: MarketplaceSortKey;
  }
) {
  const query = normalizeText(options.query);
  const collection = options.collection ?? 'all';
  const sort = options.sort ?? 'recommended';

  const filtered = services.filter((service) => {
    if (options.family && service.family !== options.family) {
      return false;
    }

    if (options.category && service.category !== options.category) {
      return false;
    }

    if (collection === 'featured' && !service.featured) {
      return false;
    }

    if (collection === 'popular' && !service.popular) {
      return false;
    }

    if (collection === 'recommended' && !service.recommended) {
      return false;
    }

    if (!query) {
      return true;
    }

    const haystack = [service.name_ar, service.description_ar, service.familyLabel, service.categoryLabel, ...service.tags]
      .map(normalizeText)
      .join(' ');

    return haystack.includes(query);
  });

  return filtered.sort((left, right) => {
    if (sort === 'name') {
      return left.name_ar.localeCompare(right.name_ar, 'ar');
    }

    if (sort === 'price-low') {
      return left.basePrice - right.basePrice;
    }

    if (sort === 'price-high') {
      return right.basePrice - left.basePrice;
    }

    if (sort === 'featured') {
      return Number(right.featured) - Number(left.featured) || right.productCount - left.productCount;
    }

    if (sort === 'popular') {
      return Number(right.popular) - Number(left.popular) || right.productCount - left.productCount;
    }

    return (
      Number(right.recommended) - Number(left.recommended) ||
      Number(right.featured) - Number(left.featured) ||
      Number(right.popular) - Number(left.popular) ||
      right.productCount - left.productCount ||
      left.basePrice - right.basePrice
    );
  });
}

export function getMarketplaceCategoryOptions(services: MarketplaceService[], family?: MarketplaceFamilyKey) {
  const scoped = family ? services.filter((service) => service.family === family) : services;
  const seen = new Set<MarketplacePageCategory>();

  return scoped.filter((service) => {
    if (seen.has(service.category)) {
      return false;
    }

    seen.add(service.category);
    return true;
  });
}

export function countMarketplaceCollection(
  services: MarketplaceService[],
  collection: MarketplaceCollectionKey,
  family?: MarketplaceFamilyKey
) {
  return filterMarketplaceServices(services, { family, collection }).length;
}