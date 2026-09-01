'use server';

import { requireAdminActionAccess, requireAdminReadAccess } from '@/lib/auth/admin';

async function rejectUnsafeVerificationMutation() {
  await requireAdminActionAccess();
  throw new Error('ADMIN_VERIFICATION_MUTATION_UNAVAILABLE');
}

export async function createVerification(input: {
  requestType: string;
  ownerType: string;
  ownerId: string;
  notes?: string;
  score?: number;
  verificationLevel?: 'basic' | 'silver' | 'gold' | 'platinum';
}) {
  void input;
  return rejectUnsafeVerificationMutation();
}

export async function approveVerificationRequest(verificationRequestId: string, reviewerId?: string, notes?: string) {
  void verificationRequestId;
  void reviewerId;
  void notes;
  return rejectUnsafeVerificationMutation();
}

export async function rejectVerificationRequest(verificationRequestId: string, reviewerId?: string, notes?: string) {
  void verificationRequestId;
  void reviewerId;
  void notes;
  return rejectUnsafeVerificationMutation();
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
  void input;
  return rejectUnsafeVerificationMutation();
}

export async function renewVerificationRequest(verificationRequestId: string, expiryDate?: string) {
  void verificationRequestId;
  void expiryDate;
  return rejectUnsafeVerificationMutation();
}

export async function expireVerificationRequest(verificationRequestId: string) {
  void verificationRequestId;
  return rejectUnsafeVerificationMutation();
}

export async function getVerificationOverview() {
  const { supabase } = await requireAdminReadAccess();
  const [requestsRes, documentsRes, reviewsRes] = await Promise.all([
    supabase.from('verification_requests').select('*').order('created_at', { ascending: false }).limit(10),
    supabase.from('verification_documents').select('*').order('created_at', { ascending: false }).limit(10),
    supabase.from('verification_reviews').select('*').order('created_at', { ascending: false }).limit(10),
  ]);

  if (requestsRes.error || documentsRes.error || reviewsRes.error) {
    throw new Error('ADMIN_VERIFICATION_READ_FAILED');
  }

  return {
    requests: requestsRes.data ?? [],
    documents: documentsRes.data ?? [],
    reviews: reviewsRes.data ?? [],
  };
}

export async function submitVerificationDecisionAction(formData: FormData) {
  void formData;
  return rejectUnsafeVerificationMutation();
}
