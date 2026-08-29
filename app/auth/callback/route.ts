// src/app/auth/callback/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient, supabaseAdmin } from '@/lib/supabase/server';
import { getPostLoginDestination, getRolePostLoginDestination } from '@/lib/auth/redirect';
import { ensureCanonicalProfileFromAuthUser } from '@/lib/auth/identity';
import { logServerError, logServerEvent } from '@/lib/security/safe-logger';

function getSafeCallbackErrorCode(message: string | undefined) {
    const normalized = (message ?? '').toLowerCase();

    if (normalized.includes('expired') || normalized.includes('timeout')) {
        return 'session_expired';
    }

    if (normalized.includes('flow') || normalized.includes('state')) {
        return 'invalid_flow';
    }

    if (normalized.includes('invalid') || normalized.includes('code')) {
        return 'invalid_code';
    }

    return 'exchange_failed';
}

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
    const flowId = searchParams.get('sb_flow_id');
    const requestedDestination = searchParams.get('redirect') ?? searchParams.get('next');
    const safeRequestedDestination = getPostLoginDestination(requestedDestination, origin);

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
            const safeCode = getSafeCallbackErrorCode(error.message);
            return NextResponse.redirect(`${origin}/login?error=${safeCode}`);
        }

        if (data?.user) {
            try {
                await ensureCanonicalProfileFromAuthUser(supabaseAdmin ?? supabase, data.user);
                logServerEvent('auth.callback.identity_synced');
            } catch (profileSyncError) {
                // Login must succeed even if profile enrichment fails due temporary DB policy/grant drift.
                logServerError('auth.callback.identity_sync_failed_non_blocking', profileSyncError, {
                    userId: data.user.id,
                });
            }
        }

        const { data: profile } = data?.user
            ? await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle()
            : { data: null };
        const roleRaw = typeof profile?.role === 'string' ? profile.role : null;
        const next = requestedDestination
            ? safeRequestedDestination
            : getRolePostLoginDestination({ role: roleRaw, roleRaw });

        return NextResponse.redirect(`${origin}${next}`);
    } catch (err) {
        logServerError('auth.callback.unexpected_error', err);
        return NextResponse.redirect(`${origin}/login?error=server_error`);
    }
}
