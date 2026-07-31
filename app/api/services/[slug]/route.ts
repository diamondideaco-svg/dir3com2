import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getMarketplaceSnapshot } from '@/lib/marketplace/server';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    void request;

    try {
        const { slug } = await params;

        if (supabaseAdmin) {
            const { data: service, error } = await supabaseAdmin
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
                .eq('slug', slug)
                .single();

            if (!error && service) {
                return NextResponse.json(service);
            }

            const { data: product, error: productError } = await supabaseAdmin
                .from('products')
                .select('*')
                .eq('slug', slug)
                .in('status', ['published', 'active', 'featured'])
                .single();

            if (!productError && product) {
                const { data: category } = await supabaseAdmin
                    .from('product_categories')
                    .select('id,slug,name_en,name_ar')
                    .eq('id', product.category_id)
                    .maybeSingle();

                const { data: images } = await supabaseAdmin
                    .from('product_images')
                    .select('*')
                    .eq('product_id', product.id)
                    .order('created_at', { ascending: true });

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
        const fallback = snapshot.services.find((service) => service.slug === slug || service.href.endsWith(`/${slug}`));

        if (!fallback) {
            return NextResponse.json({ error: 'الخدمة غير موجودة حالياً' }, { status: 404 });
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
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}