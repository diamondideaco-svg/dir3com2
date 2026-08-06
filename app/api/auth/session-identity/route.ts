import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { normalizeRole } from '@/lib/auth/identity';
import { createAnonymousSessionIdentity, type SessionIdentity } from '@/lib/auth/identity-contract';
import { logServerError } from '@/lib/security/safe-logger';

function pickString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function pickDisplayName(profileName: unknown, metadata: Record<string, unknown>, email: string | null): string | null {
  const name =
    pickString(profileName) ??
    pickString(metadata.full_name_ar) ??
    pickString(metadata.full_name) ??
    pickString(metadata.name);

  if (name) {
    return name;
  }

  if (!email) {
    return null;
  }

  const local = email.split('@')[0]?.trim();
  return local || null;
}

function pickAvatarUrl(profileAvatar: unknown, metadata: Record<string, unknown>): string | null {
  return pickString(profileAvatar) ?? pickString(metadata.avatar_url) ?? pickString(metadata.picture);
}

function buildAuthenticatedIdentity(args: {
  userId: string;
  userEmail: string | null;
  profile: {
    full_name?: unknown;
    email?: unknown;
    avatar_url?: unknown;
    role?: unknown;
    status?: unknown;
  } | null;
  metadata: Record<string, unknown>;
}): SessionIdentity {
  const email = pickString(args.profile?.email) ?? args.userEmail;
  const role = normalizeRole(args.profile?.role);

  return {
    authenticated: true,
    userId: args.userId,
    email,
    displayName: pickDisplayName(args.profile?.full_name, args.metadata, email),
    avatarUrl: pickAvatarUrl(args.profile?.avatar_url, args.metadata),
    role,
    status: pickString(args.profile?.status),
    isAdmin: role === 'admin',
  };
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(createAnonymousSessionIdentity(), { status: 200 });
    }

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('full_name, email, avatar_url, role, status')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      logServerError('api.auth.session_identity.profile_read_failed', profileError);
    }

    const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;

    return NextResponse.json(
      buildAuthenticatedIdentity({
        userId: user.id,
        userEmail: pickString(user.email),
        profile: profileData,
        metadata,
      }),
      { status: 200 }
    );
  } catch (error) {
    logServerError('api.auth.session_identity.unexpected_error', error);
    return NextResponse.json(createAnonymousSessionIdentity(), { status: 200 });
  }
}
