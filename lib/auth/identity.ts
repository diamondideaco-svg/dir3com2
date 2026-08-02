import 'server-only';

import type { SupabaseClient, User } from '@supabase/supabase-js';

export type CanonicalRole = 'customer' | 'admin' | 'partner' | 'staff';

const ROLE_ALIASES: Record<string, CanonicalRole> = {
  client: 'customer',
  customer: 'customer',
  admin: 'admin',
  super_admin: 'admin',
  partner: 'partner',
  staff: 'staff',
};

function toSafeString(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

export function normalizeRole(value: unknown, fallback: CanonicalRole = 'customer'): CanonicalRole {
  const normalized = ROLE_ALIASES[toSafeString(value).toLowerCase()];
  return normalized ?? fallback;
}

export function isAdminRole(value: unknown) {
  return normalizeRole(value) === 'admin';
}

function getAuthUserDisplayName(user: User) {
  const metadata = user.user_metadata || {};
  const directName = toSafeString(metadata.full_name_ar) || toSafeString(metadata.full_name) || toSafeString(metadata.name);
  if (directName) {
    return directName;
  }

  const email = toSafeString(user.email);
  return email.split('@')[0] || 'مستخدم';
}

export async function resolveCanonicalUserRole(supabase: SupabaseClient, userId: string): Promise<CanonicalRole | null> {
  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (!profileError && profileData?.role) {
    return normalizeRole(profileData.role);
  }

  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (!userError && userData?.role) {
    return normalizeRole(userData.role);
  }

  return null;
}

export async function ensureCanonicalProfileFromAuthUser(supabase: SupabaseClient, user: User) {
  const fullName = getAuthUserDisplayName(user);
  const email = toSafeString(user.email);

  const { data: existingProfile, error: profileReadError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (profileReadError) {
    throw profileReadError;
  }

  if (existingProfile?.id) {
    const { error: profileUpdateError } = await supabase
      .from('profiles')
      .update({
        full_name: fullName,
        email,
      })
      .eq('id', user.id);

    if (profileUpdateError) {
      throw profileUpdateError;
    }
  } else {
    const { error: profileInsertError } = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        full_name: fullName,
        email,
        role: 'customer',
        status: 'active',
      });

    if (profileInsertError) {
      throw profileInsertError;
    }
  }

  await supabase.from('users').upsert(
    {
      id: user.id,
      email,
      full_name_ar: fullName,
      role: 'customer',
      phone: '',
    },
    { onConflict: 'id', ignoreDuplicates: true }
  );
}
