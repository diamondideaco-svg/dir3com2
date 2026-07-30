import type { SupabaseClient } from '@supabase/supabase-js';

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
    status: 'Pending',
    score,
    verification_level: verificationLevel,
    notes: input.notes,
  }).select().single();

  if (error) return { success: false, error: error.message };
  return { success: true, verificationRequest: data };
}

export async function approveVerification(supabase: SupabaseClient, verificationRequestId: string, reviewerId?: string, notes?: string) {
  const { data, error } = await supabase.from('verification_requests').update({ status: 'Approved', updated_at: new Date().toISOString() }).eq('id', verificationRequestId).select().single();
  if (error || !data) return { success: false, error: error?.message ?? 'Verification not found' };

  await supabase.from('verification_reviews').insert({ verification_request_id: verificationRequestId, reviewer_id: reviewerId, decision: 'Approved', notes });
  await supabase.from('verification_status_history').insert({ verification_request_id: verificationRequestId, status: 'Approved', changed_by: reviewerId, notes });
  return { success: true, verificationRequest: data };
}

export async function rejectVerification(supabase: SupabaseClient, verificationRequestId: string, reviewerId?: string, notes?: string) {
  const { data, error } = await supabase.from('verification_requests').update({ status: 'Rejected', updated_at: new Date().toISOString() }).eq('id', verificationRequestId).select().single();
  if (error || !data) return { success: false, error: error?.message ?? 'Verification not found' };

  await supabase.from('verification_reviews').insert({ verification_request_id: verificationRequestId, reviewer_id: reviewerId, decision: 'Rejected', notes });
  await supabase.from('verification_status_history').insert({ verification_request_id: verificationRequestId, status: 'Rejected', changed_by: reviewerId, notes });
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
    verification_status: input.verificationStatus ?? 'Pending',
    verified_by: input.verifiedBy,
    review_notes: input.reviewNotes,
  }).select().single();

  if (error) return { success: false, error: error.message };
  return { success: true, document: data };
}

export async function renewVerification(supabase: SupabaseClient, requestId: string, expiryDate?: string) {
  const { data, error } = await supabase.from('verification_requests').update({ status: 'Approved', updated_at: new Date().toISOString() }).eq('id', requestId).select().single();
  if (error || !data) return { success: false, error: error?.message ?? 'Verification not found' };
  if (expiryDate) await supabase.from('verification_requests').update({ updated_at: new Date().toISOString() }).eq('id', requestId);
  return { success: true, verificationRequest: data };
}

export async function expireVerification(supabase: SupabaseClient, requestId: string) {
  const { data, error } = await supabase.from('verification_requests').update({ status: 'Expired', updated_at: new Date().toISOString() }).eq('id', requestId).select().single();
  if (error || !data) return { success: false, error: error?.message ?? 'Verification not found' };
  return { success: true, verificationRequest: data };
}
