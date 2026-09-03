'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminActionAccess } from '@/lib/auth/admin';
import { TEAM_PERMISSIONS, isCeoActor, isCeoUserId, normalizeEmail } from '@/lib/auth/team-access';
import { supabaseAdmin } from '@/lib/supabase/server';
import { loadTeamAccess } from '@/lib/admin/team-access-data';

function csvValues(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') return [];
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function selectedPermissions(formData: FormData) {
  const requested = formData.getAll('permissions').map(String);
  return requested.filter((permission) => TEAM_PERMISSIONS.includes(permission as (typeof TEAM_PERMISSIONS)[number]));
}

function teamWriteError(error: { code?: string; message?: string }) {
  if (error.message === 'TEAM_ACCESS_IDENTITY_CONFLICT') return new Error('Team identity conflict. Review the existing employee access before trying again.');
  if (error.message === 'TEAM_ACCESS_CEO_PROTECTED') return new Error('CEO access cannot be disabled or reduced');
  if (error.message === 'TEAM_ACCESS_NOT_FOUND') return new Error('Team access grant not found');
  if (['PGRST202', '42883', 'PGRST205', '42P01'].includes(error.code ?? '')) return new Error('TEAM_ACCESS_UNAVAILABLE');
  return new Error('Team access could not be saved. No access changes were applied.');
}

async function requireCeo() {
  const context = await requireAdminActionAccess();
  if (!await isCeoActor(context.supabase, context.user)) throw new Error('CEO access required');
  if (!supabaseAdmin) throw new Error('ADMIN_DATA_ACCESS_UNAVAILABLE');
  const activation = await loadTeamAccess(supabaseAdmin, true);
  if (activation.status !== 'ready') throw new Error('TEAM_ACCESS_UNAVAILABLE');
  return { ...context, admin: supabaseAdmin };
}

export async function upsertTeamAccessGrantAction(formData: FormData) {
  const { user, admin, supabase } = await requireCeo();
  const email = normalizeEmail(formData.get('email'));
  const jobTitle = String(formData.get('jobTitle') || '').trim().slice(0, 120);
  const accessLevel = formData.get('accessLevel') === 'global_admin' ? 'global_admin' : 'scoped_staff';
  const countryScope = csvValues(formData.get('countryScope')).slice(0, 20);
  const permissions = accessLevel === 'global_admin' ? ['admin:full'] : selectedPermissions(formData);

  if (!email || !email.includes('@')) throw new Error('Valid email is required');
  if (!jobTitle) throw new Error('Job title is required');

  const { data: existingUsers, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw new Error('Team identity lookup is unavailable');
  const candidates = existingUsers.users.filter((candidate) => normalizeEmail(candidate.email) === email);
  if (candidates.length > 1) throw new Error('Team identity conflict. Review the existing employee access before trying again.');
  let authUser = candidates[0] ?? null;

  if (!authUser) {
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { invited_by: user.id, invited_job_title: jobTitle },
    });
    if (inviteError) throw new Error('Team invitation could not be completed');
    authUser = invited.user;
  }

  if (!authUser?.id) throw new Error('Authenticated team identity is required');
  if (normalizeEmail(authUser.email) !== email) throw new Error('Team identity conflict. Review the existing employee access before trying again.');
  if (isCeoUserId(authUser.id) && accessLevel !== 'global_admin') throw new Error('CEO access cannot be reduced');

  // Use the authenticated client: SQL derives the actor from auth.uid(), checks
  // the Auth identity again, and attaches/saves grant + profile atomically.
  const { error: grantError } = await supabase.rpc('save_team_access_grant', {
    p_user_id: authUser.id, p_email: email, p_job_title: jobTitle,
    p_access_level: accessLevel, p_country_scope: countryScope, p_permissions: permissions,
  });
  if (grantError) throw teamWriteError(grantError);

  revalidatePath('/admin/team');
}

export async function setTeamAccessStatusAction(formData: FormData) {
  const { supabase } = await requireCeo();
  const email = normalizeEmail(formData.get('email'));
  const status = formData.get('status') === 'active' ? 'active' : 'inactive';
  if (!email) throw new Error('Email is required');

  const { error } = await supabase.rpc('set_team_access_status', { p_email: email, p_status: status });
  if (error) throw teamWriteError(error);

  revalidatePath('/admin/team');
}
