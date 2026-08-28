import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getMarketplaceSnapshot } from '@/lib/marketplace/server';
import { applyPublicAssetSyntheticFilter, applyPublicCategoryFilters, applyPublicProductFilters, applyPublicServiceFilters } from '@/lib/marketplace/public-filters';
import {
    sanitizeServiceProductsForCompatibility,
} from '@/lib/marketplace/synthetic-compat';
import { getCanonicalService, resolveCanonicalServiceSlug } from '@/lib/services/canonical';

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

/** A canonical service page must render even with zero inventory rows. */
function buildCanonicalShellResponse(slug: string) {
    const canonical = getCanonicalService(slug);

    if (!canonical) {
        return null;
    }

    return NextResponse.json({
        id: `canonical-${canonical.slug}`,
        slug: canonical.slug,
        name_ar: canonical.name,
        name_en: canonical.name,
        description_ar: canonical.descriptionAr,
        description_en: canonical.descriptionEn,
        badge: canonical.eyebrow,
        base_price: null,
        currency: 'SAR',
        featured: false,
        status: 'available',
        created_at: null,
        canonical: true,
        products: [],
    });
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    void request;

    let requestedSlug = '';

    try {
        const { slug } = await params;
        const normalizedSlug = normalizeServiceSlug(slug);
        requestedSlug = normalizedSlug ?? '';

        if (!normalizedSlug) {
            return buildErrorResponse('invalid_slug', 'Invalid service slug.', 400);
        }

        const canonicalSlug = resolveCanonicalServiceSlug(normalizedSlug);
        const lookupSlug = canonicalSlug ?? normalizedSlug;

        if (supabaseAdmin) {
            const client = supabaseAdmin;

            const { data: service, error } = await applyPublicServiceFilters(
                client
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
                    .eq('slug', lookupSlug)
            )
                .eq('products.synthetic', false)
                .in('products.status', ['published', 'active', 'featured'])
                .eq('products.marketplace_environment', 'production')
                .neq('products.fulfilment_state', 'test_sandbox')
                .eq('products.images.synthetic', false)
                .maybeSingle();

            if (error) {
                const shell = buildCanonicalShellResponse(lookupSlug);

                if (shell) {
                    return shell;
                }

                return buildErrorResponse('internal_error', 'Unable to load service right now.', 500);
            }

            if (service) {
                const safeProducts = sanitizeServiceProductsForCompatibility(Array.isArray(service.products) ? service.products : []);

                return NextResponse.json({
                    ...service,
                    products: safeProducts,
                });
            }

            const { data: product, error: productError } = await applyPublicProductFilters(
                client
                    .from('products')
                    .select('*')
                    .eq('slug', normalizedSlug)
            ).maybeSingle();

            if (productError) {
                const shell = buildCanonicalShellResponse(lookupSlug);

                if (shell) {
                    return shell;
                }

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
                    marketplace_family: product.marketplace_family,
                    fulfilment_state: product.fulfilment_state,
                    transaction_method: product.transaction_method,
                    marketplace_environment: product.marketplace_environment,
                    supply_type: product.supply_type,
                    supplier_name: product.supplier_name,
                    supplier_verified: product.supplier_verified,
                    cancellation_summary: product.cancellation_summary,
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
            const shell = buildCanonicalShellResponse(lookupSlug);

            if (shell) {
                return shell;
            }

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
            marketplace_family: fallback.family.replace('dir3-', ''),
            fulfilment_state: fallback.fulfilmentState,
            transaction_method: fallback.transactionMethod,
            marketplace_environment: fallback.marketplaceEnvironment,
            supply_type: fallback.supplyType,
            supplier_name: fallback.supplierName,
            supplier_verified: fallback.supplierVerified,
            created_at: fallback.createdAt,
            products: [],
        });
    } catch {
        const shell = buildCanonicalShellResponse(requestedSlug);

        if (shell) {
            return shell;
        }

        return buildErrorResponse('internal_error', 'Internal Server Error', 500);
    }
}
