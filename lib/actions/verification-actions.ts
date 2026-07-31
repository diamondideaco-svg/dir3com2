'use server';

import { requireAdminActionAccess } from '@/lib/auth/admin';
import { approveVerification, createVerificationRequest, expireVerification, rejectVerification, renewVerification, uploadDocument } from '@/lib/verification/verification-engine';

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
