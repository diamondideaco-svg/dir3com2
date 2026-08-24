import { supabaseAdmin } from '@/lib/supabase/server';
import { getMarketplaceSnapshot, type MarketplaceSnapshot } from '@/lib/marketplace/server';
import type { MarketplaceService } from '@/lib/marketplace/data';

export type DabraServiceSourceType = 'platform' | 'partner';

export type DabraNormalizedService = {
  serviceId: string;
  sourceType: DabraServiceSourceType;
  title: { ar: string; en: string };
  description: { ar: string; en: string };
  category: string;
  location: string;
  pricing: { amount: number | null; currency: string };
  availability: 'available' | 'limited' | 'unavailable';
  providerName: string | null;
  media: string[];
  publicationStatus: string;
};

type PartnerProduct = {
  id?: string | null;
  slug?: string | null;
  name_ar?: string | null;
  name_en?: string | null;
  description_ar?: string | null;
  description_en?: string | null;
  city?: string | null;
  base_price?: number | null;
  currency?: string | null;
  status?: string | null;
  synthetic?: boolean | null;
  category_id?: string | null;
};

type AvailabilityRow = {
  product_id?: string | null;
  partner_id?: string | null;
  city?: string | null;
  available?: boolean | null;
};

type PartnerRow = {
  id?: string | null;
  company_name?: string | null;
  status?: string | null;
};

const ELIGIBLE_PRODUCT_STATUSES = new Set(['active', 'published', 'featured']);
const ELIGIBLE_PARTNER_STATUSES = new Set(['active', 'approved']);

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function tokens(value: string) {
  return value.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((token) => token.length > 1);
}

export function isEligiblePartnerService(input: {
  productStatus?: unknown;
  partnerStatus?: unknown;
  available?: unknown;
  synthetic?: unknown;
  unpublished?: unknown;
}) {
  const productStatus = clean(input.productStatus, 30).toLowerCase();
  const partnerStatus = clean(input.partnerStatus, 30).toLowerCase();
  return ELIGIBLE_PRODUCT_STATUSES.has(productStatus)
    && ELIGIBLE_PARTNER_STATUSES.has(partnerStatus)
    && input.available === true
    && input.synthetic !== true
    && input.unpublished !== true;
}

function normalizeCategory(category: string) {
  const trimmed = category.trim().slice(0, 80);
  return /^[a-z0-9_-]+$/i.test(trimmed) ? trimmed.toLowerCase().replace(/_/g, '-') : trimmed || 'unknown';
}

export function normalizePartnerService(product: PartnerProduct, availability: AvailabilityRow, partner: PartnerRow, category: string, media: string[] = []): DabraNormalizedService | null {
  if (!product.id || !isEligiblePartnerService({
    productStatus: product.status,
    partnerStatus: partner.status,
    available: availability.available,
    synthetic: product.synthetic,
  })) return null;

  const titleAr = clean(product.name_ar, 160);
  const titleEn = clean(product.name_en, 160) || titleAr;
  const descriptionAr = clean(product.description_ar, 1000);
  const descriptionEn = clean(product.description_en, 1000) || descriptionAr;
  const location = clean(availability.city, 100) || clean(product.city, 100);
  const amount = typeof product.base_price === 'number' && Number.isFinite(product.base_price) ? product.base_price : null;

  return {
    serviceId: product.id,
    sourceType: 'partner',
    title: { ar: titleAr || titleEn, en: titleEn || titleAr },
    description: { ar: descriptionAr || descriptionEn, en: descriptionEn || descriptionAr },
    category: normalizeCategory(category),
    location: location || 'unknown',
    pricing: { amount, currency: clean(product.currency, 8).toUpperCase() || 'SAR' },
    availability: 'available',
    providerName: clean(partner.company_name, 160) || null,
    media: media.filter((item) => /^https?:\/\//i.test(item)).slice(0, 5),
    publicationStatus: clean(product.status, 30).toLowerCase(),
  };
}

function normalizePlatformService(service: MarketplaceService): DabraNormalizedService | null {
  if (service.source === 'fallback') return null;
  return {
    serviceId: String(service.id),
    sourceType: 'platform',
    title: { ar: clean(service.name_ar, 160), en: clean(service.name_en, 160) || clean(service.name_ar, 160) },
    description: { ar: clean(service.description_ar, 1000), en: clean(service.description_en, 1000) || clean(service.description_ar, 1000) },
    category: service.category,
    location: service.destination,
    pricing: { amount: Number.isFinite(service.basePrice) && service.basePrice > 0 ? service.basePrice : null, currency: service.currency },
    availability: service.availability === 'available' ? 'available' : service.availability === 'limited' ? 'limited' : 'unavailable',
    providerName: null,
    media: [],
    publicationStatus: 'published',
  };
}

type PartnerServicesResult = {
  services: DabraNormalizedService[];
  productIds: Set<string>;
};

async function getPartnerServices(): Promise<PartnerServicesResult> {
  if (!supabaseAdmin) return { services: [], productIds: new Set() };

  const [{ data: products }, { data: availability }, { data: partners }, { data: categories }] = await Promise.all([
    supabaseAdmin.from('products').select('id,slug,name_ar,name_en,description_ar,description_en,city,base_price,currency,status,synthetic,category_id'),
    supabaseAdmin.from('product_availability').select('product_id,partner_id,city,available'),
    supabaseAdmin.from('partners').select('id,company_name,status'),
    supabaseAdmin.from('product_categories').select('id,slug,name_en,name_ar'),
  ]);

  const productRows = Array.isArray(products) ? products as PartnerProduct[] : [];
  const availabilityRows = Array.isArray(availability) ? availability as AvailabilityRow[] : [];
  const partnerRows = Array.isArray(partners) ? partners as PartnerRow[] : [];
  const categoryRows = Array.isArray(categories) ? categories as Array<{ id?: string; slug?: string; name_en?: string; name_ar?: string }> : [];
  const partnerById = new Map(partnerRows.map((partner) => [String(partner.id), partner]));
  const categoryById = new Map(categoryRows.map((category) => [String(category.id), category.name_en || category.name_ar || category.slug || 'unknown']));
  const rowsByProduct = new Map<string, AvailabilityRow[]>();
  for (const row of availabilityRows) {
    const key = String(row.product_id ?? '');
    if (!key) continue;
    rowsByProduct.set(key, [...(rowsByProduct.get(key) ?? []), row]);
  }

  const result: DabraNormalizedService[] = [];
  const productIds = new Set(productRows.map((product) => String(product.id)).filter(Boolean));
  for (const product of productRows) {
    for (const row of rowsByProduct.get(String(product.id)) ?? []) {
      const partner = partnerById.get(String(row.partner_id));
      if (!partner) continue;
      const normalized = normalizePartnerService(product, row, partner, categoryById.get(String(product.category_id)) ?? 'unknown');
      if (normalized) result.push(normalized);
    }
  }
  return { services: result, productIds };
}

export async function getDabraServiceFeed(snapshot?: MarketplaceSnapshot): Promise<DabraNormalizedService[]> {
  const marketplace = snapshot ?? await getMarketplaceSnapshot();
  const partner = await getPartnerServices();
  const platform = marketplace.services
    .filter((service) => !partner.productIds.has(String(service.id)))
    .map(normalizePlatformService)
    .filter((service): service is DabraNormalizedService => service !== null);
  return mergeDabraServices(platform, partner.services);
}

export function mergeDabraServices(...groups: DabraNormalizedService[][]): DabraNormalizedService[] {
  const merged = new Map<string, DabraNormalizedService>();
  for (const group of groups) {
    for (const service of group) {
      const key = `${service.sourceType}:${service.serviceId}`;
      if (!merged.has(key)) merged.set(key, service);
    }
  }
  return [...merged.values()];
}

export function buildDabraServiceContext(services: DabraNormalizedService[], language: 'ar' | 'en') {
  const label = language === 'ar' ? 'خدمات موثقة متاحة للمساعد' : 'Verified services available to the assistant';
  const lines = services.slice(0, 20).map((service) => {
    const title = service.title[language] || service.title.en || service.title.ar || 'Unknown service';
    const description = service.description[language] || service.description.en || service.description.ar || 'Unavailable';
    const price = service.pricing.amount === null ? 'unavailable' : `${service.pricing.amount} ${service.pricing.currency}`;
    const provider = service.providerName || (language === 'ar' ? 'غير متاح' : 'unavailable');
    return `${service.serviceId} | ${title} | ${description} | category=${service.category} | location=${service.location} | price=${price} | availability=${service.availability} | provider=${provider} | source=${service.sourceType}`;
  });
  return lines.length ? `${label}:\n${lines.join('\n')}` : '';
}

export function findDabraServiceMatches(services: DabraNormalizedService[], query: string) {
  const queryTokens = new Set(tokens(query));
  const scored = services
    .map((service) => {
      const searchable = [
        ...Object.values(service.title),
        ...Object.values(service.description),
        service.category,
        service.location,
        service.providerName ?? '',
      ].join(' ');
      const matchedTokens = tokens(searchable).filter((token) => queryTokens.has(token));
      return { service, score: new Set(matchedTokens).size };
    })
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score);
  const bestScore = scored[0]?.score ?? 0;
  return scored.filter((match) => match.score === bestScore).slice(0, 3).map((match) => match.service);
}
