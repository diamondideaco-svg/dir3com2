'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminActionAccess } from '@/lib/auth/admin';
import { TEAM_PERMISSIONS, isCeoActor, isCeoUserId, normalizeEmail } from '@/lib/auth/team-access';
import { supabaseAdmin } from '@/lib/supabase/server';

function csvValues(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') return [];
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function selectedPermissions(formData: FormData) {
  const requested = formData.getAll('permissions').map(String);
  return requested.filter((permission) => TEAM_PERMISSIONS.includes(permission as (typeof TEAM_PERMISSIONS)[number]));
}

async function requireCeo() {
  const context = await requireAdminActionAccess();
  if (!await isCeoActor(context.supabase, context.user)) throw new Error('CEO access required');
  if (!supabaseAdmin) throw new Error('ADMIN_DATA_ACCESS_UNAVAILABLE');
  return { ...context, admin: supabaseAdmin };
}

export async function upsertTeamAccessGrantAction(formData: FormData) {
  const { user, admin } = await requireCeo();
  const email = normalizeEmail(formData.get('email'));
  const jobTitle = String(formData.get('jobTitle') || '').trim().slice(0, 120);
  const accessLevel = formData.get('accessLevel') === 'global_admin' ? 'global_admin' : 'scoped_staff';
  const countryScope = csvValues(formData.get('countryScope')).slice(0, 20);
  const permissions = accessLevel === 'global_admin' ? ['admin:full'] : selectedPermissions(formData);

  if (!email || !email.includes('@')) throw new Error('Valid email is required');
  if (!jobTitle) throw new Error('Job title is required');

  const { data: existingUsers, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;
  let authUser = existingUsers.users.find((candidate) => normalizeEmail(candidate.email) === email) ?? null;

  if (!authUser) {
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { invited_by: user.id, invited_job_title: jobTitle },
    });
    if (inviteError) throw inviteError;
    authUser = invited.user;
  }

  if (!authUser?.id) throw new Error('Authenticated team identity is required');
  if (isCeoUserId(authUser.id) && accessLevel !== 'global_admin') throw new Error('CEO access cannot be reduced');

  const profileRole = accessLevel === 'global_admin' ? 'admin' : 'staff';
  const { error: profileError } = await admin.from('profiles').upsert({
    id: authUser.id,
    email,
    full_name: authUser.user_metadata?.full_name || authUser.user_metadata?.name || email.split('@')[0],
    role: profileRole,
    status: 'active',
  }, { onConflict: 'id' });
  if (profileError) throw profileError;

  const { error: grantError } = await admin.from('team_access_grants').upsert({
    email,
    job_title: jobTitle,
    access_level: accessLevel,
    country_scope: countryScope,
    permissions,
    status: 'active',
    invited_user_id: authUser.id,
    created_by: user.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'invited_user_id' });
  if (grantError) throw grantError;

  revalidatePath('/admin/team');
}

export async function setTeamAccessStatusAction(formData: FormData) {
  const { admin } = await requireCeo();
  const email = normalizeEmail(formData.get('email'));
  const status = formData.get('status') === 'active' ? 'active' : 'inactive';
  if (!email) throw new Error('Email is required');

  const { data: grant, error: readError } = await admin
    .from('team_access_grants')
    .select('invited_user_id, access_level')
    .eq('email', email)
    .maybeSingle();
  if (readError) throw readError;
  if (!grant) throw new Error('Team access grant not found');
  if (isCeoUserId(grant.invited_user_id)) {
    if (status !== 'active') throw new Error('CEO access cannot be disabled');
    if (grant.access_level !== 'global_admin') throw new Error('CEO access cannot be reduced');
  }

  const { error: updateError } = await admin
    .from('team_access_grants')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('email', email);
  if (updateError) throw updateError;

  if (grant.invited_user_id) {
    const profileStatus = status === 'active' ? 'active' : 'inactive';
    const profileRole = grant.access_level === 'global_admin' ? 'admin' : 'staff';
    const { error: profileError } = await admin
      .from('profiles')
      .update({ status: profileStatus, role: profileRole })
      .eq('id', grant.invited_user_id);
    if (profileError) throw profileError;
  }

  revalidatePath('/admin/team');
}
