import { redirect } from 'next/navigation';
import { createSupabaseServerClient, supabaseAdmin } from '@/lib/supabase/server';

const PILOT_ALLOWED_ROLES = new Set(['admin', 'staff', 'super_admin']);

export type PilotProfileRow = {
  role?: string | null;
  status?: string | null;
  deleted_at?: string | null;
};

type PilotAccessReason =
  | 'ALLOWED'
  | 'PROFILE_INACTIVE'
  | 'PROFILE_DELETED'
  | 'PROFILE_NOT_AUTHORIZED';

export type PilotAccessDecision = {
  allowed: boolean;
  role: string;
  status: string;
  reason: PilotAccessReason;
};

function buildLoginTarget(destination: string) {
  const encoded = encodeURIComponent(destination);
  return `/login?redirect=${encoded}&next=${encoded}`;
}

export function parsePilotAllowlist(raw: string | undefined) {
  return new Set(
    String(raw || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

export function evaluatePilotAccess(params: {
  userId: string;
  profile: PilotProfileRow | null;
  allowlistRaw?: string;
}): PilotAccessDecision {
  const role = String(params.profile?.role || '').toLowerCase();
  const status = String(params.profile?.status || '').toLowerCase();
  const deletedAt = params.profile?.deleted_at;
  const allowlist = parsePilotAllowlist(
    params.allowlistRaw === undefined ? process.env.AI2_PILOT_ALLOWLIST_USER_IDS : params.allowlistRaw,
  );

  if (status !== 'active') {
    return {
      allowed: false,
      role,
      status,
      reason: 'PROFILE_INACTIVE',
    };
  }

  if (deletedAt) {
    return {
      allowed: false,
      role,
      status,
      reason: 'PROFILE_DELETED',
    };
  }

  if (PILOT_ALLOWED_ROLES.has(role) || allowlist.has(params.userId)) {
    return {
      allowed: true,
      role: role || 'allowlist',
      status,
      reason: 'ALLOWED',
    };
  }

  return {
    allowed: false,
    role,
    status,
    reason: 'PROFILE_NOT_AUTHORIZED',
  };
}

export async function readPilotProfile(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
): Promise<PilotProfileRow | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('role, status, deleted_at')
    .eq('id', userId)
    .maybeSingle();

  if (!error && data) {
    return data as PilotProfileRow;
  }

  if (!supabaseAdmin) {
    return null;
  }

  const fallback = await supabaseAdmin
    .from('profiles')
    .select('role, status, deleted_at')
    .eq('id', userId)
    .maybeSingle();

  if (fallback.error || !fallback.data) {
    return null;
  }

  return fallback.data as PilotProfileRow;
}

export async function authorizePilotUser(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, userId: string) {
  const profile = await readPilotProfile(supabase, userId);
  return evaluatePilotAccess({ userId, profile });
}

export async function requirePilotPageAccess(destination = '/ai/pilot') {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(buildLoginTarget(destination));
  }

  const decision = await authorizePilotUser(supabase, user.id);
  if (!decision.allowed) {
    redirect(buildLoginTarget(destination));
  }

  return { user, role: decision.role };
}
