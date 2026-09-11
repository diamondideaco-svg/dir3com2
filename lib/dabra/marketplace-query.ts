import type { MarketplaceAvailability, MarketplaceFamilyKey, MarketplacePageCategory } from '@/lib/marketplace/data';

export type DabraMarketplaceQuery = {
  query?: string;
  family?: MarketplaceFamilyKey;
  category?: MarketplacePageCategory;
  destination?: string;
  make?: string;
  model?: string;
};

const familyKeys: Record<string, MarketplaceFamilyKey> = {
  drive: 'dir3-drive',
  stay: 'dir3-stay',
  fly: 'dir3-fly',
  concierge: 'dir3-concierge',
  vip: 'dir3-vip',
};

export function normalizeDabraMarketplaceFamily(value: unknown): MarketplaceFamilyKey {
  if (typeof value !== 'string') return 'dir3-concierge';
  const normalized = value.trim().toLowerCase().replace(/^dir3-/, '');
  return familyKeys[normalized] ?? 'dir3-concierge';
}

export function normalizeDabraAvailability(value: unknown): MarketplaceAvailability {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized.includes('sold') || normalized.includes('unavailable') || normalized.includes('نفد') ||
      normalized === 'full' || normalized === 'maintenance' || normalized === 'blackout') return 'sold-out';
  if (normalized.includes('partial') || normalized.includes('limited') || normalized.includes('few') || normalized.includes('جزئي')) return 'limited';
  if (normalized.includes('available') || normalized.includes('متاح')) return 'available';
  return 'limited';
}

const families: Array<{ value: MarketplaceFamilyKey; terms: string[] }> = [
  { value: 'dir3-fly', terms: ['fly', 'flight', 'flights', 'airline', 'طيران', 'رحلة جوية', 'رحلات جوية'] },
  { value: 'dir3-stay', terms: ['stay', 'hotel', 'hotels', 'apartment', 'apartments', 'إقامة', 'فندق', 'فنادق', 'شقة', 'شقق'] },
  { value: 'dir3-drive', terms: ['drive', 'car', 'cars', 'chauffeur', 'سيارة', 'سيارات', 'سائق', 'توصيل'] },
  { value: 'dir3-concierge', terms: ['concierge', 'كونسيرج'] },
  { value: 'dir3-vip', terms: ['vip', 'في آي بي', 'كبار الشخصيات'] },
];

const categories: Array<{ value: MarketplacePageCategory; terms: string[] }> = [
  { value: 'cars', terms: ['car', 'cars', 'sedan', 'suv', 'سيارة', 'سيارات'] },
  { value: 'hotels', terms: ['hotel', 'hotels', 'فندق', 'فنادق'] },
  { value: 'apartments', terms: ['apartment', 'apartments', 'شقة', 'شقق'] },
  { value: 'airport-transfers', terms: ['airport transfer', 'airport pickup', 'نقل المطار', 'توصيل المطار'] },
  { value: 'concierge', terms: ['concierge', 'كونسيرج'] },
  { value: 'experiences', terms: ['experience', 'experiences', 'تجربة', 'تجارب'] },
  { value: 'offers', terms: ['offer', 'offers', 'deal', 'deals', 'عرض', 'عروض'] },
];

const destinations: Array<{ value: string; terms: string[] }> = [
  { value: 'riyadh', terms: ['riyadh', 'الرياض'] },
  { value: 'jeddah', terms: ['jeddah', 'جدة'] },
  { value: 'makkah', terms: ['makkah', 'mecca', 'مكة'] },
  { value: 'madinah', terms: ['madinah', 'medina', 'المدينة'] },
  { value: 'dammam', terms: ['dammam', 'الدمام'] },
  { value: 'khobar', terms: ['khobar', 'الخبر'] },
  { value: 'alula', terms: ['alula', 'العلا'] },
  { value: 'cairo', terms: ['cairo', 'القاهرة'] },
  { value: 'alexandria', terms: ['alexandria', 'الإسكندرية'] },
  { value: 'sharm-el-sheikh', terms: ['sharm el sheikh', 'sharm', 'شرم الشيخ', 'شرم'] },
];

const makes = ['toyota', 'lexus', 'mercedes', 'bmw', 'audi', 'نيسان', 'تويوتا', 'لكزس', 'مرسيدس', 'بي إم دبليو'];

function normalized(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

function firstMatch<T>(query: string, values: Array<{ value: T; terms: string[] }>) {
  return values.find(({ terms }) => terms.some((term) => query.includes(term)))?.value;
}

export function parseDabraMarketplaceQuery(input: string, selectedFamily?: MarketplaceFamilyKey): DabraMarketplaceQuery {
  const query = normalized(input).slice(0, 200);
  const family = selectedFamily ?? firstMatch(query, families);
  const category = firstMatch(query, categories);
  const destination = firstMatch(query, destinations);
  const make = makes.find((term) => query.includes(term));
  const modelMatch = query.match(/(?:model|موديل)\s+([\p{L}\p{N}-]{1,32})/u);

  return {
    query: query || undefined,
    family,
    category,
    destination,
    make,
    model: modelMatch?.[1],
  };
}

export function toMarketplaceSearchParams(parsed: DabraMarketplaceQuery, pageSize = 12) {
  const params = new URLSearchParams({ pageSize: String(pageSize) });
  if (parsed.family) params.set('family', parsed.family);
  if (parsed.category) params.set('category', parsed.category);
  if (parsed.destination) params.set('destination', parsed.destination);
  const productTerms = [parsed.make, parsed.model].filter(Boolean).join(' ');
  // A recognized destination is sent through the explicit server-side city
  // filter; avoid forcing the full natural-language phrase into `q`.
  const query = productTerms || (parsed.destination ? undefined : parsed.query);
  if (query) params.set('query', query);
  return params;
}
