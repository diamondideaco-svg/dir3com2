'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { approveVerification, createVerificationRequest, expireVerification, rejectVerification, renewVerification, uploadDocument } from '@/lib/verification/verification-engine';

export async function createVerification(input: {
  requestType: string;
  ownerType: string;
  ownerId: string;
  notes?: string;
  score?: number;
  verificationLevel?: 'basic' | 'silver' | 'gold' | 'platinum';
}) {
  const supabase = await createSupabaseServerClient();
  return createVerificationRequest(supabase, input);
}

export async function approveVerificationRequest(verificationRequestId: string, reviewerId?: string, notes?: string) {
  const supabase = await createSupabaseServerClient();
  return approveVerification(supabase, verificationRequestId, reviewerId, notes);
}

export async function rejectVerificationRequest(verificationRequestId: string, reviewerId?: string, notes?: string) {
  const supabase = await createSupabaseServerClient();
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
  const supabase = await createSupabaseServerClient();
  return uploadDocument(supabase, input);
}

export async function renewVerificationRequest(verificationRequestId: string, expiryDate?: string) {
  const supabase = await createSupabaseServerClient();
  return renewVerification(supabase, verificationRequestId, expiryDate);
}

export async function expireVerificationRequest(verificationRequestId: string) {
  const supabase = await createSupabaseServerClient();
  return expireVerification(supabase, verificationRequestId);
}

export async function getVerificationOverview() {
  const supabase = await createSupabaseServerClient();
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
