import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/security/safe-logger';

function signedOutResponse() {
  return NextResponse.json(
    { signedOut: true },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST() {
  try {
    const cookieStore = await cookies();
    const hasSessionCookie = cookieStore
      .getAll()
      .some((cookie) => cookie.name.includes('auth-token') || cookie.name.startsWith('sb-'));

    if (!hasSessionCookie) {
      return signedOutResponse();
    }

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut({ scope: 'local' });

    if (error && error.name !== 'AuthSessionMissingError') {
      logServerError('api.auth.logout.sign_out_failed', error);
      return NextResponse.json(
        { signedOut: false },
        { status: 500, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return signedOutResponse();
  } catch (error) {
    logServerError('api.auth.logout.unexpected_error', error);
    return NextResponse.json(
      { signedOut: false },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
