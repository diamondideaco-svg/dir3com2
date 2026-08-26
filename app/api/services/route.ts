import { NextRequest, NextResponse } from 'next/server';
import { getMarketplaceAssistantContext, queryMarketplace, sanitizeMarketplaceQuery } from '@/lib/marketplace/server';
import { createSupabaseRequestClient } from '@/lib/supabase/server';

type AuthenticationResolver = typeof createSupabaseRequestClient;

export async function resolveMarketplaceRequestContext(
    request: NextRequest,
    resolveAuthentication: AuthenticationResolver = createSupabaseRequestClient,
) {
    let userId: string | null = null;
    try {
        userId = (await resolveAuthentication(request))?.user.id ?? null;
    } catch {
        userId = null;
    }

    return {
        anonymous: !userId,
        clientKey: userId ? `authenticated:${userId}` : 'anonymous',
    };
}

export async function GET(request: NextRequest) {
    try {
        const url = new URL(request.url);
        const view = url.searchParams.get('view');

        if (view === 'assistant') {
            const context = await getMarketplaceAssistantContext();
            return NextResponse.json(context);
        }

        const query = sanitizeMarketplaceQuery(url.searchParams);
        const payload = await queryMarketplace(query, await resolveMarketplaceRequestContext(request));

        return NextResponse.json(payload);
    } catch {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
