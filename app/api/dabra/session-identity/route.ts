import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  anonymousDabraIdentity,
  resolveDabraSessionUser,
  unresolvedDabraIdentity,
} from '@/lib/dabra/session-user-resolution';
import { logServerError } from '@/lib/security/safe-logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const resolution = await resolveDabraSessionUser(() => supabase.auth.getUser());
    if (resolution.identityState === 'unresolved_or_error') {
      logServerError('api.dabra.session_identity.user_validation_failed', resolution.error);
      return NextResponse.json(unresolvedDabraIdentity(), { status: 503 });
    }
    if (resolution.identityState === 'anonymous_confirmed') {
      return NextResponse.json(anonymousDabraIdentity(), { status: 200 });
    }
    return NextResponse.json(
      { identityState: 'authenticated', authenticated: true, userId: resolution.user.id },
      { status: 200 },
    );
  } catch (error) {
    logServerError('api.dabra.session_identity.unexpected_error', error);
    return NextResponse.json(unresolvedDabraIdentity(), { status: 503 });
  }
}
