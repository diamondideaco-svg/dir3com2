import { NextResponse } from 'next/server';
import { ensurePartnerRecord, requirePortalActor } from '@/lib/partner-portal/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { logServerError, logServerEvent } from '@/lib/security/safe-logger';
import { buildPrivateDocumentObjectPath, parsePrivateDocumentPath, sanitizeDownloadFilename, validateAndNormalizeDocumentFile } from '@/lib/security/document-validation';
import { isMissingStorageObject } from '@/lib/storage/errors';

const BUCKET = 'partner-documents';

function privateHeaders() {
  return {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  };
}

function safeDocumentType(value: unknown) {
  const normalized = String(value || '').trim().toLowerCase();
  const supported = new Set([
    'commercial_registration',
    'tax_card',
    'manager_id',
    'authorization_letter',
    'bank_letter',
    'license',
    'insurance',
    'vehicle_registration',
    'other',
  ]);

  return supported.has(normalized) ? normalized : 'other';
}

function safeDocumentId(value: unknown) {
  const normalized = String(value || '').trim();
  return /^[0-9a-f-]{36}$/i.test(normalized) ? normalized : null;
}

function isReadSchemaDrift(error: unknown) {
  const code = String((error as { code?: unknown })?.code || '').toUpperCase();
  return code.startsWith('PGRST') || code === '42P01' || code === '42703';
}

async function retryPendingCleanup(ownerId: string) {
  if (!supabaseAdmin) return;
  const { data: pending } = await supabaseAdmin.from('partner_storage_cleanup_queue').select('id, document_id, bucket, storage_path, attempts').eq('owner_id', ownerId).limit(10);
  for (const item of pending || []) {
    const { data: liveDocument } = await supabaseAdmin.from('partner_documents').select('id').eq('id', item.document_id).eq('partner_id', ownerId).maybeSingle();
    if (liveDocument) continue;
    const { error } = await supabaseAdmin.storage.from(item.bucket).remove([item.storage_path]);
    if (!error || isMissingStorageObject(error)) {
      await supabaseAdmin.from('partner_storage_cleanup_queue').delete().eq('id', item.id).eq('owner_id', ownerId);
    } else {
      await supabaseAdmin.from('partner_storage_cleanup_queue').update({ attempts: Number(item.attempts || 0) + 1 }).eq('id', item.id).eq('owner_id', ownerId);
    }
  }
}

export async function GET(request: Request) {
  const actor = await requirePortalActor();
  if (!actor) {
    return NextResponse.json({ error: { code: 'PORTAL_ACCESS_DENIED' } }, { status: 403, headers: privateHeaders() });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: { code: 'PORTAL_UNAVAILABLE' } }, { status: 503, headers: privateHeaders() });
  }

  try {
    await ensurePartnerRecord(actor);
    await retryPendingCleanup(actor.userId);

    const documentId = safeDocumentId(new URL(request.url).searchParams.get('documentId'));
    if (new URL(request.url).searchParams.has('documentId') && !documentId) {
      return NextResponse.json({ error: { code: 'DOCUMENT_ID_INVALID' } }, { status: 400, headers: privateHeaders() });
    }

    if (documentId) {
      const { data: document, error: documentError } = await supabaseAdmin
        .from('partner_documents')
        .select('id, partner_id, document_type, file_url')
        .eq('id', documentId)
        .eq('partner_id', actor.userId)
        .maybeSingle();
      if (documentError) throw documentError;
      if (!document) return NextResponse.json({ error: { code: 'DOCUMENT_NOT_FOUND' } }, { status: 404, headers: privateHeaders() });

      const parsedPath = parsePrivateDocumentPath(document.file_url);
      if (!parsedPath || parsedPath.ownerPrefix !== actor.userId.toLowerCase()) {
        return NextResponse.json({ error: { code: 'DOCUMENT_NOT_FOUND' } }, { status: 404, headers: privateHeaders() });
      }
      const filename = sanitizeDownloadFilename(document.document_type, parsedPath.extension);
      const { data: signed, error: signedError } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(document.file_url, 300, { download: filename });
      if (signedError && isMissingStorageObject(signedError)) {
        return NextResponse.json({ error: { code: 'DOCUMENT_OBJECT_NOT_FOUND' } }, { status: 404, headers: privateHeaders() });
      }
      if (signedError || !signed?.signedUrl) throw signedError || new Error('DOCUMENT_PREVIEW_FAILED');
      return new NextResponse(null, { status: 307, headers: { ...privateHeaders(), Location: signed.signedUrl } });
    }

    const { data, error } = await supabaseAdmin
      .from('partner_documents')
      .select('id, partner_id, document_type, status, verified, verified_at, created_at, updated_at')
      .eq('partner_id', actor.userId)
      .order('created_at', { ascending: false });

    if (error) {
      if (isReadSchemaDrift(error)) {
        return NextResponse.json({ data: [] }, { headers: privateHeaders() });
      }
      throw error;
    }

    return NextResponse.json({ data: data || [] }, { headers: privateHeaders() });
  } catch (error) {
    logServerError('api.partner_portal.documents.get_failed', error, {
      route: '/api/partner-portal/documents',
      actorId: actor.userId,
    });
    return NextResponse.json({ data: [] }, { headers: privateHeaders() });
  }
}

export async function POST(request: Request) {
  const actor = await requirePortalActor();
  if (!actor) {
    return NextResponse.json({ error: { code: 'PORTAL_ACCESS_DENIED' } }, { status: 403, headers: privateHeaders() });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: { code: 'PORTAL_UNAVAILABLE' } }, { status: 503, headers: privateHeaders() });
  }

  try {
    await ensurePartnerRecord(actor);

    const formData = (await request.formData()) as unknown as { get(name: string): FormDataEntryValue | null };
    const file = formData.get('file');
    const documentType = safeDocumentType(formData.get('documentType'));
    const replaceDocumentId = safeDocumentId(formData.get('replaceDocumentId'));

    let replacedDocument: { id: string; file_url: string } | null = null;
    if (replaceDocumentId) {
      const { data, error } = await supabaseAdmin.from('partner_documents').select('id, file_url').eq('id', replaceDocumentId).eq('partner_id', actor.userId).maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: { code: 'DOCUMENT_NOT_FOUND' } }, { status: 404, headers: privateHeaders() });
      replacedDocument = data;
    }

    const validated = await validateAndNormalizeDocumentFile(file);
    if (!validated.ok) {
      return NextResponse.json(
        { error: { code: validated.code, message: validated.message } },
        { status: 400, headers: privateHeaders() },
      );
    }

    const objectPath = buildPrivateDocumentObjectPath(actor.userId, validated.data.signature.extension);

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(objectPath, validated.data.bytes, {
        contentType: validated.data.signature.mimeType,
        upsert: false,
      });

    if (uploadError) {
      throw uploadError;
    }

    const mutation = replacedDocument
      ? supabaseAdmin.from('partner_documents').update({
          document_type: documentType,
          file_url: objectPath,
          status: 'pending',
          verified: false,
          verified_at: null,
          updated_at: new Date().toISOString(),
        }).eq('id', replacedDocument.id).eq('partner_id', actor.userId)
      : supabaseAdmin.from('partner_documents').insert({
        partner_id: actor.userId,
        document_type: documentType,
        file_url: objectPath,
        status: 'pending',
        verified: false,
      });
    const { data, error } = await mutation
      .select('id, partner_id, document_type, file_url, status, verified, verified_at, created_at')
      .single();

    if (error) {
      await supabaseAdmin.storage.from(BUCKET).remove([objectPath]);
      throw error;
    }

    if (replacedDocument) {
      const { error: cleanupError } = await supabaseAdmin.storage.from(BUCKET).remove([replacedDocument.file_url]);
      if (cleanupError && !isMissingStorageObject(cleanupError)) {
        logServerError('api.partner_portal.documents.replace_cleanup_failed', cleanupError, { actorId: actor.userId, documentId: replacedDocument.id });
      }
    }

    logServerEvent('api.partner_portal.documents.uploaded', {
      route: '/api/partner-portal/documents',
      actorId: actor.userId,
      documentType,
    });

    return NextResponse.json({ data }, { status: 201, headers: privateHeaders() });
  } catch (error) {
    logServerError('api.partner_portal.documents.upload_failed', error, {
      route: '/api/partner-portal/documents',
      actorId: actor.userId,
    });
    return NextResponse.json({ error: { code: 'PORTAL_DOCUMENT_UPLOAD_FAILED' } }, { status: 500, headers: privateHeaders() });
  }
}

export async function DELETE(request: Request) {
  const actor = await requirePortalActor();
  if (!actor) return NextResponse.json({ error: { code: 'PORTAL_ACCESS_DENIED' } }, { status: 403, headers: privateHeaders() });
  if (!supabaseAdmin) return NextResponse.json({ error: { code: 'PORTAL_UNAVAILABLE' } }, { status: 503, headers: privateHeaders() });

  const documentId = safeDocumentId(new URL(request.url).searchParams.get('documentId'));
  if (!documentId) return NextResponse.json({ error: { code: 'DOCUMENT_ID_INVALID' } }, { status: 400, headers: privateHeaders() });

  try {
    const { data: document, error } = await supabaseAdmin.from('partner_documents').select('id, file_url').eq('id', documentId).eq('partner_id', actor.userId).maybeSingle();
    if (error) throw error;
    if (!document) return NextResponse.json({ error: { code: 'DOCUMENT_NOT_FOUND' } }, { status: 404, headers: privateHeaders() });

    const { error: queueError } = await supabaseAdmin.from('partner_storage_cleanup_queue').upsert({ document_id: document.id, owner_id: actor.userId, bucket: BUCKET, storage_path: document.file_url }, { onConflict: 'bucket,storage_path' });
    if (queueError) throw queueError;
    const { error: rowError } = await supabaseAdmin.from('partner_documents').delete().eq('id', document.id).eq('partner_id', actor.userId);
    if (rowError) {
      await supabaseAdmin.from('partner_storage_cleanup_queue').delete().eq('document_id', document.id).eq('owner_id', actor.userId);
      throw rowError;
    }
    const { error: storageError } = await supabaseAdmin.storage.from(BUCKET).remove([document.file_url]);
    if (storageError && !isMissingStorageObject(storageError)) {
      logServerError('api.partner_portal.documents.delete_cleanup_failed', storageError, { actorId: actor.userId, documentId });
      return NextResponse.json({ data: { id: documentId, deleted: true, cleanupPending: true } }, { headers: privateHeaders() });
    }
    await supabaseAdmin.from('partner_storage_cleanup_queue').delete().eq('document_id', document.id).eq('owner_id', actor.userId);
    logServerEvent('api.partner_portal.documents.deleted', { actorId: actor.userId, documentId });
    return NextResponse.json({ data: { id: documentId, deleted: true } }, { headers: privateHeaders() });
  } catch (error) {
    logServerError('api.partner_portal.documents.delete_failed', error, { actorId: actor.userId, documentId });
    return NextResponse.json({ error: { code: 'PORTAL_DOCUMENT_DELETE_FAILED' } }, { status: 500, headers: privateHeaders() });
  }
}
