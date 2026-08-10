import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getMarketplaceSnapshot } from '@/lib/marketplace/server';
import { applyPublicAssetSyntheticFilter, applyPublicCategoryFilters, applyPublicProductFilters } from '@/lib/marketplace/public-filters';
import {
    keepPublicAssetsNonSynthetic,
    looksSyntheticRecord,
    resolveArrayWithSyntheticCompatibility,
    resolveSingleWithSyntheticCompatibility,
    sanitizeServiceProductsForCompatibility,
} from '@/lib/marketplace/synthetic-compat';

type ServiceApiErrorCode = 'invalid_slug' | 'not_found' | 'internal_error';

function buildErrorResponse(code: ServiceApiErrorCode, message: string, status: number) {
    return NextResponse.json(
        {
            ok: false,
            error: {
                code,
                message,
            },
        },
        { status },
    );
}

function normalizeServiceSlug(rawSlug: string | null | undefined) {
    const normalized = decodeURIComponent((rawSlug ?? '').trim()).toLowerCase();
    const isValid = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized);

    if (!normalized || normalized.length > 120 || !isValid) {
        return null;
    }

    return normalized;
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    void request;

    try {
        const { slug } = await params;
        const normalizedSlug = normalizeServiceSlug(slug);

        if (!normalizedSlug) {
            return buildErrorResponse('invalid_slug', 'Invalid service slug.', 400);
        }

        if (supabaseAdmin) {
            const client = supabaseAdmin;

            const readService = async (withSyntheticFilter: boolean) => {
                let query = client
                    .from('services')
                    .select(`
                        *,
                        products:products(
                            *,
                            partner:partners(*),
                            images:product_images(*),
                            region:regions(*)
                        )
                    `)
                    .eq('slug', normalizedSlug);

                if (withSyntheticFilter) {
                    query = query.eq('products.synthetic', false);
                }

                return query.single();
            };

            const { data: service, error } = await resolveSingleWithSyntheticCompatibility(
                () => readService(true),
                () => readService(false),
                (row) => looksSyntheticRecord(row)
            );

            if (!error && service) {
                const safeProducts = sanitizeServiceProductsForCompatibility(Array.isArray(service.products) ? service.products : []);

                return NextResponse.json({
                    ...service,
                    products: safeProducts,
                });
            }

            const { data: product, error: productError } = await resolveSingleWithSyntheticCompatibility(
                () =>
                    applyPublicProductFilters(
                        client
                            .from('products')
                            .select('*, synthetic')
                            .eq('slug', normalizedSlug)
                    ).single(),
                () =>
                    client
                        .from('products')
                        .select('*')
                        .eq('slug', normalizedSlug)
                        .in('status', ['published', 'active', 'featured'])
                        .single(),
                (row) => looksSyntheticRecord(row)
            );

            if (!productError && product) {
                const { data: category } = await resolveSingleWithSyntheticCompatibility(
                    () =>
                        applyPublicCategoryFilters(
                            client
                                .from('product_categories')
                                .select('id,slug,name_en,name_ar,synthetic')
                                .eq('id', product.category_id)
                        ).maybeSingle(),
                    () =>
                        client
                            .from('product_categories')
                            .select('id,slug,name_en,name_ar')
                            .eq('id', product.category_id)
                            .maybeSingle(),
                    (row) => looksSyntheticRecord(row)
                );

                const { data: images } = await resolveArrayWithSyntheticCompatibility(
                    () =>
                        applyPublicAssetSyntheticFilter(
                            client
                                .from('product_images')
                                .select('*, synthetic')
                                .eq('product_id', product.id)
                        ).order('created_at', { ascending: true }),
                    () =>
                        client
                            .from('product_images')
                            .select('*')
                            .eq('product_id', product.id)
                            .order('created_at', { ascending: true }),
                    keepPublicAssetsNonSynthetic
                );

                return NextResponse.json({
                    id: product.id,
                    slug: product.slug,
                    name_ar: product.name_ar,
                    name_en: product.name_en,
                    description_ar: product.description_ar,
                    description_en: product.description_en,
                    badge: 'PRODUCT',
                    base_price: product.base_price,
                    currency: product.currency,
                    featured: product.featured,
                    status: product.status,
                    marketplace_category: category?.slug ?? category?.name_en ?? category?.name_ar ?? null,
                    category_slug: category?.slug ?? null,
                    category_name_en: category?.name_en ?? null,
                    category_name_ar: category?.name_ar ?? null,
                    created_at: product.created_at,
                    products: [
                        {
                            id: product.id,
                            name_ar: product.name_ar,
                            description_ar: product.description_ar,
                            price_per_unit: product.base_price,
                            unit_type: null,
                            slug: product.slug,
                            partner: null,
                            region: null,
                            images: (images ?? []).map((image) => ({
                                image_url: image.image_url,
                                is_primary: Boolean(image.is_primary),
                            })),
                        },
                    ],
                });
            }
        }

        const snapshot = await getMarketplaceSnapshot();
        const fallback = snapshot.services.find((service) => service.slug === normalizedSlug || service.href.endsWith(`/${normalizedSlug}`));

        if (!fallback) {
            return buildErrorResponse('not_found', 'Service not found.', 404);
        }

        return NextResponse.json({
            id: fallback.id,
            slug: fallback.slug,
            name_ar: fallback.name_ar,
            name_en: fallback.name_en,
            description_ar: fallback.description_ar,
            description_en: fallback.description_en,
            badge: fallback.badge,
            base_price: fallback.basePrice,
            currency: fallback.currency,
            featured: fallback.featured,
            status: fallback.availability,
            created_at: fallback.createdAt,
            products: [],
        });
    } catch {
        return buildErrorResponse('internal_error', 'Internal Server Error', 500);
    }
}