const IDENTIFIER_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const MAX_TEXT_LENGTH = 240;
const MAX_DESCRIPTION_LENGTH = 320;

export type PublicMarketplaceCategory = {
  slug: string;
  name_ar: string;
  name_en: string;
  item_count?: number;
};

export type PublicMarketplaceItemSummary = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  description?: string;
  category_slug: string;
  category_name_ar: string;
  category_name_en: string;
  image_url?: string;
  starting_price?: number;
  currency?: string;
};

export type PublicMarketplaceItemDetail = {
  id: string;
  slug: string;
  name_ar?: string;
  name_en?: string;
  short_description?: string;
  long_description?: string;
  category_slug: string;
  category_name_ar: string;
  category_name_en: string;
  primary_image_url?: string;
  gallery_image_urls: string[];
  starting_price?: number;
  currency?: string;
  city?: string;
  features: string[];
  badge?: string;
};

function sanitizeText(value: unknown, maxLength = MAX_TEXT_LENGTH) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, maxLength);
}

function sanitizeCurrency(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function sanitizeStringArray(value: unknown, maxItems: number, maxItemLength = MAX_TEXT_LENGTH) {
  if (!Array.isArray(value)) {
    return [];
  }

  const deduped = new Set<string>();

  for (const item of value) {
    const normalized = sanitizeText(item, maxItemLength);
    if (normalized) {
      deduped.add(normalized);
    }

    if (deduped.size >= maxItems) {
      break;
    }
  }

  return Array.from(deduped);
}

function sanitizeImageUrlArray(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) {
    return [];
  }

  const deduped = new Set<string>();

  for (const item of value) {
    const normalized = normalizePublicImageUrl(item);
    if (normalized) {
      deduped.add(normalized);
    }

    if (deduped.size >= maxItems) {
      break;
    }
  }

  return Array.from(deduped);
}

export function normalizeMarketplaceSlug(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > 120 || !IDENTIFIER_PATTERN.test(normalized)) {
    return null;
  }

  return normalized;
}

export function normalizePublicImageUrl(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  try {
    const url = new URL(normalized);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function toPublicMarketplaceCategory(input: {
  slug: unknown;
  name_ar: unknown;
  name_en: unknown;
  item_count?: unknown;
}): PublicMarketplaceCategory | null {
  const slug = normalizeMarketplaceSlug(input.slug);
  const nameAr = sanitizeText(input.name_ar);
  const nameEn = sanitizeText(input.name_en);

  if (!slug || !nameAr || !nameEn) {
    return null;
  }

  const itemCount =
    typeof input.item_count === 'number' && Number.isInteger(input.item_count) && input.item_count >= 0
      ? input.item_count
      : undefined;

  return {
    slug,
    name_ar: nameAr,
    name_en: nameEn,
    item_count: itemCount,
  };
}

export function toPublicMarketplaceItemSummary(input: {
  id: unknown;
  slug: unknown;
  name_ar: unknown;
  name_en: unknown;
  description?: unknown;
  category_slug: unknown;
  category_name_ar: unknown;
  category_name_en: unknown;
  image_url?: unknown;
  starting_price?: unknown;
  currency?: unknown;
}): PublicMarketplaceItemSummary | null {
  const id = sanitizeText(input.id, 120);
  const slug = normalizeMarketplaceSlug(input.slug);
  const nameAr = sanitizeText(input.name_ar);
  const nameEn = sanitizeText(input.name_en);
  const categorySlug = normalizeMarketplaceSlug(input.category_slug);
  const categoryNameAr = sanitizeText(input.category_name_ar);
  const categoryNameEn = sanitizeText(input.category_name_en);

  if (!id || !slug || !nameAr || !nameEn || !categorySlug || !categoryNameAr || !categoryNameEn) {
    return null;
  }

  const description = sanitizeText(input.description, MAX_DESCRIPTION_LENGTH) ?? undefined;
  const imageUrl = normalizePublicImageUrl(input.image_url) ?? undefined;
  const startingPrice =
    typeof input.starting_price === 'number' && Number.isFinite(input.starting_price) && input.starting_price >= 0
      ? input.starting_price
      : undefined;
  const currency = sanitizeCurrency(input.currency) ?? undefined;

  return {
    id,
    slug,
    name_ar: nameAr,
    name_en: nameEn,
    description,
    category_slug: categorySlug,
    category_name_ar: categoryNameAr,
    category_name_en: categoryNameEn,
    image_url: imageUrl,
    starting_price: startingPrice,
    currency,
  };
}

export function toPublicMarketplaceItemDetail(input: {
  id: unknown;
  slug: unknown;
  name_ar?: unknown;
  name_en?: unknown;
  short_description?: unknown;
  long_description?: unknown;
  category_slug: unknown;
  category_name_ar: unknown;
  category_name_en: unknown;
  primary_image_url?: unknown;
  gallery_image_urls?: unknown;
  starting_price?: unknown;
  currency?: unknown;
  city?: unknown;
  features?: unknown;
  badge?: unknown;
}): PublicMarketplaceItemDetail | null {
  const id = sanitizeText(input.id, 120);
  const slug = normalizeMarketplaceSlug(input.slug);
  const categorySlug = normalizeMarketplaceSlug(input.category_slug);
  const categoryNameAr = sanitizeText(input.category_name_ar);
  const categoryNameEn = sanitizeText(input.category_name_en);
  const nameAr = sanitizeText(input.name_ar);
  const nameEn = sanitizeText(input.name_en);

  if (!id || !slug || !categorySlug || !categoryNameAr || !categoryNameEn || (!nameAr && !nameEn)) {
    return null;
  }

  return {
    id,
    slug,
    name_ar: nameAr ?? undefined,
    name_en: nameEn ?? undefined,
    short_description: sanitizeText(input.short_description, MAX_DESCRIPTION_LENGTH) ?? undefined,
    long_description: sanitizeText(input.long_description, 1200) ?? undefined,
    category_slug: categorySlug,
    category_name_ar: categoryNameAr,
    category_name_en: categoryNameEn,
    primary_image_url: normalizePublicImageUrl(input.primary_image_url) ?? undefined,
    gallery_image_urls: sanitizeImageUrlArray(input.gallery_image_urls, 8),
    starting_price:
      typeof input.starting_price === 'number' && Number.isFinite(input.starting_price) && input.starting_price >= 0
        ? input.starting_price
        : undefined,
    currency: sanitizeCurrency(input.currency) ?? undefined,
    city: sanitizeText(input.city, 120) ?? undefined,
    features: sanitizeStringArray(input.features, 10, 120),
    badge: sanitizeText(input.badge, 60) ?? undefined,
  };
}
