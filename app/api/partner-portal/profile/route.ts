import { NextResponse } from 'next/server';
import { ensurePartnerRecord, requirePortalActor } from '@/lib/partner-portal/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { logServerError, logServerEvent } from '@/lib/security/safe-logger';

function privateHeaders() {
  return {
    'Cache-Control': 'private, no-store',
  };
}

function safeText(value: unknown, max = 180) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function mapReviewStatusToPartnerStatus(reviewStatus: string) {
  const normalized = reviewStatus.trim().toLowerCase();
  if (normalized === 'submitted') return 'under_review';
  if (normalized === 'needs_changes') return 'rejected';
  if (normalized === 'approved') return 'approved';
  if (normalized === 'suspended') return 'suspended';
  return 'pending';
}

function mapPartnerStatusToReviewStatus(partnerStatus: string | null | undefined) {
  const normalized = String(partnerStatus || '').trim().toLowerCase();
  if (normalized === 'under_review') return 'Submitted';
  if (normalized === 'approved' || normalized === 'active') return 'Approved';
  if (normalized === 'rejected') return 'Needs Changes';
  if (normalized === 'suspended' || normalized === 'archived') return 'Suspended';
  return 'Draft';
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
    const partner = await ensurePartnerRecord(actor);
    const { data: partnerDetails } = await supabaseAdmin
      .from('partners')
      .select('id, company_name, contact_person, email, phone, country, city, commercial_registration, tax_number, iban, status, shield_level, updated_at')
      .eq('id', actor.userId)
      .maybeSingle();

    const result = {
      actor: {
        id: actor.userId,
        role: actor.authRole,
        fullName: actor.fullName,
      },
      partner: {
        ...(partnerDetails || partner),
        reviewStatus: mapPartnerStatusToReviewStatus(partnerDetails?.status),
      },
    };

    return NextResponse.json({ data: result }, { headers: privateHeaders() });
  } catch (error) {
    logServerError('api.partner_portal.profile.get_failed', error, {
      route: '/api/partner-portal/profile',
      actorId: actor.userId,
    });
    return NextResponse.json({ error: { code: 'PORTAL_PROFILE_READ_FAILED' } }, { status: 500, headers: privateHeaders() });
  }
}

export async function PUT(request: Request) {
  const actor = await requirePortalActor();
  if (!actor) {
    return NextResponse.json({ error: { code: 'PORTAL_ACCESS_DENIED' } }, { status: 403, headers: privateHeaders() });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: { code: 'PORTAL_UNAVAILABLE' } }, { status: 503, headers: privateHeaders() });
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  try {
    await ensurePartnerRecord(actor);

    const reviewStatus = safeText(payload.reviewStatus, 40);
    const updatePayload = {
      company_name: safeText(payload.legalName || payload.companyName, 140),
      contact_person: safeText(payload.contactPerson, 140),
      email: safeText(payload.email, 140) || actor.email,
      phone: safeText(payload.phone, 50),
      country: safeText(payload.country, 80),
      city: safeText(payload.city, 80),
      commercial_registration: safeText(payload.commercialRegistration, 120),
      tax_number: safeText(payload.taxNumber, 120),
      iban: safeText(payload.iban, 100),
      status: mapReviewStatusToPartnerStatus(reviewStatus),
    };

    const { data, error } = await supabaseAdmin
      .from('partners')
      .update(updatePayload)
      .eq('id', actor.userId)
      .select('id, company_name, contact_person, email, phone, country, city, commercial_registration, tax_number, iban, status, shield_level, updated_at')
      .single();

    if (error) {
      throw error;
    }

    logServerEvent('api.partner_portal.profile.updated', {
      route: '/api/partner-portal/profile',
      actorId: actor.userId,
      role: actor.authRole,
      status: data.status,
    });

    return NextResponse.json(
      {
        data: {
          ...data,
          reviewStatus: mapPartnerStatusToReviewStatus(data.status),
        },
      },
      { headers: privateHeaders() },
    );
  } catch (error) {
    logServerError('api.partner_portal.profile.update_failed', error, {
      route: '/api/partner-portal/profile',
      actorId: actor.userId,
    });
    return NextResponse.json({ error: { code: 'PORTAL_PROFILE_UPDATE_FAILED' } }, { status: 500, headers: privateHeaders() });
  }
}
