import type {
  MarketplaceAvailability,
  MarketplaceCollectionKey,
  MarketplaceFamilyKey,
  MarketplacePageCategory,
  MarketplaceService,
  MarketplaceSortKey,
} from '@/lib/marketplace/data';

export type AIProviderId = 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'azure-openai' | 'local';

export type SearchLanguage = 'ar' | 'en' | 'mixed';

export type MarketplaceSearchRequest = {
  destination: string;
  serviceType: string;
  dates: {
    checkIn?: string;
    checkOut?: string;
  };
  travelers: string;
  budget: string;
  language: SearchLanguage;
  userIntent: string;
  query: string;
  family?: MarketplaceFamilyKey;
  collection?: MarketplaceCollectionKey;
  sort?: MarketplaceSortKey;
  availability?: 'all' | MarketplaceAvailability;
  page: number;
  pageSize: number;
};

export type MarketplaceSearchResultItem = {
  service: MarketplaceService;
  score: number;
  rationale: string;
};

export type MarketplaceSearchResult = {
  items: MarketplaceService[];
  scoredItems: MarketplaceSearchResultItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  provider: AIProviderId;
  usedAI: boolean;
  fallbackReason?: string;
};

export type MarketplaceAISearchPayload = {
  services: MarketplaceService[];
  meta: {
    source: 'supabase' | 'api' | 'fallback';
    hasRealData: boolean;
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    generatedAt: string;
    facets: {
      categories: Array<{ category: string; label: string; count: number }>;
      collections: Record<MarketplaceCollectionKey, number>;
    };
    search: {
      provider: AIProviderId;
      usedAI: boolean;
      fallbackReason?: string;
    };
  };
};

export type AIProviderSearchContext = {
  request: MarketplaceSearchRequest;
  services: MarketplaceService[];
};

export type AIProviderSearchResponse = {
  provider: AIProviderId;
  items: MarketplaceSearchResultItem[];
  usedAI: boolean;
  fallbackReason?: string;
};

export interface AIProviderAdapter {
  id: AIProviderId;
  isEnabled(config: AISearchConfig): boolean;
  search(context: AIProviderSearchContext): Promise<AIProviderSearchResponse | null>;
}

export type AISearchConfig = {
  aiEnabled: boolean;
  provider: AIProviderId;
  providers: Record<AIProviderId, { enabled: boolean; apiKey: string }>;
};

export type MarketplaceAdapterVertical = 'hotels' | 'flights' | 'cars' | 'activities' | 'concierge' | 'apartments';

export type MarketplaceAdapterSearchRequest = {
  destination: string;
  checkIn?: string;
  checkOut?: string;
  travelers: string;
  budget: string;
  language: SearchLanguage;
};

export type MarketplaceAdapterSearchResult = {
  vertical: MarketplaceAdapterVertical;
  items: Array<Record<string, unknown>>;
  total: number;
  page: number;
  pageSize: number;
};

export interface MarketplaceVerticalAdapter {
  vertical: MarketplaceAdapterVertical;
  search(request: MarketplaceAdapterSearchRequest): Promise<MarketplaceAdapterSearchResult>;
}

const categorySet = new Set<MarketplacePageCategory>([
  'cars',
  'hotels',
  'apartments',
  'airport-transfers',
  'concierge',
  'experiences',
  'offers',
]);

const arabicRegex = /[\u0600-\u06FF]/;
const latinRegex = /[A-Za-z]/;

function inferLanguage(query: string, userIntent: string): SearchLanguage {
  const probe = `${query} ${userIntent}`;
  const hasArabic = arabicRegex.test(probe);
  const hasLatin = latinRegex.test(probe);

  if (hasArabic && hasLatin) return 'mixed';
  if (hasArabic) return 'ar';
  if (hasLatin) return 'en';
  return 'ar';
}

export function normalizeMarketplaceSearchRequest(input: Partial<MarketplaceSearchRequest> & {
  query?: string;
  destination?: string;
  serviceType?: string;
  dates?: { checkIn?: string; checkOut?: string };
  travelers?: string;
  budget?: string;
  language?: SearchLanguage;
  userIntent?: string;
  family?: MarketplaceFamilyKey;
  collection?: MarketplaceCollectionKey;
  sort?: MarketplaceSortKey;
  availability?: 'all' | MarketplaceAvailability;
  page?: number;
  pageSize?: number;
}) {
  const query = (input.query ?? '').trim();
  const serviceType = (input.serviceType ?? 'all').trim();

  return {
    destination: (input.destination ?? 'all').trim() || 'all',
    serviceType: serviceType || 'all',
    dates: {
      checkIn: input.dates?.checkIn ?? undefined,
      checkOut: input.dates?.checkOut ?? undefined,
    },
    travelers: (input.travelers ?? 'all').trim() || 'all',
    budget: (input.budget ?? 'all').trim() || 'all',
    language: input.language ?? inferLanguage(query, input.userIntent ?? query),
    userIntent: (input.userIntent ?? query).trim(),
    query,
    family: input.family,
    collection: input.collection ?? 'all',
    sort: input.sort ?? 'recommended',
    availability: input.availability ?? 'all',
    page: Number.isFinite(input.page) && Number(input.page) > 0 ? Number(input.page) : 1,
    pageSize: Number.isFinite(input.pageSize) && Number(input.pageSize) > 0 ? Math.min(Number(input.pageSize), 30) : 9,
  } satisfies MarketplaceSearchRequest;
}

export function isKnownServiceType(value: string) {
  if (value === 'all') return true;
  return categorySet.has(value as MarketplacePageCategory);
}
