import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRequestClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/security/safe-logger';

function normalizeDisplayName(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function GET(request: NextRequest) {
  try {
    const authContext = await createSupabaseRequestClient(request);

    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await authContext.supabase
      .from('profiles')
      .select('full_name, email, phone')
      .eq('id', authContext.user.id)
      .maybeSingle();

    if (error) {
      logServerError('api.account.read_failed', error);
      return NextResponse.json({ error: 'Unable to load account right now.' }, { status: 500 });
    }

    const metadata = authContext.user.user_metadata ?? {};
    const fullName = data?.full_name ?? normalizeDisplayName(metadata.full_name_ar) ?? normalizeDisplayName(metadata.full_name) ?? normalizeDisplayName(metadata.name);
    const email = data?.email ?? authContext.user.email ?? null;
    const phone = data?.phone ?? null;
    const hasAnyValue = Boolean(fullName || email || phone);

    return NextResponse.json(
      {
        account: hasAnyValue
          ? {
              full_name: fullName,
              email,
              phone,
            }
          : null,
      },
      { status: 200 }
    );
  } catch (error) {
    logServerError('api.account.read_unexpected_error', error);
    return NextResponse.json({ error: 'Unable to load account right now.' }, { status: 500 });
  }
}