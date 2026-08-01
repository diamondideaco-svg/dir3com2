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
