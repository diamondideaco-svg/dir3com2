import { NextRequest, NextResponse } from 'next/server';
import { convertCurrency } from '@/lib/currency/service';
import { supabaseAdmin } from '@/lib/supabase/server';
import { logServerError } from '@/lib/security/safe-logger';
import { normalizeMarketplaceSlug, toPublicMarketplaceItemDetail } from '@/lib/marketplace/public-serializer';
import { applyPublicAssetSyntheticFilter, applyPublicCategoryFilters, applyPublicProductFilters } from '@/lib/marketplace/public-filters';
import {
  getSyntheticSchemaOperationalMessage,
  isOperationalSyntheticSchemaError,
} from '@/lib/marketplace/synthetic-compat';

function buildUnavailableResponse() {
  return NextResponse.json({ error: 'This marketplace item is unavailable.' }, { status: 404 });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const displayCurrencyRaw = request.nextUrl.searchParams.get('currency');
  const displayCurrency =
    displayCurrencyRaw === 'SAR' ||
    displayCurrencyRaw === 'EGP' ||
    displayCurrencyRaw === 'USD' ||
    displayCurrencyRaw === 'EUR' ||
    displayCurrencyRaw === 'AED'
      ? displayCurrencyRaw
      : 'SAR';

  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Unable to load marketplace item right now.' }, { status: 500 });
    }

    const client = supabaseAdmin;

    const { slug } = await params;
    const normalizedSlug = normalizeMarketplaceSlug(slug);

    if (!normalizedSlug) {
      return NextResponse.json({ error: 'Invalid marketplace item slug.' }, { status: 400 });
    }

    const { data: product, error: productError } = await applyPublicProductFilters(
      client
        .from('products')
        .select('id, slug, name_ar, name_en, description_ar, description_en, city, base_price, currency, featured, category_id, synthetic')
        .eq('slug', normalizedSlug)
    ).maybeSingle();

    if (productError) {
      logServerError('api.public.marketplace.item_detail.read_failed', productError);
      if (isOperationalSyntheticSchemaError(productError)) {
        return NextResponse.json({ error: getSyntheticSchemaOperationalMessage() }, { status: 503 });
      }
      return NextResponse.json({ error: 'Unable to load marketplace item right now.' }, { status: 500 });
    }

    if (!product) {
      return buildUnavailableResponse();
    }

    const { data: category, error: categoryError } = await applyPublicCategoryFilters(
      client
        .from('product_categories')
        .select('slug, name_ar, name_en, synthetic')
        .eq('id', product.category_id)
    ).maybeSingle();

    if (categoryError) {
      logServerError('api.public.marketplace.item_detail.category_read_failed', categoryError);
      if (isOperationalSyntheticSchemaError(categoryError)) {
        return NextResponse.json({ error: getSyntheticSchemaOperationalMessage() }, { status: 503 });
      }
      return NextResponse.json({ error: 'Unable to load marketplace item right now.' }, { status: 500 });
    }

    if (!category) {
      return buildUnavailableResponse();
    }

    const { data: images, error: imagesError } = await applyPublicAssetSyntheticFilter(
      client
        .from('product_images')
        .select('image_url, is_primary, sort_order, created_at, synthetic')
        .eq('product_id', product.id)
    )
      .order('is_primary', { ascending: false })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (imagesError) {
      logServerError('api.public.marketplace.item_detail.images_read_failed', imagesError);
      if (isOperationalSyntheticSchemaError(imagesError)) {
        return NextResponse.json({ error: getSyntheticSchemaOperationalMessage() }, { status: 503 });
      }
      return NextResponse.json({ error: 'Unable to load marketplace item right now.' }, { status: 500 });
    }

    const { data: features, error: featuresError } = await applyPublicAssetSyntheticFilter(
      client
        .from('product_features')
        .select('feature_text_ar, feature_text_en, created_at, synthetic')
        .eq('product_id', product.id)
    ).order('created_at', { ascending: true });

    if (featuresError) {
      logServerError('api.public.marketplace.item_detail.features_read_failed', featuresError);
      if (isOperationalSyntheticSchemaError(featuresError)) {
        return NextResponse.json({ error: getSyntheticSchemaOperationalMessage() }, { status: 503 });
      }
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

    const displayPrice =
      typeof safeItem.starting_price === 'number' && safeItem.currency
        ? await convertCurrency({
            amount: safeItem.starting_price,
            sourceCurrency: safeItem.currency,
            targetCurrency: displayCurrency,
          })
        : null;

    return NextResponse.json(
      {
        item: {
          ...safeItem,
          display_price: displayPrice
            ? {
                amount: displayPrice.quote.convertedAmount,
                currency: displayPrice.quote.target,
                base_amount: safeItem.starting_price,
                base_currency: safeItem.currency,
                live: displayPrice.ok,
              }
            : null,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    logServerError('api.public.marketplace.item_detail.unexpected_error', error);
    return NextResponse.json({ error: 'Unable to load marketplace item right now.' }, { status: 500 });
  }
}
