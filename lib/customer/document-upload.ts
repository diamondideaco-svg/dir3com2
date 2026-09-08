import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { validateAndNormalizeDocumentFile, parsePrivateDocumentPath } from '@/lib/security/document-validation';

export const CUSTOMER_DOCUMENT_BUCKET = 'customer-documents';
export const CUSTOMER_DOCUMENT_LIMIT = 4 * 1024 * 1024;
export const customerDocumentTypes = ['passport','visa','id_card','driving_license','insurance','other'] as const;
export const documentIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const documentListColumns = 'id, document_type, verification_status, issue_date, expiry_date, created_at, storage_bucket';
export type CustomerDocument = { id: string; document_type: string; verification_status: string; issue_date: string | null; expiry_date: string | null; created_at: string; storage_bucket: string | null };
export class DocumentFailure extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
export async function readCustomerUploadForm(request: Request) {
  const type = request.headers.get('content-type') || '';
  if (!type.startsWith('multipart/form-data;') || !request.body) throw new DocumentFailure('DOCUMENT_INVALID_FILE');
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done,value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > CUSTOMER_DOCUMENT_LIMIT + 65536) {
        await reader.cancel();
        throw new DocumentFailure('DOCUMENT_TOO_LARGE',413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0; for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
    return await new Response(bytes,{headers:{'content-type':type}}).formData();
  } catch (error) { if (error instanceof DocumentFailure) throw error; throw new DocumentFailure('DOCUMENT_INVALID_FILE'); }
  finally { reader.releaseLock(); }
}
export async function customerDocumentActor(db: SupabaseClient) {
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user || user.is_anonymous) throw new DocumentFailure('CUSTOMER_AUTH_REQUIRED', 401);
  const { data: profile, error: profileError } = await db.from('profiles').select('id, role, status, deleted_at').eq('id', user.id).maybeSingle();
  if (profileError) throw new DocumentFailure('DOCUMENT_READ_FAILED', 503);
  if (!profile || profile.id !== user.id || profile.role !== 'customer' || profile.status !== 'active' || profile.deleted_at) throw new DocumentFailure('CUSTOMER_ACCESS_DENIED', 403);
  return user.id;
}
function dateField(value: FormDataEntryValue | null) {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) throw new DocumentFailure('DOCUMENT_METADATA_INVALID');
  return value;
}
export async function validateCustomerUpload(form: FormData) {
  const allowed = new Set(['file','documentType','issueDate','expiryDate','uploadId']);
  for (const key of form.keys()) if (!allowed.has(key) || form.getAll(key).length !== 1) throw new DocumentFailure('DOCUMENT_METADATA_INVALID');
  const id = form.get('uploadId');
  const type = form.get('documentType');
  if (typeof id !== 'string' || !documentIdPattern.test(id) || !customerDocumentTypes.includes(type as typeof customerDocumentTypes[number])) throw new DocumentFailure('DOCUMENT_METADATA_INVALID');
  const issue = dateField(form.get('issueDate')), expiry = dateField(form.get('expiryDate'));
  if (issue && expiry && expiry < issue) throw new DocumentFailure('DOCUMENT_METADATA_INVALID');
  const file = form.get('file');
  if (!(file instanceof File)) throw new DocumentFailure('DOCUMENT_INVALID_FILE');
  if (file.size > CUSTOMER_DOCUMENT_LIMIT) throw new DocumentFailure('DOCUMENT_TOO_LARGE', 413);
  if (/[\/\\\x00-\x1f]/.test(file.name)) throw new DocumentFailure('DOCUMENT_INVALID_FILE');
  const validated = await validateAndNormalizeDocumentFile(file);
  if (!validated.ok) throw new DocumentFailure(validated.code);
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension !== validated.data.signature.extension) throw new DocumentFailure('DOCUMENT_MIME_MISMATCH');
  // No active PDF content in this upload surface; this is not an antivirus claim.
  if (extension === 'pdf' && /\/(?:JavaScript|JS|Launch|EmbeddedFile|RichMedia|OpenAction|AA)\b/i.test(new TextDecoder('latin1').decode(validated.data.bytes))) throw new DocumentFailure('DOCUMENT_FORBIDDEN_CONTENT');
  const digest = createHash('sha256').update(validated.data.bytes).update(JSON.stringify([type,issue,expiry])).digest('hex');
  return { id: id.toLowerCase(), type: String(type), issue, expiry, digest, ...validated.data };
}
export async function listCustomerDocuments(db: SupabaseClient, actor: string) {
  const { data, error } = await db.from('verification_documents').select(documentListColumns).eq('owner_type','customer').eq('owner_id',actor).order('created_at',{ascending:false});
  if (error) throw new DocumentFailure('DOCUMENT_READ_FAILED',503);
  return (data || []) as CustomerDocument[];
}
export async function ownedCustomerDocument(db: SupabaseClient, actor: string, id: string) {
  if (!documentIdPattern.test(id)) throw new DocumentFailure('DOCUMENT_NOT_FOUND',404);
  const { data, error } = await db.from('verification_documents').select(documentListColumns + ', file_url, upload_sha256').eq('owner_type','customer').eq('owner_id',actor).eq('id',id).maybeSingle();
  if (error) throw new DocumentFailure('DOCUMENT_READ_FAILED',503);
  return data as unknown as (CustomerDocument & { file_url: string | null; upload_sha256: string | null }) | null;
}
export function safeCustomerDocumentPath(actor: string, record: { id: string; file_url: unknown; storage_bucket: unknown }) {
  const path = parsePrivateDocumentPath(record.file_url);
  if (record.storage_bucket !== CUSTOMER_DOCUMENT_BUCKET || !path || path.ownerPrefix !== actor.toLowerCase() || record.file_url !== actor.toLowerCase() + '/' + record.id.toLowerCase() + '.' + path.extension) throw new DocumentFailure('DOCUMENT_NOT_FOUND',404);
  return { path: String(record.file_url), extension: path.extension };
}
export async function persistCustomerDocument(db: SupabaseClient, storageWriter: SupabaseClient, actor: string, upload: Awaited<ReturnType<typeof validateCustomerUpload>>) {
  const existing = await ownedCustomerDocument(db,actor,upload.id);
  if (existing) {
    if (existing.upload_sha256 !== upload.digest) throw new DocumentFailure('DOCUMENT_UPLOAD_CONFLICT',409);
    safeCustomerDocumentPath(actor,existing);
    return { id:existing.id, replay:true };
  }
  const path = actor.toLowerCase() + '/' + upload.id + '.' + upload.signature.extension;
  const bucket = storageWriter.storage.from(CUSTOMER_DOCUMENT_BUCKET);
  const { error: storageError } = await bucket.upload(path,upload.bytes,{contentType:upload.signature.mimeType,upsert:false});
  if (storageError) {
    // Another concurrent request may have committed; never overwrite its object.
    const committed = await ownedCustomerDocument(db,actor,upload.id);
    if (committed && committed.upload_sha256 === upload.digest) return { id:committed.id,replay:true };
    throw new DocumentFailure('DOCUMENT_UPLOAD_RETRY',409);
  }
  const { data, error } = await db.from('verification_documents').insert({
    id:upload.id, document_type:upload.type, owner_type:'customer', owner_id:actor,
    file_url:path, storage_bucket:CUSTOMER_DOCUMENT_BUCKET, upload_sha256:upload.digest,
    issue_date:upload.issue, expiry_date:upload.expiry, verification_status:'Pending',
  }).select('id').single();
  if (!error && data) return { id:data.id,replay:false };
  // An uncertain DB response is not proof of rollback. Re-read before cleanup.
  const committed = await ownedCustomerDocument(db,actor,upload.id);
  if (committed?.upload_sha256 === upload.digest) return { id:committed.id,replay:true };
  if (!committed) {
    const { error: cleanupError } = await bucket.remove([path]);
    if (cleanupError) throw new DocumentFailure('DOCUMENT_CLEANUP_PENDING',503);
  }
  throw new DocumentFailure('DOCUMENT_PERSIST_FAILED',503);
}
