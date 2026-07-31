'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdminActionAccess } from '@/lib/auth/admin';
import { applyVerificationDecision, approveVerification, createVerificationRequest, expireVerification, rejectVerification, renewVerification, uploadDocument, type VerificationDecision } from '@/lib/verification/verification-engine';

export async function createVerification(input: {
  requestType: string;
  ownerType: string;
  ownerId: string;
  notes?: string;
  score?: number;
  verificationLevel?: 'basic' | 'silver' | 'gold' | 'platinum';
}) {
  const { supabase } = await requireAdminActionAccess();
  return createVerificationRequest(supabase, input);
}

export async function approveVerificationRequest(verificationRequestId: string, reviewerId?: string, notes?: string) {
  const { supabase } = await requireAdminActionAccess();
  return approveVerification(supabase, verificationRequestId, reviewerId, notes);
}

export async function rejectVerificationRequest(verificationRequestId: string, reviewerId?: string, notes?: string) {
  const { supabase } = await requireAdminActionAccess();
  return rejectVerification(supabase, verificationRequestId, reviewerId, notes);
}

export async function uploadVerificationDocument(input: {
  verificationRequestId: string;
  documentType: string;
  ownerType: string;
  ownerId: string;
  fileUrl?: string;
  issueDate?: string;
  expiryDate?: string;
  reviewNotes?: string;
  verifiedBy?: string;
  verificationStatus?: 'Pending' | 'Under Review' | 'Approved' | 'Rejected' | 'Expired' | 'Suspended';
}) {
  const { supabase } = await requireAdminActionAccess();
  return uploadDocument(supabase, input);
}

export async function renewVerificationRequest(verificationRequestId: string, expiryDate?: string) {
  const { supabase } = await requireAdminActionAccess();
  return renewVerification(supabase, verificationRequestId, expiryDate);
}

export async function expireVerificationRequest(verificationRequestId: string) {
  const { supabase } = await requireAdminActionAccess();
  return expireVerification(supabase, verificationRequestId);
}

export async function getVerificationOverview() {
  const { supabase } = await requireAdminActionAccess();
  const [requestsRes, documentsRes, reviewsRes] = await Promise.all([
    supabase.from('verification_requests').select('*').order('created_at', { ascending: false }).limit(10),
    supabase.from('verification_documents').select('*').order('created_at', { ascending: false }).limit(10),
    supabase.from('verification_reviews').select('*').order('created_at', { ascending: false }).limit(10),
  ]);

  return {
    requests: requestsRes.data ?? [],
    documents: documentsRes.data ?? [],
    reviews: reviewsRes.data ?? [],
  };
}

const decisionResultMap: Record<VerificationDecision, string> = {
  approve: 'verification_approved',
  reject: 'verification_rejected',
  pending: 'verification_pending',
};

export async function submitVerificationDecisionAction(formData: FormData) {
  const verificationRequestId = formData.get('verificationRequestId')?.toString();
  const decision = formData.get('decision')?.toString() as VerificationDecision | undefined;
  const notes = formData.get('notes')?.toString() || undefined;
  const returnPath = formData.get('returnPath')?.toString() || '/admin/verification';

  if (!verificationRequestId || !decision || !decisionResultMap[decision]) {
    redirect(`${returnPath}?error=verification_invalid_decision`);
  }

  const { supabase, user } = await requireAdminActionAccess();
  const result = await applyVerificationDecision(supabase, verificationRequestId, decision, user.id, notes);

  revalidatePath('/admin/verification');
  revalidatePath('/admin/verification/customers');
  revalidatePath('/admin/verification/partners');
  revalidatePath('/my-documents');

  if (!result.success) {
    redirect(`${returnPath}?error=verification_decision_failed`);
  }

  redirect(`${returnPath}?result=${decisionResultMap[decision]}`);
}
