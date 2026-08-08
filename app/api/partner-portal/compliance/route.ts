import { NextResponse } from 'next/server';
import { ensurePartnerRecord, requirePortalActor } from '@/lib/partner-portal/server';
import { createSupabaseServerClient, supabaseAdmin } from '@/lib/supabase/server';
import { logServerError } from '@/lib/security/safe-logger';

const REQUIRED_DOCS = [
  'commercial_registration',
  'manager_id',
  'authorization_letter',
  'license',
  'insurance',
] as const;

function privateHeaders() {
  return {
    'Cache-Control': 'private, no-store',
  };
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
    const supabase = await createSupabaseServerClient();
    await ensurePartnerRecord(actor);

    const { data: partnerDocs, error: docsError } = await supabase
      .from('partner_documents')
      .select('document_type, verified, verified_at, created_at')
      .eq('partner_id', actor.userId);

    if (docsError) {
      if (isReadSchemaDrift(docsError)) {
        return NextResponse.json(
          {
            data: {
              requiredDocuments: REQUIRED_DOCS,
              missingDocuments: REQUIRED_DOCS,
              expiredDocuments: [],
              pendingReviews: 0,
            },
          },
          { headers: privateHeaders() },
        );
      }
      throw docsError;
    }

    const { data: verificationDocs } = await supabaseAdmin
      .from('verification_documents')
      .select('document_type, verification_status, expiry_date')
      .eq('owner_type', 'partner')
      .eq('owner_id', actor.userId);

    const presentTypes = new Set((partnerDocs || []).map((doc) => String(doc.document_type || '').toLowerCase()));
    const missing = REQUIRED_DOCS.filter((docType) => !presentTypes.has(docType));

    const now = Date.now();
    const expired = (verificationDocs || [])
      .filter((doc) => Boolean(doc.expiry_date) && new Date(String(doc.expiry_date)).getTime() < now)
      .map((doc) => ({
        documentType: String(doc.document_type || ''),
        expiryDate: doc.expiry_date,
      }));

    const pendingReviews = (partnerDocs || []).filter((doc) => doc.verified !== true).length;

    return NextResponse.json(
      {
        data: {
          requiredDocuments: REQUIRED_DOCS,
          missingDocuments: missing,
          expiredDocuments: expired,
          pendingReviews,
        },
      },
      { headers: privateHeaders() },
    );
  } catch (error) {
    logServerError('api.partner_portal.compliance.read_failed', error, {
      route: '/api/partner-portal/compliance',
      actorId: actor.userId,
    });
    return NextResponse.json(
      {
        data: {
          requiredDocuments: REQUIRED_DOCS,
          missingDocuments: REQUIRED_DOCS,
          expiredDocuments: [],
          pendingReviews: 0,
        },
      },
      { headers: privateHeaders() },
    );
  }
}
