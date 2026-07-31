import type { SupabaseClient } from '@supabase/supabase-js';
import { VERIFICATION_STATUSES, type CanonicalVerificationStatus } from '@/lib/verification/status';

export type VerificationStatus = 'Pending' | 'Under Review' | 'Approved' | 'Rejected' | 'Expired' | 'Suspended';
export type VerificationLevel = 'basic' | 'silver' | 'gold' | 'platinum';

export interface VerificationEntitySummary {
  verification_status: VerificationStatus;
  verification_score: number;
  verification_expiry?: string | null;
  verification_level: VerificationLevel;
}

export interface VerificationRequestInput {
  requestType: string;
  ownerType: string;
  ownerId: string;
  notes?: string;
  score?: number;
  verificationLevel?: VerificationLevel;
}

export interface DocumentInput {
  verificationRequestId: string;
  documentType: string;
  ownerType: string;
  ownerId: string;
  fileUrl?: string;
  issueDate?: string;
  expiryDate?: string;
  reviewNotes?: string;
  verifiedBy?: string;
  verificationStatus?: VerificationStatus;
}

async function synchronizeRequestDocumentsStatus(
  supabase: SupabaseClient,
  verificationRequestId: string,
  status: CanonicalVerificationStatus,
  reviewNotes?: string
) {
  await supabase
    .from('verification_documents')
    .update({
      verification_status: status,
      review_notes: reviewNotes,
    })
    .eq('verification_request_id', verificationRequestId);
}

export function getVerificationLevel(score: number): VerificationLevel {
  if (score >= 90) return 'platinum';
  if (score >= 70) return 'gold';
  if (score >= 40) return 'silver';
  return 'basic';
}

export async function createVerificationRequest(supabase: SupabaseClient, input: VerificationRequestInput) {
  const score = input.score ?? 0;
  const verificationLevel = input.verificationLevel ?? getVerificationLevel(score);

  const { data, error } = await supabase.from('verification_requests').insert({
    request_type: input.requestType,
    owner_type: input.ownerType,
    owner_id: input.ownerId,
    status: VERIFICATION_STATUSES.PENDING,
    score,
    verification_level: verificationLevel,
    notes: input.notes,
  }).select().single();

  if (error) return { success: false, error: error.message };
  return { success: true, verificationRequest: data };
}

export async function approveVerification(supabase: SupabaseClient, verificationRequestId: string, reviewerId?: string, notes?: string) {
  const { data, error } = await supabase
    .from('verification_requests')
    .update({ status: VERIFICATION_STATUSES.APPROVED, updated_at: new Date().toISOString() })
    .eq('id', verificationRequestId)
    .select()
    .single();
  if (error || !data) return { success: false, error: error?.message ?? 'Verification not found' };

  await supabase.from('verification_reviews').insert({ verification_request_id: verificationRequestId, reviewer_id: reviewerId, decision: VERIFICATION_STATUSES.APPROVED, notes });
  await supabase.from('verification_status_history').insert({ verification_request_id: verificationRequestId, status: VERIFICATION_STATUSES.APPROVED, changed_by: reviewerId, notes });
  await synchronizeRequestDocumentsStatus(supabase, verificationRequestId, VERIFICATION_STATUSES.APPROVED, notes);
  return { success: true, verificationRequest: data };
}

export async function rejectVerification(supabase: SupabaseClient, verificationRequestId: string, reviewerId?: string, notes?: string) {
  const { data, error } = await supabase
    .from('verification_requests')
    .update({ status: VERIFICATION_STATUSES.REJECTED, updated_at: new Date().toISOString() })
    .eq('id', verificationRequestId)
    .select()
    .single();
  if (error || !data) return { success: false, error: error?.message ?? 'Verification not found' };

  await supabase.from('verification_reviews').insert({ verification_request_id: verificationRequestId, reviewer_id: reviewerId, decision: VERIFICATION_STATUSES.REJECTED, notes });
  await supabase.from('verification_status_history').insert({ verification_request_id: verificationRequestId, status: VERIFICATION_STATUSES.REJECTED, changed_by: reviewerId, notes });
  await synchronizeRequestDocumentsStatus(supabase, verificationRequestId, VERIFICATION_STATUSES.REJECTED, notes);
  return { success: true, verificationRequest: data };
}

export async function uploadDocument(supabase: SupabaseClient, input: DocumentInput) {
  const { data, error } = await supabase.from('verification_documents').insert({
    verification_request_id: input.verificationRequestId,
    document_type: input.documentType,
    owner_type: input.ownerType,
    owner_id: input.ownerId,
    file_url: input.fileUrl,
    issue_date: input.issueDate,
    expiry_date: input.expiryDate,
    verification_status: input.verificationStatus ?? VERIFICATION_STATUSES.PENDING,
    verified_by: input.verifiedBy,
    review_notes: input.reviewNotes,
  }).select().single();

  if (error) return { success: false, error: error.message };
  return { success: true, document: data };
}

export async function renewVerification(supabase: SupabaseClient, requestId: string, expiryDate?: string) {
  const { data, error } = await supabase
    .from('verification_requests')
    .update({ status: VERIFICATION_STATUSES.APPROVED, updated_at: new Date().toISOString() })
    .eq('id', requestId)
    .select()
    .single();
  if (error || !data) return { success: false, error: error?.message ?? 'Verification not found' };
  if (expiryDate) await supabase.from('verification_requests').update({ updated_at: new Date().toISOString() }).eq('id', requestId);
  await synchronizeRequestDocumentsStatus(supabase, requestId, VERIFICATION_STATUSES.APPROVED);
  return { success: true, verificationRequest: data };
}

export async function expireVerification(supabase: SupabaseClient, requestId: string) {
  const { data, error } = await supabase
    .from('verification_requests')
    .update({ status: VERIFICATION_STATUSES.EXPIRED, updated_at: new Date().toISOString() })
    .eq('id', requestId)
    .select()
    .single();
  if (error || !data) return { success: false, error: error?.message ?? 'Verification not found' };
  await synchronizeRequestDocumentsStatus(supabase, requestId, VERIFICATION_STATUSES.EXPIRED);
  return { success: true, verificationRequest: data };
}
