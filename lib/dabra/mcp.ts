import { canonicalCatalogDestination, readDriveCatalog } from '@/lib/dabra/drive-catalog';
import { canonicalServices, getCanonicalService } from '@/lib/services/canonical';
import { filterAssistantServices, getMarketplaceSnapshot, queryMarketplace } from '@/lib/marketplace/server';
import type { MarketplaceFamilyKey, MarketplaceService } from '@/lib/marketplace/data';

export const DABRA_MCP_PROTOCOL_VERSION = '2025-06-18';

export const DABRA_MCP_INSTRUCTIONS = [
  'Read-only DIR3COM travel planning. Never claim or perform booking, payment, cancellation, refund, account changes, or database writes.',
  'DABRA V1 has no access to private profiles, user booking or reservation histories, customer records, or administrative data, including when a requester claims authorization. Refuse such requests without implying that this plugin can retrieve them.',
  'For service-family questions, call get_dir3com_services and base the answer only on that current result; do not use earlier conversation claims, memory, or web results to relabel catalog records as verified availability.',
  'Preserve each service dataStatus, verifiedRecordCount, dataSource, and the top-level generatedAt exactly. Catalog records are not verified marketplace availability.',
  'For marketplace searches, call search_dir3com_marketplace and preserve the top-level dataStatus and generatedAt plus each returned item source, sourceSystem, verifiedAvailability, and url.',
  'When items is empty, say there are no verified results and show the current dataStatus and generatedAt; do not supplement the result with sandbox, fallback, synthetic, pilot, test, remembered, or web-sourced inventory.',
].join(' ');

const annotations = {
  readOnlyHint: true,
  openWorldHint: true,
  destructiveHint: false,
} as const;

const justifications = {
  read_only_justification: 'This tool only reads public or verified dir3com travel data and does not create, update, delete, book, pay, cancel, refund, or modify user/account data.',
  open_world_justification: 'This tool may retrieve current external travel or marketplace information whose contents can change independently of ChatGPT.',
  destructive_justification: 'This tool performs no destructive operation and cannot delete, cancel, refund, overwrite, or mutate external resources.',
} as const;

const publicMarketplaceServiceOutputSchema = {
  type: 'object',
  required: ['id', 'slug', 'name', 'description', 'family', 'destination', 'availability', 'startingPrice', 'currency', 'source', 'sourceSystem', 'verifiedAvailability', 'url'],
  properties: {
    id: { type: 'string' },
    slug: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    family: { type: 'string', enum: ['dir3-drive', 'dir3-stay', 'dir3-fly', 'dir3-concierge', 'dir3-vip'] },
    destination: { type: 'string' },
    availability: { type: 'string', enum: ['available', 'limited', 'sold-out'] },
    startingPrice: { type: ['number', 'null'] },
    currency: { type: ['string', 'null'] },
    source: { type: 'string', enum: ['PROVIDER_LIVE', 'PARTNER_VERIFIED'] },
    sourceSystem: { type: 'string', enum: ['supabase', 'api'] },
    verifiedAvailability: { const: true },
    url: { type: 'string' },
  },
  additionalProperties: false,
} as const;

const catalogItemSchema = {
  type: 'object',
  required: ['id', 'name', 'family', 'country', 'availability', 'transactionMethod', 'verifiedAvailability', 'cityAvailabilityVerified', 'dateAvailabilityVerified', 'exactModelGuaranteed', 'startingRate', 'currency', 'rateUnit', 'finalTotalRequired', 'source', 'sourceUrl', 'catalogVersion', 'url'],
  properties: {
    id: { type: 'string' }, name: { type: 'string' }, family: { const: 'dir3-drive' }, country: { const: 'EG' },
    availability: { const: 'request_to_confirm' }, transactionMethod: { const: 'request_to_confirm' },
    verifiedAvailability: { const: false }, cityAvailabilityVerified: { const: false }, dateAvailabilityVerified: { const: false },
    exactModelGuaranteed: { const: false }, startingRate: { type: 'number', minimum: 0 },
    airportStartingRate: { type: ['number', 'null'], minimum: 0 }, currency: { type: 'string' },
    rateUnit: { const: 'day' }, finalTotalRequired: { const: true }, source: { const: 'DIR3COM_PUBLISHED_DRIVE_CATALOG' },
    sourceUrl: { const: 'https://www.dir3com.com/api/public/drive/catalog' }, catalogVersion: { type: 'string' }, url: { type: 'string' },
  },
  additionalProperties: false,
} as const;
const catalogResponseProperties = {
  catalogResults: { type: 'array', items: catalogItemSchema },
  catalogTotal: { type: 'integer', minimum: 0 }, catalogReturned: { type: 'integer', minimum: 0 },
  catalogTotalPages: { type: 'integer', minimum: 0 },
  catalogSourceHealth: { type: 'string', enum: ['available', 'unavailable', 'not_applicable'] },
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
    description: 'Authoritative current source for listing the five DIR3COM service families. Use this tool for every such request and preserve each returned dataStatus, verifiedRecordCount, dataSource, and the top-level generatedAt exactly. Never relabel catalog records as verified availability from memory, prior conversation, or web results.',
    inputSchema: {
      type: 'object',
      properties: {
        language: { type: 'string', enum: ['ar', 'en'], description: 'Response language.' },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      required: ['services', 'generatedAt', 'policy'],
      properties: {
        services: {
          type: 'array',
          items: {
            type: 'object',
            required: ['slug', 'name', 'description', 'url', 'dataStatus', 'verifiedRecordCount', 'dataSource', 'catalogRecordCount'],
            properties: {
              slug: { type: 'string', enum: ['drive', 'stay', 'fly', 'concierge', 'vip'] },
              name: { type: 'string' },
              description: { type: 'string' },
              url: { type: 'string' },
              dataStatus: { type: 'string', enum: ['verified_records_available', 'catalog_only_no_verified_availability', 'source_unavailable'] },
              verifiedRecordCount: { type: 'integer', minimum: 0 },
              catalogRecordCount: { type: 'integer', minimum: 0 },
              dataSource: {
                type: 'array',
                items: { type: 'string', enum: ['PROVIDER_LIVE', 'PARTNER_VERIFIED', 'DIR3COM_CANONICAL_CATALOG'] },
              },
            },
            additionalProperties: false,
          },
        },
        ...catalogResponseProperties,
        sourceHealth: { type: 'string', enum: ['available', 'unavailable'] },
        generatedAt: { type: 'string' },
        policy: { type: 'string' },
      },
      additionalProperties: false,
    },
    annotations,
    justifications,
  },
  {
    name: 'search_dir3com_marketplace',
    title: 'Search DIR3COM marketplace',
    description: 'Authoritative current search for verified DIR3COM marketplace inventory. Preserve top-level dataStatus and generatedAt plus each item source, sourceSystem, verifiedAvailability, and url. If items is empty, report no verified results with the returned status and timestamp; do not add remembered, web, fallback, synthetic, sandbox, pilot, or test inventory. Published Drive catalogue results remain separate and have verifiedAvailability=false.',
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
    outputSchema: {
      type: 'object',
      required: ['items', 'totalReturned', 'dataStatus', 'excludedData', 'generatedAt'],
      properties: {
        items: { type: 'array', items: publicMarketplaceServiceOutputSchema },
        totalReturned: { type: 'integer', minimum: 0 },
        dataStatus: { type: 'string', enum: ['verified_results', 'no_verified_results', 'source_unavailable'] },
        excludedData: {
          type: 'array',
          items: { type: 'string', enum: ['FALLBACK', 'SYNTHETIC_TEST', 'PROVIDER_SANDBOX', 'pilot/test records'] },
        },
        ...catalogResponseProperties,
        sourceHealth: { type: 'string', enum: ['available', 'unavailable'] },
        generatedAt: { type: 'string' },
      },
      additionalProperties: false,
    },
    annotations,
    justifications,
  },
  {
    name: 'get_dir3com_service',
    title: 'Get DIR3COM service',
    description: 'Get a service family or verified inventory item, with separate published Drive catalogue results by offer ID. Catalogue results are request-to-confirm and never confirmed live availability.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', minLength: 1, maxLength: 120, description: 'Canonical service slug, marketplace slug, or marketplace ID.' },
        language: { type: 'string', enum: ['ar', 'en'] },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      oneOf: [
        {
          type: 'object',
          required: ['item', 'generatedAt'],
          properties: {
            item: publicMarketplaceServiceOutputSchema,
            ...catalogResponseProperties,
        sourceHealth: { type: 'string', enum: ['available', 'unavailable'] },
            generatedAt: { type: 'string' },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          required: ['item', 'generatedAt'],
          properties: {
            item: {
              type: 'object',
              required: ['slug', 'name', 'description', 'url', 'dataStatus', 'verifiedRecordCount', 'source'],
              properties: {
                slug: { type: 'string', enum: ['drive', 'stay', 'fly', 'concierge', 'vip'] },
                name: { type: 'string' },
                description: { type: 'string' },
                url: { type: 'string' },
                dataStatus: { type: 'string', enum: ['verified_records_available', 'catalog_only_no_verified_availability', 'source_unavailable'] },
                verifiedRecordCount: { type: 'integer', minimum: 0 },
              catalogRecordCount: { type: 'integer', minimum: 0 },
                source: { const: 'DIR3COM_CANONICAL_CATALOG' },
              },
              additionalProperties: false,
            },
            ...catalogResponseProperties,
        sourceHealth: { type: 'string', enum: ['available', 'unavailable'] },
            generatedAt: { type: 'string' },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          required: ['item', 'dataStatus', 'generatedAt'],
          properties: {
            item: { type: 'null' },
            dataStatus: { type: 'string', enum: ['not_found_or_not_verified', 'source_unavailable'] },
            ...catalogResponseProperties,
        sourceHealth: { type: 'string', enum: ['available', 'unavailable'] },
            generatedAt: { type: 'string' },
          },
          additionalProperties: false,
        },
      ],
    },
    annotations,
    justifications,
  },
  {
    name: 'create_dabra_trip_brief',
    title: 'Create DABRA trip brief',
    description: 'Create a read-only bilingual trip-planning brief with verified inventory and separate request-to-confirm Drive catalogue suggestions, without city/date availability promises. This tool never books, pays, cancels, refunds, modifies accounts, or writes to a database.',
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
        durationDays: { type: 'integer', minimum: 1, maximum: 365, description: 'Requested trip duration in days.' },
        notes: { type: 'string', maxLength: 500 },
        language: { type: 'string', enum: ['ar', 'en'] },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      oneOf: [
        {
          type: 'object',
          required: ['status', 'message'],
          properties: {
            status: { const: 'refused_write_action' },
            message: { type: 'string' },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          required: ['status', 'message'],
          properties: {
            status: { const: 'refused_sensitive_data_request' },
            message: { type: 'string' },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          required: ['status', 'title', 'requested', 'verifiedOptions', 'dataStatus', 'nextStep', 'prohibitedActions', 'generatedAt'],
          properties: {
            status: { const: 'planning_brief_only' },
            title: { type: 'string' },
            requested: {
              type: 'object',
              required: ['destination', 'origin', 'startDate', 'endDate', 'durationDays', 'travelers', 'interests', 'budget'],
              properties: {
                destination: { type: 'string' },
                origin: { type: ['string', 'null'] },
                startDate: { type: ['string', 'null'] },
                endDate: { type: ['string', 'null'] },
                durationDays: { type: ['integer', 'null'], minimum: 1, maximum: 365 },
                travelers: { type: 'integer', minimum: 1, maximum: 20 },
                interests: { type: 'array', items: { type: 'string' } },
                budget: { type: ['string', 'null'] },
              },
              additionalProperties: false,
            },
            verifiedOptions: { type: 'array', items: publicMarketplaceServiceOutputSchema },
            dataStatus: { type: 'string', enum: ['verified_results_included', 'no_verified_marketplace_results', 'source_unavailable'] },
            nextStep: { type: 'string' },
            prohibitedActions: {
              type: 'array',
              items: { type: 'string', enum: ['booking', 'payment', 'cancellation', 'refund', 'account_changes', 'database_writes'] },
            },
            ...catalogResponseProperties,
        sourceHealth: { type: 'string', enum: ['available', 'unavailable'] },
            generatedAt: { type: 'string' },
          },
          additionalProperties: false,
        },
      ],
    },
    annotations,
    justifications,
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

const tripBriefArgumentNames = new Set([
  'destination',
  'origin',
  'startDate',
  'endDate',
  'travelers',
  'interests',
  'budget',
  'durationDays',
  'notes',
  'language',
]);

function invalidTripBriefArguments(message: string): never {
  throw new Error(`Invalid create_dabra_trip_brief arguments: ${message}`);
}

function validateOptionalString(args: ToolArguments, key: string, minimum: number, maximum: number) {
  const value = args[key];
  if (value === undefined) return;
  if (typeof value !== 'string' || value.trim().length < minimum || value.length > maximum) {
    invalidTripBriefArguments(`${key} must be a string between ${minimum} and ${maximum} characters.`);
  }
}

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function validateTripBriefArguments(args: ToolArguments) {
  const unknown = Object.keys(args).find((key) => !tripBriefArgumentNames.has(key));
  if (unknown) invalidTripBriefArguments(`unknown property: ${unknown}.`);

  validateOptionalString(args, 'destination', 2, 80);
  if (args.destination === undefined) invalidTripBriefArguments('destination is required.');

  if (!Number.isInteger(args.travelers) || (args.travelers as number) < 1 || (args.travelers as number) > 20) {
    invalidTripBriefArguments('travelers must be an integer between 1 and 20.');
  }

  validateOptionalString(args, 'origin', 2, 80);
  validateOptionalString(args, 'budget', 0, 80);
  validateOptionalString(args, 'notes', 0, 500);

  for (const key of ['startDate', 'endDate'] as const) {
    const value = args[key];
    if (value !== undefined && (typeof value !== 'string' || !isCalendarDate(value))) {
      invalidTripBriefArguments(`${key} must be a valid calendar date in YYYY-MM-DD format.`);
    }
  }

  if (args.durationDays !== undefined
    && (!Number.isInteger(args.durationDays) || (args.durationDays as number) < 1 || (args.durationDays as number) > 365)) {
    invalidTripBriefArguments('durationDays must be an integer between 1 and 365.');
  }

  if (args.language !== undefined && args.language !== 'ar' && args.language !== 'en') {
    invalidTripBriefArguments('language must be ar or en.');
  }

  if (args.interests !== undefined) {
    if (!Array.isArray(args.interests) || args.interests.length > 10
      || args.interests.some((value) => typeof value !== 'string' || value.trim().length < 1 || value.length > 80)) {
      invalidTripBriefArguments('interests must contain at most 10 non-empty strings of at most 80 characters.');
    }
  }
}

function containsForbiddenAction(args: ToolArguments) {
  const text = JSON.stringify(args);
  return /(?:book|booking|reserve|pay|payment|cancel|refund|حجز|ادفع|دفع|إلغاء|الغاء|استرداد)/i.test(text);
}

function containsSensitiveDataRequest(args: ToolArguments) {
  const text = JSON.stringify(args);
  return /(?:service[ _-]?role|secret(?:s)?|api[ _-]?key|access[ _-]?token|credential(?:s)?|hidden[ _-]?(?:fallback[ _-]?)?inventory|internal[ _-]?inventory|private[ _-]?inventory|fallback[ _-]?inventory|another user(?:'s)? (?:data|profile|booking)|other user(?:'s)? (?:data|profile|booking)|someone else(?:'s)? (?:data|profile|booking)|مفتاح|مفاتيح|أسرار|اسرار|بيانات اعتماد|مخزون (?:داخلي|مخفي|احتياطي)|بيانات مستخدم آخر|حجوزات مستخدم آخر|ملف مستخدم آخر)/i.test(text);
}

const numberWords: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

function durationDaysOf(args: ToolArguments) {
  if (typeof args.durationDays === 'number' && Number.isInteger(args.durationDays)) {
    return Math.max(1, Math.min(365, args.durationDays));
  }

  const notes = stringArg(args, 'notes', 500).toLowerCase();
  const numeric = notes.match(/\b(\d{1,3})[ -]?days?\b/i);
  if (numeric) return Math.max(1, Math.min(365, Number(numeric[1])));

  const written = notes.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)[ -]?days?\b/i);
  if (written) return numberWords[written[1]] ?? null;

  const arabic = notes.match(/(?:لمدة\s*)?([١٢٣٤٥٦٧٨٩]|\d{1,3})\s*(?:أيام|ايام|يوم)/i);
  if (!arabic) return null;
  const normalized = arabic[1].replace(/[١٢٣٤٥٦٧٨٩]/g, (digit) => String('١٢٣٤٥٦٧٨٩'.indexOf(digit) + 1));
  return Math.max(1, Math.min(365, Number(normalized)));
}

async function getServices(args: ToolArguments) {
  const language = languageOf(args);
  const snapshot = await getMarketplaceSnapshot();
  const catalog = await readDriveCatalog({language, page: 1, pageSize: 20});
  const verified = filterAssistantServices(snapshot.services).filter(isVerified);
  const services = canonicalServices.map((service) => {
    const matches = verified.filter((item) => item.family === familyBySlug[service.slug]);
    return {
      slug: service.slug,
      name: service.name,
      description: language === 'ar' ? service.descriptionAr : service.descriptionEn,
      url: `https://www.dir3com.com/services/${service.slug}`,
      dataStatus: snapshot.sourceHealth === 'unavailable' ? 'source_unavailable' : matches.length > 0 ? 'verified_records_available' : 'catalog_only_no_verified_availability',
      verifiedRecordCount: matches.length,
      catalogRecordCount: service.slug === 'drive' ? catalog.catalogTotal : 0,
      dataSource: matches.length > 0 ? [...new Set(matches.map((item) => item.provenance))] : ['DIR3COM_CANONICAL_CATALOG'],
    };
  });

  return response({
    services,
    ...catalog,
    sourceHealth: snapshot.sourceHealth,
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
    destination: (canonicalCatalogDestination(destination) ?? destination) || undefined,
    page,
    pageSize,
  }, { anonymous: true, clientKey: 'dabra-public-mcp' });
  const catalog = await readDriveCatalog({service, destination, query, language, page, pageSize});
  const items = filterAssistantServices(result.services).filter(isVerified).map((item) => publicService(item, language));

  return response({
    items,
    ...catalog,
    totalReturned: items.length,
    dataStatus: result.meta.sourceHealth === 'unavailable' ? 'source_unavailable' : items.length > 0 ? 'verified_results' : 'no_verified_results',
    excludedData: ['FALLBACK', 'SYNTHETIC_TEST', 'PROVIDER_SANDBOX', 'pilot/test records'],
    sourceHealth: result.meta.sourceHealth,
    generatedAt: result.meta.generatedAt,
  });
}

async function getService(args: ToolArguments) {
  const language = languageOf(args);
  const id = stringArg(args, 'id', 120).toLowerCase();
  if (!id) throw new Error('A service ID or slug is required.');
  const canonical = getCanonicalService(id);
  const catalog = await readDriveCatalog({service: canonical?.slug ?? 'drive', id: canonical ? undefined : id, language, page: 1, pageSize: canonical ? 20 : 1});
  const snapshot = await getMarketplaceSnapshot();
  const verified = filterAssistantServices(snapshot.services).filter(isVerified);
  const item = verified.find((candidate) => String(candidate.id).toLowerCase() === id || candidate.slug.toLowerCase() === id);

  if (item) return response({ ...catalog, item: publicService(item, language), sourceHealth: snapshot.sourceHealth, generatedAt: snapshot.generatedAt });
  if (canonical) {
    const matches = verified.filter((candidate) => candidate.family === familyBySlug[canonical.slug]);
    return response({
      ...catalog,
      item: {
        slug: canonical.slug,
        name: canonical.name,
        description: language === 'ar' ? canonical.descriptionAr : canonical.descriptionEn,
        url: `https://www.dir3com.com/services/${canonical.slug}`,
        dataStatus: snapshot.sourceHealth === 'unavailable' ? 'source_unavailable' : matches.length > 0 ? 'verified_records_available' : 'catalog_only_no_verified_availability',
        verifiedRecordCount: matches.length,
        catalogRecordCount: canonical.slug === 'drive' ? catalog.catalogTotal : 0,
        source: 'DIR3COM_CANONICAL_CATALOG',
      },
      sourceHealth: snapshot.sourceHealth,
      generatedAt: snapshot.generatedAt,
    });
  }

  return response({ ...catalog, item: null, dataStatus: snapshot.sourceHealth === 'unavailable' ? 'source_unavailable' : 'not_found_or_not_verified', sourceHealth: snapshot.sourceHealth, generatedAt: snapshot.generatedAt });
}

async function createTripBrief(args: ToolArguments) {
  validateTripBriefArguments(args);
  const language = languageOf(args);
  if (containsSensitiveDataRequest(args)) {
    return response({
      status: 'refused_sensitive_data_request',
      message: language === 'ar'
        ? 'لا تكشف DABRA الأسرار أو بيانات الاعتماد أو بيانات المستخدمين الآخرين أو المخزون الداخلي أو المخفي أو الاحتياطي. تعرض فقط بيانات DIR3COM العامة أو الموثقة والمخصصة للمستخدم.'
        : 'DABRA does not disclose secrets, credentials, other users\' data, or internal, hidden, or fallback inventory. It only returns public or verified user-facing DIR3COM data.',
    });
  }
  if (containsForbiddenAction(args)) {
    return response({
      status: 'refused_write_action',
      message: language === 'ar'
        ? 'لا تنفّذ DABRA الحجز أو الدفع أو الإلغاء أو الاسترداد. يلزم تأكيد بشري وإتمام العملية عبر DIR3COM.'
        : 'DABRA does not book, pay, cancel, or refund. Human confirmation and completion through DIR3COM are required.',
    });
  }

  const destination = stringArg(args, 'destination', 80);
  const durationDays = durationDaysOf(args);
  const travelers = args.travelers as number;
  const search = await queryMarketplace({ destination: destination.toLowerCase(), page: 1, pageSize: 12 }, { anonymous: true, clientKey: 'dabra-public-mcp' });
  const catalog = await readDriveCatalog({destination, language, page: 1, pageSize: 8});
  const verified = filterAssistantServices(search.services).filter(isVerified).slice(0, 8);
  const requested = {
    destination,
    origin: stringArg(args, 'origin', 80) || null,
    startDate: stringArg(args, 'startDate', 10) || null,
    endDate: stringArg(args, 'endDate', 10) || null,
    durationDays,
    travelers,
    interests: Array.isArray(args.interests) ? args.interests.filter((value): value is string => typeof value === 'string').slice(0, 10) : [],
    budget: stringArg(args, 'budget', 80) || null,
  };

  return response({
    status: 'planning_brief_only',
    title: language === 'ar'
      ? `موجز رحلة DABRA إلى ${destination}${durationDays ? ` لمدة ${durationDays} أيام` : ''}`
      : `DABRA trip brief for ${destination}${durationDays ? ` — ${durationDays} days` : ''}`,
    requested,
    ...catalog,
    verifiedOptions: verified.map((item) => publicService(item, language)),
    dataStatus: search.meta.sourceHealth === 'unavailable' ? 'source_unavailable' : verified.length > 0 ? 'verified_results_included' : 'no_verified_marketplace_results',
    nextStep: language === 'ar'
      ? 'راجع الخيارات ثم أكمل أي حجز أو دفع بنفسك عبر DIR3COM بعد موافقة بشرية صريحة.'
      : 'Review the options, then complete any booking or payment yourself through DIR3COM after explicit human approval.',
    prohibitedActions: ['booking', 'payment', 'cancellation', 'refund', 'account_changes', 'database_writes'],
    sourceHealth: search.meta.sourceHealth,
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
