// src/app/api/services/[slug]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const { slug } = await params;

        if (!supabaseAdmin) {
            return NextResponse.json({ error: 'Service unavailable' }, { status: 500 });
        }

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

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 404 });
        }

        return NextResponse.json(service);
    } catch {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}