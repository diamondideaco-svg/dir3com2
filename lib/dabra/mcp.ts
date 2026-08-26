import { canonicalServices, getCanonicalService } from '@/lib/services/canonical';
import { filterAssistantServices, getMarketplaceSnapshot, queryMarketplace } from '@/lib/marketplace/server';
import type { MarketplaceFamilyKey, MarketplaceService } from '@/lib/marketplace/data';

export const DABRA_MCP_PROTOCOL_VERSION = '2025-06-18';

const annotations = {
  readOnlyHint: true,
  openWorldHint: true,
  destructiveHint: false,
} as const;

const familyBySlug: Record<string, MarketplaceFamilyKey> = {
  drive: 'dir3-drive',
  stay: 'dir3-stay',
  fly: 'dir3-fly',
  concierge: 'dir3-concierge',
  vip: 'dir3-vip',
};

export const dabraToolDefinitions = [
  {
    name: 'get_dir3com_services',
    title: 'Get DIR3COM services',
    description: 'List the five canonical DIR3COM travel service families and report whether each has live or partner-verified marketplace data. Catalog descriptions are never presented as live availability.',
    inputSchema: {
      type: 'object',
      properties: {
        language: { type: 'string', enum: ['ar', 'en'], description: 'Response language.' },
      },
      additionalProperties: false,
    },
    annotations,
  },
  {
    name: 'search_dir3com_marketplace',
    title: 'Search DIR3COM marketplace',
    description: 'Search read-only live or partner-verified DIR3COM marketplace records. Fallback, synthetic, sandbox, and test records are excluded and never represented as actual availability.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 2, maxLength: 80 },
        service: { type: 'string', enum: ['drive', 'stay', 'fly', 'concierge', 'vip'] },
        destination: { type: 'string', minLength: 2, maxLength: 80 },
        language: { type: 'string', enum: ['ar', 'en'] },
        page: { type: 'integer', minimum: 1, maximum: 100 },
        pageSize: { type: 'integer', minimum: 1, maximum: 20 },
      },
      additionalProperties: false,
    },
    annotations,
  },
  {
    name: 'get_dir3com_service',
    title: 'Get DIR3COM service',
    description: 'Get one canonical DIR3COM service family or a live/partner-verified marketplace item by slug or ID, including explicit source and availability status.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', minLength: 1, maxLength: 120, description: 'Canonical service slug, marketplace slug, or marketplace ID.' },
        language: { type: 'string', enum: ['ar', 'en'] },
      },
      additionalProperties: false,
    },
    annotations,
  },
  {
    name: 'create_dabra_trip_brief',
    title: 'Create DABRA trip brief',
    description: 'Create a read-only bilingual trip-planning brief from traveler preferences and verified DIR3COM marketplace results. This tool never books, pays, cancels, refunds, modifies accounts, or writes to a database.',
    inputSchema: {
      type: 'object',
      required: ['destination', 'travelers'],
      properties: {
        destination: { type: 'string', minLength: 2, maxLength: 80 },
        origin: { type: 'string', minLength: 2, maxLength: 80 },
        startDate: { type: 'string', format: 'date' },
        endDate: { type: 'string', format: 'date' },
        travelers: { type: 'integer', minimum: 1, maximum: 20 },
        interests: { type: 'array', maxItems: 10, items: { type: 'string', minLength: 1, maxLength: 80 } },
        budget: { type: 'string', maxLength: 80 },
        notes: { type: 'string', maxLength: 500 },
        language: { type: 'string', enum: ['ar', 'en'] },
      },
      additionalProperties: false,
    },
    annotations,
  },
] as const;

type ToolArguments = Record<string, unknown>;

function isVerified(service: MarketplaceService) {
  return service.source !== 'fallback'
    && (service.provenance === 'PROVIDER_LIVE' || service.provenance === 'PARTNER_VERIFIED');
}

function publicService(service: MarketplaceService, language: 'ar' | 'en') {
  return {
    id: String(service.id),
    slug: service.slug,
    name: language === 'ar' ? service.name_ar : service.name_en ?? service.name_ar,
    description: language === 'ar' ? service.description_ar : service.description_en ?? service.description_ar,
    family: service.family,
    destination: service.destination,
    availability: service.availability,
    startingPrice: service.basePrice > 0 ? service.basePrice : null,
    currency: service.basePrice > 0 ? service.currency : null,
    source: service.provenance,
    sourceSystem: service.source,
    verifiedAvailability: true,
    url: `https://www.dir3com.com${service.href}`,
  };
}

function response(data: unknown) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

function languageOf(args: ToolArguments): 'ar' | 'en' {
  return args.language === 'ar' ? 'ar' : 'en';
}

function stringArg(args: ToolArguments, key: string, maxLength: number) {
  const value = args[key];
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function containsForbiddenAction(args: ToolArguments) {
  const text = JSON.stringify(args);
  return /(?:book|booking|reserve|pay|payment|cancel|refund|حجز|ادفع|دفع|إلغاء|الغاء|استرداد)/i.test(text);
}

async function getServices(args: ToolArguments) {
  const language = languageOf(args);
  const snapshot = await getMarketplaceSnapshot();
  const verified = filterAssistantServices(snapshot.services).filter(isVerified);
  const services = canonicalServices.map((service) => {
    const matches = verified.filter((item) => item.family === familyBySlug[service.slug]);
    return {
      slug: service.slug,
      name: service.name,
      description: language === 'ar' ? service.descriptionAr : service.descriptionEn,
      url: `https://www.dir3com.com/services/${service.slug}`,
      dataStatus: matches.length > 0 ? 'verified_records_available' : 'catalog_only_no_verified_availability',
      verifiedRecordCount: matches.length,
      dataSource: matches.length > 0 ? [...new Set(matches.map((item) => item.provenance))] : ['DIR3COM_CANONICAL_CATALOG'],
    };
  });

  return response({
    services,
    generatedAt: snapshot.generatedAt,
    policy: language === 'ar'
      ? 'هذه معلومات للقراءة فقط. وجود الخدمة في الكتالوج لا يعني توفرًا فعليًا.'
      : 'Read-only information. Catalog presence does not imply actual availability.',
  });
}

async function searchMarketplace(args: ToolArguments) {
  const language = languageOf(args);
  const service = stringArg(args, 'service', 20);
  const query = stringArg(args, 'query', 80);
  const destination = stringArg(args, 'destination', 80).toLowerCase();
  const page = typeof args.page === 'number' ? Math.max(1, Math.floor(args.page)) : 1;
  const pageSize = typeof args.pageSize === 'number' ? Math.min(20, Math.max(1, Math.floor(args.pageSize))) : 10;
  const result = await queryMarketplace({
    family: service ? familyBySlug[service] : undefined,
    query: query || undefined,
    destination: destination || undefined,
    page,
    pageSize,
  }, { anonymous: true, clientKey: 'dabra-public-mcp' });
  const items = filterAssistantServices(result.services).filter(isVerified).map((item) => publicService(item, language));

  return response({
    items,
    totalReturned: items.length,
    dataStatus: items.length > 0 ? 'verified_results' : 'no_verified_results',
    excludedData: ['FALLBACK', 'SYNTHETIC_TEST', 'PROVIDER_SANDBOX', 'pilot/test records'],
    generatedAt: result.meta.generatedAt,
  });
}

async function getService(args: ToolArguments) {
  const language = languageOf(args);
  const id = stringArg(args, 'id', 120).toLowerCase();
  if (!id) throw new Error('A service ID or slug is required.');
  const canonical = getCanonicalService(id);
  const snapshot = await getMarketplaceSnapshot();
  const verified = filterAssistantServices(snapshot.services).filter(isVerified);
  const item = verified.find((candidate) => String(candidate.id).toLowerCase() === id || candidate.slug.toLowerCase() === id);

  if (item) return response({ item: publicService(item, language), generatedAt: snapshot.generatedAt });
  if (canonical) {
    const matches = verified.filter((candidate) => candidate.family === familyBySlug[canonical.slug]);
    return response({
      item: {
        slug: canonical.slug,
        name: canonical.name,
        description: language === 'ar' ? canonical.descriptionAr : canonical.descriptionEn,
        url: `https://www.dir3com.com/services/${canonical.slug}`,
        dataStatus: matches.length > 0 ? 'verified_records_available' : 'catalog_only_no_verified_availability',
        verifiedRecordCount: matches.length,
        source: 'DIR3COM_CANONICAL_CATALOG',
      },
      generatedAt: snapshot.generatedAt,
    });
  }

  return response({ item: null, dataStatus: 'not_found_or_not_verified', generatedAt: snapshot.generatedAt });
}

async function createTripBrief(args: ToolArguments) {
  const language = languageOf(args);
  if (containsForbiddenAction(args)) {
    return response({
      status: 'refused_write_action',
      message: language === 'ar'
        ? 'لا تنفّذ DABRA الحجز أو الدفع أو الإلغاء أو الاسترداد. يلزم تأكيد بشري وإتمام العملية عبر DIR3COM.'
        : 'DABRA does not book, pay, cancel, or refund. Human confirmation and completion through DIR3COM are required.',
    });
  }

  const destination = stringArg(args, 'destination', 80);
  const travelers = typeof args.travelers === 'number' ? Math.max(1, Math.min(20, Math.floor(args.travelers))) : 1;
  const search = await queryMarketplace({ destination: destination.toLowerCase(), page: 1, pageSize: 12 }, { anonymous: true, clientKey: 'dabra-public-mcp' });
  const verified = filterAssistantServices(search.services).filter(isVerified).slice(0, 8);
  const requested = {
    destination,
    origin: stringArg(args, 'origin', 80) || null,
    startDate: stringArg(args, 'startDate', 10) || null,
    endDate: stringArg(args, 'endDate', 10) || null,
    travelers,
    interests: Array.isArray(args.interests) ? args.interests.filter((value): value is string => typeof value === 'string').slice(0, 10) : [],
    budget: stringArg(args, 'budget', 80) || null,
  };

  return response({
    status: 'planning_brief_only',
    title: language === 'ar' ? `موجز رحلة DABRA إلى ${destination}` : `DABRA trip brief for ${destination}`,
    requested,
    verifiedOptions: verified.map((item) => publicService(item, language)),
    dataStatus: verified.length > 0 ? 'verified_results_included' : 'no_verified_marketplace_results',
    nextStep: language === 'ar'
      ? 'راجع الخيارات ثم أكمل أي حجز أو دفع بنفسك عبر DIR3COM بعد موافقة بشرية صريحة.'
      : 'Review the options, then complete any booking or payment yourself through DIR3COM after explicit human approval.',
    prohibitedActions: ['booking', 'payment', 'cancellation', 'refund', 'account_changes', 'database_writes'],
    generatedAt: search.meta.generatedAt,
  });
}

export async function callDabraTool(name: string, args: ToolArguments = {}) {
  if (name === 'get_dir3com_services') return getServices(args);
  if (name === 'search_dir3com_marketplace') return searchMarketplace(args);
  if (name === 'get_dir3com_service') return getService(args);
  if (name === 'create_dabra_trip_brief') return createTripBrief(args);
  throw new Error(`Unknown tool: ${name}`);
}
