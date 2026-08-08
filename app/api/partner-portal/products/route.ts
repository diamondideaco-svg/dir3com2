import { NextResponse } from 'next/server';
import { ensurePartnerRecord, requirePortalActor } from '@/lib/partner-portal/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { logServerError, logServerEvent } from '@/lib/security/safe-logger';

function privateHeaders() {
  return {
    'Cache-Control': 'private, no-store',
  };
}

function safeText(value: unknown, max = 160) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function safeNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function toSlug(seed: string) {
  const normalized = seed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
  return normalized || `product-${crypto.randomUUID().slice(0, 8)}`;
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
      .from('product_availability')
      .select('id, city, available, product_id, products(id, name_ar, name_en, slug, city, base_price, currency, status, featured, verified, shield_certified, updated_at)')
      .eq('partner_id', actor.userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({ data: data || [] }, { headers: privateHeaders() });
  } catch (error) {
    logServerError('api.partner_portal.products.get_failed', error, {
      route: '/api/partner-portal/products',
      actorId: actor.userId,
    });
    return NextResponse.json({ error: { code: 'PORTAL_PRODUCTS_READ_FAILED' } }, { status: 500, headers: privateHeaders() });
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

  let payload: Record<string, unknown> = {};
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  try {
    await ensurePartnerRecord(actor);

    const nameAr = safeText(payload.nameAr || payload.serviceNameAr, 120);
    const nameEn = safeText(payload.nameEn || payload.serviceNameEn, 120) || nameAr;
    const city = safeText(payload.city, 80);
    const price = Math.max(0, safeNumber(payload.basePrice ?? payload.price, 0));
    const currency = safeText(payload.currency, 8) || 'SAR';
    const descriptionAr = safeText(payload.descriptionAr || payload.description, 1000);
    const descriptionEn = safeText(payload.descriptionEn || payload.description, 1000);
    const status = safeText(payload.status, 30) || 'draft';

    if (!nameAr) {
      return NextResponse.json({ error: { code: 'PRODUCT_NAME_REQUIRED' } }, { status: 400, headers: privateHeaders() });
    }

    const { data: insertedProduct, error: productError } = await supabaseAdmin
      .from('products')
      .insert({
        name_ar: nameAr,
        name_en: nameEn,
        slug: toSlug(`${nameEn}-${Date.now()}`),
        city,
        base_price: price,
        currency,
        description_ar: descriptionAr || null,
        description_en: descriptionEn || null,
        status,
      })
      .select('id, name_ar, name_en, slug, city, base_price, currency, status, verified, shield_certified, updated_at')
      .single();

    if (productError || !insertedProduct) {
      throw productError || new Error('PRODUCT_CREATE_FAILED');
    }

    const { data: availability, error: availabilityError } = await supabaseAdmin
      .from('product_availability')
      .insert({
        product_id: insertedProduct.id,
        city: city || 'all',
        partner_id: actor.userId,
        available: true,
      })
      .select('id, city, available, product_id')
      .single();

    if (availabilityError) {
      throw availabilityError;
    }

    logServerEvent('api.partner_portal.products.created', {
      route: '/api/partner-portal/products',
      actorId: actor.userId,
      productId: insertedProduct.id,
    });

    return NextResponse.json({ data: { availability, product: insertedProduct } }, { status: 201, headers: privateHeaders() });
  } catch (error) {
    logServerError('api.partner_portal.products.create_failed', error, {
      route: '/api/partner-portal/products',
      actorId: actor.userId,
    });
    return NextResponse.json({ error: { code: 'PORTAL_PRODUCT_CREATE_FAILED' } }, { status: 500, headers: privateHeaders() });
  }
}
