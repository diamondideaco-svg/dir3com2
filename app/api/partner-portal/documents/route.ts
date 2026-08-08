import { NextResponse } from 'next/server';
import { ensurePartnerRecord, requirePortalActor } from '@/lib/partner-portal/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { logServerError, logServerEvent } from '@/lib/security/safe-logger';
import { validateAndNormalizeDocumentFile } from '@/lib/security/document-validation';

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

function buildPath(actorId: string, extension: string) {
  return `${actorId.toLowerCase().replace(/[^a-z0-9-]/g, '')}/${crypto.randomUUID()}.${extension}`;
}

function isReadSchemaDrift(error: unknown) {
  const code = String((error as { code?: unknown })?.code || '').toUpperCase();
  return code.startsWith('PGRST') || code === '42P01' || code === '42703';
}

export async function GET() {
  const actor = await requirePortalActor();
  if (!actor) {
    return NextResponse.json({ error: { code: 'PORTAL_ACCESS_DENIED' } }, { status: 403, headers: privateHeaders() });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: { code: 'PORTAL_UNAVAILABLE' } }, { status: 503, headers: privateHeaders() });
  }

  try {
    await ensurePartnerRecord(actor);

    const { data, error } = await supabaseAdmin
      .from('partner_documents')
      .select('id, partner_id, document_type, file_url, verified, verified_at, created_at')
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

    const validated = await validateAndNormalizeDocumentFile(file);
    if (!validated.ok) {
      return NextResponse.json(
        { error: { code: validated.code, message: validated.message } },
        { status: 400, headers: privateHeaders() },
      );
    }

    const objectPath = buildPath(actor.userId, validated.data.signature.extension);

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(objectPath, validated.data.bytes, {
        contentType: validated.data.signature.mimeType,
        upsert: false,
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data, error } = await supabaseAdmin
      .from('partner_documents')
      .insert({
        partner_id: actor.userId,
        document_type: documentType,
        file_url: objectPath,
        status: 'pending',
        verified: false,
      })
      .select('id, partner_id, document_type, file_url, status, verified, verified_at, created_at')
      .single();

    if (error) {
      await supabaseAdmin.storage.from(BUCKET).remove([objectPath]);
      throw error;
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
