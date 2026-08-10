import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { logServerError } from '@/lib/security/safe-logger';
import { toPublicMarketplaceCategory } from '@/lib/marketplace/public-serializer';
import { applyPublicCategoryFilters, applyPublicProductFilters } from '@/lib/marketplace/public-filters';

export async function GET(request: NextRequest) {
  void request;

  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Marketplace is unavailable right now.' }, { status: 503 });
    }

    const { data: products, error: productsError } = await applyPublicProductFilters(
      supabaseAdmin
        .from('products')
        .select('category_id')
    );

    if (productsError) {
      logServerError('api.public.marketplace.categories.products_read_failed', productsError);
      return NextResponse.json({ error: 'Unable to load marketplace categories right now.' }, { status: 500 });
    }

    const counts = new Map<string, number>();
    for (const product of products ?? []) {
      const categoryId = typeof product.category_id === 'string' ? product.category_id : null;
      if (!categoryId) {
        continue;
      }

      counts.set(categoryId, (counts.get(categoryId) ?? 0) + 1);
    }

    const categoryIds = Array.from(counts.keys());
    if (categoryIds.length === 0) {
      return NextResponse.json({ categories: [] }, { status: 200 });
    }

    const { data: categories, error: categoriesError } = await applyPublicCategoryFilters(
      supabaseAdmin
        .from('product_categories')
        .select('id, slug, name_ar, name_en')
        .in('id', categoryIds)
    ).order('name_en', { ascending: true });

    if (categoriesError) {
      logServerError('api.public.marketplace.categories.read_failed', categoriesError);
      return NextResponse.json({ error: 'Unable to load marketplace categories right now.' }, { status: 500 });
    }

    const safeCategories = (categories ?? [])
      .map((category) =>
        toPublicMarketplaceCategory({
          slug: category.slug,
          name_ar: category.name_ar,
          name_en: category.name_en,
          item_count: counts.get(category.id) ?? 0,
        })
      )
      .filter((category): category is NonNullable<typeof category> => category !== null);

    return NextResponse.json({ categories: safeCategories }, { status: 200 });
  } catch (error) {
    logServerError('api.public.marketplace.categories.unexpected_error', error);
    return NextResponse.json({ error: 'Unable to load marketplace categories right now.' }, { status: 500 });
  }
}
