'use server';

import { requireAdminActionAccess } from '@/lib/auth/admin';

async function rejectUnsafeAssignmentMutation(formData: FormData) {
  await requireAdminActionAccess();
  void formData;
  throw new Error('ADMIN_ASSIGNMENT_MUTATION_UNAVAILABLE');
}

export async function confirmBookingAction(formData: FormData) {
  return rejectUnsafeAssignmentMutation(formData);
}

export async function assignPartnerAction(formData: FormData) {
  return rejectUnsafeAssignmentMutation(formData);
}

export async function reassignPartnerAction(formData: FormData) {
  return rejectUnsafeAssignmentMutation(formData);
}

export async function rejectAssignmentAction(formData: FormData) {
  return rejectUnsafeAssignmentMutation(formData);
}

export async function approveAssignmentAction(formData: FormData) {
  return rejectUnsafeAssignmentMutation(formData);
}

export async function forceAssignmentAction(formData: FormData) {
  return rejectUnsafeAssignmentMutation(formData);
}

export async function recalculateScoreAction(formData: FormData) {
  return rejectUnsafeAssignmentMutation(formData);
}
