import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { logServerError } from '@/lib/security/safe-logger';
import { normalizeMarketplaceSlug, toPublicMarketplaceItemDetail } from '@/lib/marketplace/public-serializer';
import { applyPublicAssetSyntheticFilter, applyPublicCategoryFilters, applyPublicProductFilters } from '@/lib/marketplace/public-filters';

function buildUnavailableResponse() {
  return NextResponse.json({ error: 'This marketplace item is unavailable.' }, { status: 404 });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  void request;

  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Unable to load marketplace item right now.' }, { status: 500 });
    }

    const { slug } = await params;
    const normalizedSlug = normalizeMarketplaceSlug(slug);

    if (!normalizedSlug) {
      return NextResponse.json({ error: 'Invalid marketplace item slug.' }, { status: 400 });
    }

    const { data: product, error: productError } = await applyPublicProductFilters(
      supabaseAdmin
        .from('products')
        .select('id, slug, name_ar, name_en, description_ar, description_en, city, base_price, currency, featured, category_id')
        .eq('slug', normalizedSlug)
    ).maybeSingle();

    if (productError) {
      logServerError('api.public.marketplace.item_detail.read_failed', productError);
      return NextResponse.json({ error: 'Unable to load marketplace item right now.' }, { status: 500 });
    }

    if (!product) {
      return buildUnavailableResponse();
    }

    const { data: category, error: categoryError } = await applyPublicCategoryFilters(
      supabaseAdmin
        .from('product_categories')
        .select('slug, name_ar, name_en')
        .eq('id', product.category_id)
    ).maybeSingle();

    if (categoryError) {
      logServerError('api.public.marketplace.item_detail.category_read_failed', categoryError);
      return NextResponse.json({ error: 'Unable to load marketplace item right now.' }, { status: 500 });
    }

    if (!category) {
      return buildUnavailableResponse();
    }

    const { data: images, error: imagesError } = await applyPublicAssetSyntheticFilter(
      supabaseAdmin
        .from('product_images')
        .select('image_url, is_primary, sort_order, created_at')
        .eq('product_id', product.id)
    )
      .order('is_primary', { ascending: false })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (imagesError) {
      logServerError('api.public.marketplace.item_detail.images_read_failed', imagesError);
      return NextResponse.json({ error: 'Unable to load marketplace item right now.' }, { status: 500 });
    }

    const { data: features, error: featuresError } = await applyPublicAssetSyntheticFilter(
      supabaseAdmin
        .from('product_features')
        .select('feature_text_ar, feature_text_en, created_at')
        .eq('product_id', product.id)
    ).order('created_at', { ascending: true });

    if (featuresError) {
      logServerError('api.public.marketplace.item_detail.features_read_failed', featuresError);
      return NextResponse.json({ error: 'Unable to load marketplace item right now.' }, { status: 500 });
    }

    const galleryImageUrls = (images ?? [])
      .map((image) => (typeof image.image_url === 'string' ? image.image_url : null))
      .filter((url): url is string => url !== null);

    const primaryImageUrl = galleryImageUrls[0] ?? null;

    const featureLabels = (features ?? [])
      .map((feature) => {
        if (typeof feature.feature_text_en === 'string' && feature.feature_text_en.trim()) {
          return feature.feature_text_en;
        }

        if (typeof feature.feature_text_ar === 'string' && feature.feature_text_ar.trim()) {
          return feature.feature_text_ar;
        }

        return null;
      })
      .filter((feature): feature is string => feature !== null);

    const safeItem = toPublicMarketplaceItemDetail({
      id: product.id,
      slug: product.slug,
      name_ar: product.name_ar,
      name_en: product.name_en,
      short_description: product.description_ar,
      long_description: product.description_en ?? product.description_ar,
      category_slug: category.slug,
      category_name_ar: category.name_ar,
      category_name_en: category.name_en,
      primary_image_url: primaryImageUrl,
      gallery_image_urls: galleryImageUrls,
      starting_price: product.base_price,
      currency: product.currency,
      city: product.city,
      features: featureLabels,
      badge: product.featured ? 'Featured' : null,
    });

    if (!safeItem) {
      return buildUnavailableResponse();
    }

    return NextResponse.json({ item: safeItem }, { status: 200 });
  } catch (error) {
    logServerError('api.public.marketplace.item_detail.unexpected_error', error);
    return NextResponse.json({ error: 'Unable to load marketplace item right now.' }, { status: 500 });
  }
}
