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