import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { logServerError } from '@/lib/security/safe-logger';
import { normalizeMarketplaceSlug, toPublicMarketplaceItemSummary } from '@/lib/marketplace/public-serializer';

const PUBLISHED_STATUSES = ['published', 'active', 'featured'];
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 30;

function readPositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Marketplace is unavailable right now.' }, { status: 503 });
    }

    const page = readPositiveInt(request.nextUrl.searchParams.get('page'), DEFAULT_PAGE);
    const pageSize = Math.min(readPositiveInt(request.nextUrl.searchParams.get('pageSize'), DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
    const categorySlug = normalizeMarketplaceSlug(request.nextUrl.searchParams.get('category'));

    let categoryId: string | null = null;
    let categoryFilter: { slug: string; name_ar: string; name_en: string } | null = null;

    if (request.nextUrl.searchParams.has('category')) {
      if (!categorySlug) {
        return NextResponse.json({ error: 'Invalid marketplace category.' }, { status: 400 });
      }

      const { data: category, error: categoryError } = await supabaseAdmin
        .from('product_categories')
        .select('id, slug, name_ar, name_en')
        .eq('slug', categorySlug)
        .maybeSingle();

      if (categoryError) {
        logServerError('api.public.marketplace.items.category_read_failed', categoryError);
        return NextResponse.json({ error: 'Unable to load marketplace items right now.' }, { status: 500 });
      }

      if (!category) {
        return NextResponse.json({ items: [], meta: { page, pageSize, total: 0, totalPages: 1, category: categorySlug } }, { status: 200 });
      }

      categoryId = category.id;
      categoryFilter = {
        slug: category.slug,
        name_ar: category.name_ar,
        name_en: category.name_en,
      };
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabaseAdmin
      .from('products')
      .select('id, slug, name_ar, name_en, description_ar, base_price, currency, category_id, status, featured, created_at', { count: 'exact' })
      .in('status', PUBLISHED_STATUSES)
      .order('featured', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }

    const { data: products, count, error: productsError } = await query;

    if (productsError) {
      logServerError('api.public.marketplace.items.read_failed', productsError);
      return NextResponse.json({ error: 'Unable to load marketplace items right now.' }, { status: 500 });
    }

    const categoryIds = Array.from(
      new Set((products ?? []).map((product) => (typeof product.category_id === 'string' ? product.category_id : null)).filter(Boolean))
    ) as string[];

    const { data: categories, error: categoriesError } = categoryIds.length
      ? await supabaseAdmin.from('product_categories').select('id, slug, name_ar, name_en').in('id', categoryIds)
      : { data: [], error: null };

    if (categoriesError) {
      logServerError('api.public.marketplace.items.categories_read_failed', categoriesError);
      return NextResponse.json({ error: 'Unable to load marketplace items right now.' }, { status: 500 });
    }

    const categoryById = new Map((categories ?? []).map((category) => [category.id, category]));

    const productIds = (products ?? [])
      .map((product) => (typeof product.id === 'string' ? product.id : null))
      .filter((value): value is string => value !== null);

    const { data: images, error: imagesError } = productIds.length
      ? await supabaseAdmin
          .from('product_images')
          .select('product_id, image_url, is_primary, created_at')
          .in('product_id', productIds)
          .order('is_primary', { ascending: false })
          .order('created_at', { ascending: true })
      : { data: [], error: null };

    if (imagesError) {
      logServerError('api.public.marketplace.items.images_read_failed', imagesError);
      return NextResponse.json({ error: 'Unable to load marketplace items right now.' }, { status: 500 });
    }

    const imageByProductId = new Map<string, string>();
    for (const image of images ?? []) {
      if (!imageByProductId.has(image.product_id) && typeof image.image_url === 'string') {
        imageByProductId.set(image.product_id, image.image_url);
      }
    }

    const safeItems = (products ?? [])
      .map((product) => {
        const category = product.category_id ? categoryById.get(product.category_id) : undefined;
        if (!category) {
          return null;
        }

        return toPublicMarketplaceItemSummary({
          id: product.id,
          slug: product.slug,
          name_ar: product.name_ar,
          name_en: product.name_en,
          description: product.description_ar,
          category_slug: category.slug,
          category_name_ar: category.name_ar,
          category_name_en: category.name_en,
          image_url: imageByProductId.get(product.id),
          starting_price: product.base_price,
          currency: product.currency,
        });
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const total = typeof count === 'number' && count >= 0 ? count : safeItems.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return NextResponse.json(
      {
        category: categoryFilter,
        items: safeItems,
        meta: {
          page,
          pageSize,
          total,
          totalPages,
          category: categoryFilter?.slug ?? null,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    logServerError('api.public.marketplace.items.unexpected_error', error);
    return NextResponse.json({ error: 'Unable to load marketplace items right now.' }, { status: 500 });
  }
}
