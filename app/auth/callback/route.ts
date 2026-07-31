// src/app/auth/callback/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getPostLoginDestination } from '@/lib/auth/redirect';
import { ensureCanonicalProfileFromAuthUser } from '@/lib/auth/identity';
import { logServerError, logServerEvent } from '@/lib/security/safe-logger';

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
    const requestedDestination = searchParams.get('redirect') ?? searchParams.get('next');
    const next = getPostLoginDestination(requestedDestination, origin);
    const flowId = searchParams.get('sb_flow_id');

    if (!code) {
        return NextResponse.redirect(`${origin}/login?error=no_code`);
    }

    try {
        const supabase = await createSupabaseServerClient();

        const { data, error } = await supabase.auth.exchangeCodeForSession(
            code,
            flowId ? { flowId } : undefined,
        );
        if (error) {
            logServerError('auth.callback.exchange_failed', error);
            return NextResponse.redirect(`${origin}/login?error=${error.message}`);
        }

        if (data?.user) {
            await ensureCanonicalProfileFromAuthUser(supabase, data.user);
            logServerEvent('auth.callback.identity_synced');
        }

        return NextResponse.redirect(`${origin}${next}`);
    } catch (err) {
        logServerError('auth.callback.unexpected_error', err);
        return NextResponse.redirect(`${origin}/login?error=server_error`);
    }
}
