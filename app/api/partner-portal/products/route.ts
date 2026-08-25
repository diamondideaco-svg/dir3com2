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

function normalizeProductStatus(value: unknown) {
  const normalized = safeText(value, 30).toLowerCase();
  const partnerEditableStatuses = new Set(['draft', 'inactive']);
  return partnerEditableStatuses.has(normalized) ? normalized : 'draft';
}

function normalizeCurrency(value: unknown) {
  const normalized = safeText(value, 8).toUpperCase();
  return normalized || 'SAR';
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
      .select('id, city, available, product_id, products(id, name_ar, name_en, slug, city, base_price, currency, status, featured, verified, shield_certified, updated_at, product_images(id, product_id, image_url, caption, sort_order, created_at))')
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
    const currency = normalizeCurrency(payload.currency);
    const descriptionAr = safeText(payload.descriptionAr || payload.description, 1000);
    const descriptionEn = safeText(payload.descriptionEn || payload.description, 1000);
    const status = normalizeProductStatus(payload.status);

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

  const productId = safeText(payload.productId, 80);
  if (!productId) {
    return NextResponse.json({ error: { code: 'PRODUCT_ID_REQUIRED' } }, { status: 400, headers: privateHeaders() });
  }

  try {
    await ensurePartnerRecord(actor);

    const { data: ownedRows, error: ownershipError } = await supabaseAdmin
      .from('product_availability')
      .select('id, product_id, partner_id')
      .eq('product_id', productId)
      .eq('partner_id', actor.userId);

    if (ownershipError) {
      throw ownershipError;
    }

    if (!ownedRows || ownedRows.length === 0) {
      return NextResponse.json({ error: { code: 'PRODUCT_SCOPE_DENIED' } }, { status: 403, headers: privateHeaders() });
    }

    const nameAr = safeText(payload.nameAr || payload.serviceNameAr, 120);
    const nameEn = safeText(payload.nameEn || payload.serviceNameEn, 120) || nameAr;
    const city = safeText(payload.city, 80);
    const basePrice = Math.max(0, safeNumber(payload.basePrice ?? payload.price, 0));
    const currency = normalizeCurrency(payload.currency);
    const status = normalizeProductStatus(payload.status);

    if (!nameAr) {
      return NextResponse.json({ error: { code: 'PRODUCT_NAME_REQUIRED' } }, { status: 400, headers: privateHeaders() });
    }

    const { data: updatedProduct, error: productUpdateError } = await supabaseAdmin
      .from('products')
      .update({
        name_ar: nameAr,
        name_en: nameEn,
        city,
        base_price: basePrice,
        currency,
        status,
      })
      .eq('id', productId)
      .select('id, name_ar, name_en, slug, city, base_price, currency, status, featured, verified, shield_certified, updated_at')
      .single();

    if (productUpdateError || !updatedProduct) {
      throw productUpdateError || new Error('PRODUCT_UPDATE_FAILED');
    }

    if (city) {
      const { error: availabilityUpdateError } = await supabaseAdmin
        .from('product_availability')
        .update({ city })
        .eq('product_id', productId)
        .eq('partner_id', actor.userId);

      if (availabilityUpdateError) {
        throw availabilityUpdateError;
      }
    }

    const { data: availabilityRows, error: availabilityReadError } = await supabaseAdmin
      .from('product_availability')
      .select('id, city, available, product_id')
      .eq('product_id', productId)
      .eq('partner_id', actor.userId)
      .order('created_at', { ascending: false });

    if (availabilityReadError) {
      throw availabilityReadError;
    }

    logServerEvent('api.partner_portal.products.updated', {
      route: '/api/partner-portal/products',
      actorId: actor.userId,
      productId,
    });

    return NextResponse.json(
      {
        data: {
          availability: availabilityRows || [],
          product: updatedProduct,
        },
      },
      { headers: privateHeaders() },
    );
  } catch (error) {
    logServerError('api.partner_portal.products.update_failed', error, {
      route: '/api/partner-portal/products',
      actorId: actor.userId,
      productId,
    });
    return NextResponse.json({ error: { code: 'PORTAL_PRODUCT_UPDATE_FAILED' } }, { status: 500, headers: privateHeaders() });
  }
}
