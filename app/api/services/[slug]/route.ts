import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getMarketplaceSnapshot } from '@/lib/marketplace/server';
import { applyPublicAssetSyntheticFilter, applyPublicCategoryFilters, applyPublicProductFilters } from '@/lib/marketplace/public-filters';

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

            const { data: product, error: productError } = await applyPublicProductFilters(
                client
                    .from('products')
                    .select('*')
                    .eq('slug', normalizedSlug)
            ).maybeSingle();

            if (productError) {
                return buildErrorResponse('internal_error', 'Unable to load service right now.', 500);
            }

            if (product) {
                const { data: category, error: categoryError } = await applyPublicCategoryFilters(
                    client
                        .from('product_categories')
                        .select('id,slug,name_en,name_ar')
                        .eq('id', product.category_id)
                ).maybeSingle();

                if (categoryError) {
                    return buildErrorResponse('internal_error', 'Unable to load service right now.', 500);
                }

                const { data: images, error: imagesError } = await applyPublicAssetSyntheticFilter(
                    client
                        .from('product_images')
                        .select('*')
                        .eq('product_id', product.id)
                ).order('created_at', { ascending: true });

                if (imagesError) {
                    return buildErrorResponse('internal_error', 'Unable to load service right now.', 500);
                }

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
                            images: (images ?? []).map((image: { image_url?: string | null; is_primary?: boolean | null }) => ({
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
