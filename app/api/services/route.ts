import { NextResponse } from 'next/server';
import { getMarketplaceAssistantContext, queryMarketplace, sanitizeMarketplaceQuery } from '@/lib/marketplace/server';

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const view = url.searchParams.get('view');

        if (view === 'assistant') {
            const context = await getMarketplaceAssistantContext();
            return NextResponse.json(context);
        }

        const query = sanitizeMarketplaceQuery(url.searchParams);
        const payload = await queryMarketplace(query);

        return NextResponse.json(payload);
    } catch {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}