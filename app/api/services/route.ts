// src/app/api/services/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET() {
    try {
        if (!supabaseAdmin) {
            return NextResponse.json({ error: 'Service unavailable' }, { status: 500 });
        }

        const { data: services, error } = await supabaseAdmin
            .from('services')
            .select(`
                *,
                products:products(
                    *,
                    partner:partners(*),
                    images:product_images(*)
                )
            `)
            .order('created_at', { ascending: true });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(services);
    } catch {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}