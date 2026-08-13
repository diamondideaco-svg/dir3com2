import { NextRequest, NextResponse } from 'next/server';
import { convertCurrency } from '@/lib/currency/service';
import { supabaseAdmin } from '@/lib/supabase/server';
import { logServerError } from '@/lib/security/safe-logger';
import { normalizeMarketplaceSlug, toPublicMarketplaceItemSummary } from '@/lib/marketplace/public-serializer';
import { applyPublicCategoryFilters, applyPublicProductFilters } from '@/lib/marketplace/public-filters';
import {
  getSyntheticSchemaOperationalMessage,
  isOperationalSyntheticSchemaError,
} from '@/lib/marketplace/synthetic-compat';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 30;
const MIN_SEARCH_LENGTH = 2;
const MAX_SEARCH_LENGTH = 80;
const ALLOWED_QUERY_PARAMS = new Set(['category', 'page', 'pageSize', 'q', 'currency']);

function parseDisplayCurrency(value: string | null) {
  const normalized = (value ?? '').trim().toUpperCase();
  if (normalized === 'SAR' || normalized === 'EGP' || normalized === 'USD' || normalized === 'EUR' || normalized === 'AED') {
    return normalized;
  }

  return 'SAR';
}

function readPositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function normalizeSearchQuery(value: string | null) {
  if (value === null) {
    return { value: null as string | null, error: null as string | null };
  }

  const compacted = value.trim().replace(/\s+/g, ' ');
  if (!compacted) {
    return { value: null as string | null, error: null as string | null };
  }

  if (compacted.length < MIN_SEARCH_LENGTH || compacted.length > MAX_SEARCH_LENGTH) {
    return { value: null as string | null, error: 'Invalid search query length.' };
  }

  const sanitized = compacted.replace(/[^\p{L}\p{N}\s-]/gu, '').trim();
  if (sanitized.length < MIN_SEARCH_LENGTH) {
    return { value: null as string | null, error: 'Invalid search query.' };
  }

  return { value: sanitized, error: null as string | null };
}

function escapeIlikePattern(value: string) {
  return value.replace(/[%_]/g, '');
}

export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Marketplace is unavailable right now.' }, { status: 503 });
    }

    const client = supabaseAdmin;

    for (const key of request.nextUrl.searchParams.keys()) {
      if (!ALLOWED_QUERY_PARAMS.has(key)) {
        return NextResponse.json({ error: 'Invalid marketplace query parameter.' }, { status: 400 });
      }
    }

    const page = readPositiveInt(request.nextUrl.searchParams.get('page'), DEFAULT_PAGE);
    const pageSize = Math.min(readPositiveInt(request.nextUrl.searchParams.get('pageSize'), DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
    const categorySlug = normalizeMarketplaceSlug(request.nextUrl.searchParams.get('category'));
    const displayCurrency = parseDisplayCurrency(request.nextUrl.searchParams.get('currency'));
    const search = normalizeSearchQuery(request.nextUrl.searchParams.get('q'));

    if (search.error) {
      return NextResponse.json({ error: search.error }, { status: 400 });
    }

    let categoryId: string | null = null;
    let categoryFilter: { slug: string; name_ar: string; name_en: string } | null = null;

    if (request.nextUrl.searchParams.has('category')) {
      if (!categorySlug) {
        return NextResponse.json({ error: 'Invalid marketplace category.' }, { status: 400 });
      }

      const { data: category, error: categoryError } = await applyPublicCategoryFilters(
        client
          .from('product_categories')
          .select('id, slug, name_ar, name_en, synthetic')
          .eq('slug', categorySlug)
      ).maybeSingle();

      if (categoryError) {
        logServerError('api.public.marketplace.items.category_read_failed', categoryError);
        if (isOperationalSyntheticSchemaError(categoryError)) {
          return NextResponse.json({ error: getSyntheticSchemaOperationalMessage() }, { status: 503 });
        }
        return NextResponse.json({ error: 'Unable to load marketplace items right now.' }, { status: 500 });
      }

      if (!category) {
        return NextResponse.json({ items: [], meta: { page, pageSize, total: 0, totalPages: 1, category: categorySlug } }, { status: 200 });
      }

      categoryId = String(category.id);
      categoryFilter = {
        slug: String(category.slug),
        name_ar: String(category.name_ar),
        name_en: String(category.name_en),
      };
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const buildProductsQuery = () => {
      let query = applyPublicProductFilters(
        client
        .from('products')
        .select('*', { count: 'exact' })
      );
      query = query
        .order('featured', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (categoryId) {
        query = query.eq('category_id', categoryId);
      }

      if (search.value) {
        const pattern = `%${escapeIlikePattern(search.value)}%`;
        query = query.or(`name_ar.ilike.${pattern},name_en.ilike.${pattern},description_ar.ilike.${pattern}`);
      }

      return query;
    };

    const { data: products, error: productsError, count } = await buildProductsQuery();

    if (productsError) {
      logServerError('api.public.marketplace.items.read_failed', productsError);
      if (isOperationalSyntheticSchemaError(productsError)) {
        return NextResponse.json({ error: getSyntheticSchemaOperationalMessage() }, { status: 503 });
      }
      return NextResponse.json({ error: 'Unable to load marketplace items right now.' }, { status: 500 });
    }

    const categoryIds = Array.from(
      new Set((products ?? []).map((product: Record<string, unknown>) => (typeof product.category_id === 'string' ? product.category_id : null)).filter(Boolean))
    ) as string[];

    const { data: categories, error: categoriesError } = categoryIds.length
      ? await applyPublicCategoryFilters(
          client.from('product_categories').select('id, slug, name_ar, name_en, synthetic').in('id', categoryIds)
        )
      : { data: [], error: null };

    if (categoriesError) {
      logServerError('api.public.marketplace.items.categories_read_failed', categoriesError);
      if (isOperationalSyntheticSchemaError(categoriesError)) {
        return NextResponse.json({ error: getSyntheticSchemaOperationalMessage() }, { status: 503 });
      }
      return NextResponse.json({ error: 'Unable to load marketplace items right now.' }, { status: 500 });
    }

    const categoryById = new Map((categories ?? []).map((category) => [category.id, category]));

    const productIds = (products ?? [])
      .map((product: Record<string, unknown>) => (typeof product.id === 'string' ? product.id : null))
      .filter((value: string | null): value is string => value !== null);

    const { data: images, error: imagesError } = productIds.length
      ? await client
          .from('product_images')
          .select('product_id, image_url, is_primary, created_at, synthetic')
          .in('product_id', productIds)
          .eq('synthetic', false)
          .order('is_primary', { ascending: false })
          .order('created_at', { ascending: true })
      : { data: [], error: null };

    if (imagesError) {
      logServerError('api.public.marketplace.items.images_read_failed', imagesError);
      if (isOperationalSyntheticSchemaError(imagesError)) {
        return NextResponse.json({ error: getSyntheticSchemaOperationalMessage() }, { status: 503 });
      }
      return NextResponse.json({ error: 'Unable to load marketplace items right now.' }, { status: 500 });
    }

    const imageByProductId = new Map<string, string>();
    for (const image of images ?? []) {
      const productId = typeof image.product_id === 'string' ? image.product_id : null;
      if (productId && !imageByProductId.has(productId) && typeof image.image_url === 'string') {
        imageByProductId.set(productId, image.image_url);
      }
    }

    const safeItems = (products ?? [])
      .map((product: Record<string, unknown>) => {
        const productId = typeof product.id === 'string' ? product.id : null;
        if (!productId) {
          return null;
        }

        const category = product.category_id ? categoryById.get(product.category_id) : undefined;
        if (!category) {
          return null;
        }

        return toPublicMarketplaceItemSummary({
          id: productId,
          slug: product.slug,
          name_ar: product.name_ar,
          name_en: product.name_en,
          description: product.description_ar,
          category_slug: category.slug,
          category_name_ar: category.name_ar,
          category_name_en: category.name_en,
          image_url: imageByProductId.get(productId),
          starting_price: product.base_price,
          currency: product.currency,
        });
      })
      .filter((item: ReturnType<typeof toPublicMarketplaceItemSummary> | null): item is NonNullable<typeof item> => item !== null);

    const items = await Promise.all(
      safeItems.map(async (item) => {
        if (typeof item.starting_price !== 'number' || !item.currency) {
          return { ...item, display_price: null };
        }

        const converted = await convertCurrency({
          amount: item.starting_price,
          sourceCurrency: item.currency,
          targetCurrency: displayCurrency,
        });

        return {
          ...item,
          display_price: {
            amount: converted.quote.convertedAmount,
            currency: converted.quote.target,
            base_amount: item.starting_price,
            base_currency: item.currency,
            live: converted.ok,
          },
        };
      })
    );

    const total = typeof count === 'number' && count >= 0 ? count : safeItems.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return NextResponse.json(
      {
        category: categoryFilter,
        items,
        meta: {
          page,
          pageSize,
          total,
          totalPages,
          category: categoryFilter?.slug ?? null,
          q: search.value,
          displayCurrency,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    logServerError('api.public.marketplace.items.unexpected_error', error);
    return NextResponse.json({ error: 'Unable to load marketplace items right now.' }, { status: 500 });
  }
}
