export type MarketplaceFamilyKey =
  | 'dir3-drive'
  | 'dir3-stay'
  | 'dir3-fly'
  | 'dir3-concierge'
  | 'dir3-vip';

export const marketplaceFamilyDefinitions: ReadonlyArray<{
  key: MarketplaceFamilyKey;
  label: { ar: string; en: string };
}> = [
  { key: 'dir3-fly', label: { ar: 'الطيران', en: 'Fly' } },
  { key: 'dir3-stay', label: { ar: 'الإقامة', en: 'Stay' } },
  { key: 'dir3-drive', label: { ar: 'التنقّل', en: 'Drive' } },
  { key: 'dir3-concierge', label: { ar: 'الكونسيرج', en: 'Concierge' } },
  { key: 'dir3-vip', label: { ar: 'VIP', en: 'VIP' } },
];

export function isMarketplaceFamilyKey(value: string | undefined): value is MarketplaceFamilyKey {
  return marketplaceFamilyDefinitions.some((definition) => definition.key === value);
}

export function getMarketplaceFamilyLabel(
  family: MarketplaceFamilyKey | undefined,
  language: 'ar' | 'en',
  allLabel: string,
): string {
  return marketplaceFamilyDefinitions.find((definition) => definition.key === family)?.label[language] ?? allLabel;
}

function getMarketplaceFamilyBrandLabel(family: MarketplaceFamilyKey): string {
  return `dir3 ${family.slice('dir3-'.length).replace(/^./, (value) => value.toUpperCase())}`;
}

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

export type MarketplaceDataSource = 'supabase' | 'api' | 'fallback';
export type MarketplaceProvenance = 'PROVIDER_LIVE' | 'PARTNER_VERIFIED' | 'FALLBACK' | 'SYNTHETIC_TEST' | 'PROVIDER_SANDBOX';

export type MarketplaceAvailability = 'available' | 'limited' | 'sold-out';

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
  updated_at?: string | null;
  products?: RawServiceProduct[] | null;
  destination?: string | null;
  region_name?: string | null;
  availability_status?: string | null;
  marketplace_category?: string | null;
  marketplace_family?: 'drive' | 'stay' | 'fly' | 'concierge' | 'vip' | null;
  category_slug?: string | null;
  category_name_en?: string | null;
  category_name_ar?: string | null;
  fulfilment_state?: import('./truth').MarketplaceFulfilmentState | null;
  transaction_method?: import('./truth').MarketplaceTransactionMethod | null;
  marketplace_environment?: import('./truth').MarketplaceEnvironment | null;
  supply_type?: import('./truth').MarketplaceSupplyType | null;
  supplier_name?: string | null;
  supplier_verified?: boolean | null;
  primary_image_url?: string | null;
};

export type MarketplaceService = {
  id: string | number;
  slug: string;
  name_ar: string;
  name_en?: string;
  description_ar: string;
  description_en?: string;
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
  inventoryCount: number;
  availability: MarketplaceAvailability;
  destination: string;
  featured: boolean;
  popular: boolean;
  recommended: boolean;
  source: MarketplaceDataSource;
  provenance: MarketplaceProvenance;
  fulfilmentState?: import('./truth').MarketplaceFulfilmentState;
  transactionMethod?: import('./truth').MarketplaceTransactionMethod;
  marketplaceEnvironment?: import('./truth').MarketplaceEnvironment;
  supplyType?: import('./truth').MarketplaceSupplyType;
  supplierName?: string;
  supplierVerified?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
};

const storedFamilyToMarketplaceFamily: Record<NonNullable<RawServiceApiItem['marketplace_family']>, MarketplaceFamilyKey> = {
  drive: 'dir3-drive',
  stay: 'dir3-stay',
  fly: 'dir3-fly',
  concierge: 'dir3-concierge',
  vip: 'dir3-vip',
};

export type MarketplaceQueryOptions = {
  family?: MarketplaceFamilyKey;
  category?: MarketplacePageCategory;
  query?: string;
  collection?: MarketplaceCollectionKey;
  sort?: MarketplaceSortKey;
  destination?: string;
  budget?: string;
  travelers?: string;
  availability?: 'all' | MarketplaceAvailability;
};

export type MarketplaceQueryResult = {
  items: MarketplaceService[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export const marketplaceCatalogEntries: MarketplaceCatalogEntry[] = [
  {
    id: 'dir3-drive',
    family: 'dir3-drive',
    title: 'dir3 Drive',
    description: 'خيارات تنقل ومسارات مع عرض تفاصيل الخدمة قبل المتابعة.',
    icon: '/icons/drive.svg',
    href: '/services/drive',
    metric: 'تفاصيل الخدمة',
    category: 'cars',
    familyLabel: 'dir3 Drive',
    tags: ['سائق خاص', 'تنقلات مطار', 'سيارات تنفيذية'],
  },
  {
    id: 'dir3-stay',
    family: 'dir3-stay',
    title: 'dir3 Stay',
    description: 'خيارات فنادق وشقق مخدومة مع عرض المزايا والسياسات قبل المتابعة.',
    icon: '/icons/stay.svg',
    href: '/services/stay',
    metric: 'خيارات الإقامة',
    category: 'hotels',
    familyLabel: 'dir3 Stay',
    tags: ['إقامة راقية', 'شقق مخدومة', 'خيارات مرنة'],
  },
  {
    id: 'dir3-fly',
    family: 'dir3-fly',
    title: 'dir3 Fly',
    description: 'خيارات للوصول والمغادرة مع عرض تفاصيل الرحلة قبل المتابعة.',
    icon: '/icons/airport.svg',
    href: '/services/fly',
    metric: 'تفاصيل الرحلة',
    category: 'airport-transfers',
    familyLabel: 'dir3 Fly',
    tags: ['استقبال', 'مسار سريع', 'مرافقة'],
  },
  {
    id: 'dir3-concierge',
    family: 'dir3-concierge',
    title: 'dir3 Concierge',
    description: 'تنسيق الطلبات وتفاصيل الضيافة اليومية ضمن مسار واضح.',
    icon: '/icons/concierge.svg',
    href: '/services/concierge',
    metric: 'Concierge',
    category: 'concierge',
    familyLabel: 'dir3 Concierge',
    tags: ['طلبات مخصصة', 'تفاصيل الرحلة', 'تنسيق'],
  },
  {
    id: 'dir3-vip',
    family: 'dir3-vip',
    title: 'dir3 VIP',
    description: 'خدمات وتجارب VIP للضيوف والوفود مع عرض التفاصيل قبل تقديم الطلب.',
    icon: '/icons/concierge.svg',
    href: '/services/vip',
    metric: 'VIP',
    category: 'concierge',
    familyLabel: 'dir3 VIP',
    tags: ['ضيوف', 'وفود', 'طلبات مخصصة'],
  },
];

export const marketplaceSortOptions: Array<{ value: MarketplaceSortKey; label: string }> = [
  { value: 'recommended', label: 'الأكثر ملاءمة' },
  { value: 'featured', label: 'المميز أولا' },
  { value: 'popular', label: 'الأكثر شعبية' },
  { value: 'price-low', label: 'السعر: الأقل أولا' },
  { value: 'price-high', label: 'السعر: الأعلى أولا' },
  { value: 'name', label: 'الاسم' },
];

const categoryKeywords: Array<{ category: MarketplacePageCategory; keywords: string[] }> = [
  { category: 'cars', keywords: ['drive', 'car', 'cars', 'driver', 'سيار', 'نقل'] },
  { category: 'hotels', keywords: ['stay', 'hotel', 'hotels', 'فندق', 'إقامة'] },
  { category: 'apartments', keywords: ['apartment', 'apartments', 'شقق', 'شقة', 'residence'] },
  { category: 'airport-transfers', keywords: ['airport', 'مطار', 'arrival', 'transfer'] },
  { category: 'concierge', keywords: ['concierge', 'كونسيرج', 'vip'] },
  { category: 'experiences', keywords: ['experience', 'experiences', 'تجارب', 'فعاليات'] },
  { category: 'offers', keywords: ['offer', 'offers', 'عرض', 'عروض', 'deal', 'deals'] },
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

const destinationKeywords: Array<{ destination: string; keywords: string[] }> = [
  { destination: 'riyadh', keywords: ['riyadh', 'الرياض'] },
  { destination: 'jeddah', keywords: ['jeddah', 'جدة'] },
  { destination: 'makkah', keywords: ['makkah', 'mecca', 'مكة'] },
  { destination: 'madinah', keywords: ['madinah', 'medina', 'المدينة'] },
  { destination: 'dammam', keywords: ['dammam', 'الدمام'] },
  { destination: 'khobar', keywords: ['khobar', 'الخبر'] },
  { destination: 'abha', keywords: ['abha', 'أبها'] },
  { destination: 'taif', keywords: ['taif', 'الطائف'] },
  { destination: 'alula', keywords: ['alula', 'العلا'] },
  { destination: 'neom', keywords: ['neom', 'نيوم'] },
  { destination: 'cairo', keywords: ['cairo', 'القاهرة'] },
  { destination: 'giza', keywords: ['giza', 'الجيزة'] },
  { destination: 'alexandria', keywords: ['alexandria', 'الإسكندرية'] },
  { destination: 'hurghada', keywords: ['hurghada', 'الغردقة'] },
  { destination: 'sharm-el-sheikh', keywords: ['sharm', 'شرم'] },
  { destination: 'luxor', keywords: ['luxor', 'الأقصر'] },
  { destination: 'aswan', keywords: ['aswan', 'أسوان'] },
  { destination: 'marsa-alam', keywords: ['marsa', 'مرسى'] },
  { destination: 'new-alamein', keywords: ['alamein', 'العلمين'] },
  { destination: 'saudi-arabia', keywords: ['ksa', 'saudi', 'السعودية', 'المملكة'] },
  { destination: 'egypt', keywords: ['egypt', 'مصر'] },
];

function normalizeText(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase();
}

const explicitCategoryAliasMap: Record<string, MarketplacePageCategory> = {
  cars: 'cars',
  car: 'cars',
  hotels: 'hotels',
  hotel: 'hotels',
  apartments: 'apartments',
  apartment: 'apartments',
  'airport-transfers': 'airport-transfers',
  airport_transfers: 'airport-transfers',
  airport: 'airport-transfers',
  concierge: 'concierge',
  experiences: 'experiences',
  experience: 'experiences',
  offers: 'offers',
  offer: 'offers',
  سيارات: 'cars',
  فنادق: 'hotels',
  فندق: 'hotels',
  شقق: 'apartments',
  شقة: 'apartments',
  مطار: 'airport-transfers',
  كونسيرج: 'concierge',
  تجارب: 'experiences',
  عروض: 'offers',
};

function resolveExplicitCategory(item: RawServiceApiItem): MarketplacePageCategory | null {
  const candidates = [item.marketplace_category, item.category_slug, item.category_name_en, item.category_name_ar];

  for (const candidate of candidates) {
    const normalized = normalizeText(candidate).replace(/_/g, '-');
    if (!normalized) continue;

    const direct = explicitCategoryAliasMap[normalized];
    if (direct) {
      return direct;
    }

    if ((marketplaceCatalogEntries as MarketplaceCatalogEntry[]).some((entry) => entry.category === normalized)) {
      return normalized as MarketplacePageCategory;
    }
  }

  return null;
}

function inferCategory(item: RawServiceApiItem): MarketplacePageCategory {
  const explicitCategory = resolveExplicitCategory(item);
  if (explicitCategory) {
    return explicitCategory;
  }

  const haystack = [item.slug, item.name_ar, item.name_en, item.description_ar, item.description_en]
    .map(normalizeText)
    .join(' ');

  const match = categoryKeywords.find(({ keywords }) => keywords.some((keyword) => haystack.includes(keyword)));

  return match?.category ?? 'hotels';
}

function inferDestination(item: RawServiceApiItem) {
  const haystack = [item.destination, item.region_name, item.slug, item.name_ar, item.name_en, item.description_ar, item.description_en]
    .map(normalizeText)
    .join(' ');

  const matchedDestination = destinationKeywords.find(({ keywords }) => keywords.some((keyword) => haystack.includes(keyword)));

  return matchedDestination?.destination ?? 'saudi-arabia';
}

function inferAvailability(item: RawServiceApiItem, productCount: number): MarketplaceAvailability {
  const status = normalizeText(item.availability_status ?? item.status);

  if (status.includes('sold') || status.includes('نفذ')) {
    return 'sold-out';
  }

  if (status.includes('limited') || status.includes('few') || productCount === 1) {
    return 'limited';
  }

  return productCount > 0 ? 'available' : 'limited';
}

function categoryToFamily(category: MarketplacePageCategory): MarketplaceFamilyKey {
  if (category === 'cars') return 'dir3-drive';
  if (category === 'hotels' || category === 'apartments') return 'dir3-stay';
  if (category === 'airport-transfers') return 'dir3-drive';
  if (category === 'concierge') return 'dir3-concierge';
  // experiences and offers are catalog collections, surfaced under dir3 Concierge.
  return 'dir3-concierge';
}

function resolveMarketplaceFamily(item: RawServiceApiItem, category: MarketplacePageCategory): MarketplaceFamilyKey {
  const haystack = [item.slug, item.name_ar, item.name_en, item.description_ar, item.description_en, item.marketplace_category, item.category_slug]
    .map(normalizeText)
    .join(' ');
  const airportContext = /airport|مطار/.test(haystack) || category === 'airport-transfers';
  const vipHandling = /vip|meet.?and.?assist|fast.?track|استقبال كبار|كبار الشخصيات/.test(haystack);
  const groundTransfer = /transfer|chauffeur|pickup|pick-up|dropoff|drop-off|driver|taxi|نقل|سائق|توصيل/.test(haystack);
  const airTravel = /flight|airline|airfare|boarding|air ticket|رحلة جوية|رحلات جوية|طيران|تذكرة طيران/.test(haystack);

  if (airportContext && vipHandling) return 'dir3-vip';
  if (airTravel) return 'dir3-fly';
  if (airportContext && groundTransfer) return 'dir3-drive';
  if (category === 'airport-transfers') return 'dir3-drive';
  return item.marketplace_family ? storedFamilyToMarketplaceFamily[item.marketplace_family] : categoryToFamily(category);
}

function findCatalogEntry(category: MarketplacePageCategory) {
  return marketplaceCatalogEntries.find((entry) => entry.category === category) ?? marketplaceCatalogEntries[0];
}

function resolveServiceHref(item: RawServiceApiItem, catalogEntry: MarketplaceCatalogEntry, fallbackSlug: string) {
  const normalizedSlug = normalizeText(item.slug);

  if (normalizedSlug) {
    return `/services/${normalizedSlug}`;
  }

  if (catalogEntry.href.startsWith('/')) {
    return catalogEntry.href;
  }

  return `/services/${fallbackSlug}`;
}

function buildFallbackService(entry: MarketplaceCatalogEntry, index: number): MarketplaceService {
  return {
    id: `fallback-${entry.category}-${index}`,
    slug: `fallback-${entry.category}`,
    name_ar: entry.title,
    name_en: entry.title,
    description_ar: entry.description,
    description_en: entry.description,
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
    inventoryCount: 0,
    availability: 'limited',
    destination: 'saudi-arabia',
    featured: entry.family === 'dir3-stay' || entry.family === 'dir3-drive',
    popular: entry.category === 'cars' || entry.category === 'hotels',
    recommended: true,
    source: 'fallback',
    provenance: 'FALLBACK',
    fulfilmentState: 'catalog_only',
    transactionMethod: 'none',
    marketplaceEnvironment: 'fallback',
    supplyType: 'unknown',
    supplierVerified: false,
    createdAt: null,
    updatedAt: null,
  };
}

export function createMarketplaceFallbackServices() {
  return marketplaceCatalogEntries.map(buildFallbackService);
}

export function normalizeMarketplaceServices(
  data: unknown,
  includeFallbackOrOptions: boolean | { includeFallback?: boolean; source?: MarketplaceDataSource } = true
): MarketplaceService[] {
  const includeFallback =
    typeof includeFallbackOrOptions === 'boolean' ? includeFallbackOrOptions : includeFallbackOrOptions.includeFallback ?? true;
  const sourceLabel = typeof includeFallbackOrOptions === 'boolean' ? 'api' : includeFallbackOrOptions.source ?? 'api';

  const source = Array.isArray(data) ? (data as RawServiceApiItem[]) : [];
  const normalized = source.map((item, index) => {
    const category = inferCategory(item);
    const catalogEntry = findCatalogEntry(category);
    const family = resolveMarketplaceFamily(item, category);
    const familyLabel = getMarketplaceFamilyBrandLabel(family);
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
    const destination = inferDestination(item);
    const availability = inferAvailability(item, productCount);
    const fallbackSlug = `${family}-${index + 1}`;

    return {
      id: item.id ?? index + 1,
      slug: item.slug ?? fallbackSlug,
      name_ar: item.name_ar ?? item.name_en ?? catalogEntry.title,
      name_en: item.name_en ?? item.name_ar ?? catalogEntry.title,
      description_ar: item.description_ar ?? item.description_en ?? catalogEntry.description,
      description_en: item.description_en ?? item.description_ar ?? catalogEntry.description,
      badge: familyLabel,
      family,
      familyLabel,
      category,
      categoryLabel: categoryLabels[category],
      icon: item.primary_image_url ?? catalogEntry.icon,
      href: resolveServiceHref(item, catalogEntry, fallbackSlug),
      metric: productCount > 0 ? `${productCount} خيارات` : catalogEntry.metric,
      tags: catalogEntry.tags,
      basePrice,
      currency: item.currency ?? 'SAR',
      productCount,
      inventoryCount: productCount,
      availability,
      destination,
      featured,
      popular,
      recommended,
      source: sourceLabel,
      provenance: sourceLabel === 'fallback'
        ? 'FALLBACK'
        : item.supplier_verified === true
          ? 'PARTNER_VERIFIED'
          : 'PROVIDER_LIVE',
      fulfilmentState: item.fulfilment_state ?? 'catalog_only',
      transactionMethod: item.transaction_method ?? 'none',
      marketplaceEnvironment: item.marketplace_environment ?? (sourceLabel === 'fallback' ? 'fallback' : 'production'),
      supplyType: item.supply_type ?? 'unknown',
      supplierName: item.supplier_name ?? undefined,
      supplierVerified: item.supplier_verified === true,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
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

function buildServiceHaystack(service: MarketplaceService) {
  return [
    service.name_ar,
    service.name_en,
    service.description_ar,
    service.description_en,
    service.familyLabel,
    service.categoryLabel,
    service.destination,
    ...service.tags,
  ]
    .map(normalizeText)
    .join(' ');
}

function withinBudget(price: number, budget?: string) {
  if (!budget || budget === 'all') return true;
  if (budget === '0-2000') return price > 0 && price <= 2000;
  if (budget === '2000-5000') return price >= 2000 && price <= 5000;
  if (budget === '5000+') return price >= 5000;
  return true;
}

function withinTravelerGroup(productCount: number, travelers?: string) {
  if (!travelers || travelers === 'all') return true;
  if (travelers === '1') return productCount >= 1;
  if (travelers === '2') return productCount >= 2;
  if (travelers === '3+') return productCount >= 3;
  return true;
}

export function filterMarketplaceServices(services: MarketplaceService[], options: MarketplaceQueryOptions) {
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

    if (options.destination && options.destination !== 'all' && service.destination !== options.destination) {
      return false;
    }

    if (options.availability && options.availability !== 'all' && service.availability !== options.availability) {
      return false;
    }

    if (!withinBudget(service.basePrice, options.budget)) {
      return false;
    }

    if (!withinTravelerGroup(service.productCount, options.travelers)) {
      return false;
    }

    if (!query) {
      return true;
    }

    return buildServiceHaystack(service).includes(query);
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

export function paginateMarketplaceServices(services: MarketplaceService[], page = 1, pageSize = 9): MarketplaceQueryResult {
  const safePageSize = Math.max(1, pageSize);
  const total = services.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const normalizedPage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (normalizedPage - 1) * safePageSize;
  const items = services.slice(startIndex, startIndex + safePageSize);

  return {
    items,
    total,
    page: normalizedPage,
    pageSize: safePageSize,
    totalPages,
  };
}

export function queryMarketplaceServices(
  services: MarketplaceService[],
  options: MarketplaceQueryOptions & { page?: number; pageSize?: number }
) {
  const filtered = filterMarketplaceServices(services, options);
  return paginateMarketplaceServices(filtered, options.page ?? 1, options.pageSize ?? 9);
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

export function summarizeMarketplace(services: MarketplaceService[]) {
  const categories = marketplaceCatalogEntries.map((entry) => ({
    category: entry.category,
    label: categoryLabels[entry.category],
    count: services.filter((service) => service.category === entry.category).length,
  }));

  const collections: Record<MarketplaceCollectionKey, number> = {
    all: services.length,
    featured: services.filter((service) => service.featured).length,
    popular: services.filter((service) => service.popular).length,
    recommended: services.filter((service) => service.recommended).length,
  };

  return {
    categories,
    collections,
  };
}
