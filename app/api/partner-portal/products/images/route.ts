import { NextResponse } from 'next/server';
import { requirePortalActor } from '@/lib/partner-portal/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { logServerError, logServerEvent } from '@/lib/security/safe-logger';
import { validateAndNormalizeImageFile } from '@/lib/security/document-validation';

const BUCKET = 'partner-media';

function privateHeaders() {
  return {
    'Cache-Control': 'private, no-store',
  };
}

function safeProductId(value: unknown) {
  const normalized = String(value || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(normalized)) {
    return null;
  }
  return normalized;
}

function buildPath(actorId: string, productId: string, extension: string) {
  const safeActor = actorId.toLowerCase().replace(/[^a-z0-9-]/g, '');
  const safeProduct = productId.toLowerCase().replace(/[^a-z0-9-]/g, '');
  return `${safeActor}/${safeProduct}/${crypto.randomUUID()}.${extension}`;
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
    const formData = (await request.formData()) as unknown as { get(name: string): FormDataEntryValue | null };
    const file = formData.get('file');
    const productId = safeProductId(formData.get('productId'));
    const caption = String(formData.get('caption') || '').trim().slice(0, 200);

    if (!productId) {
      return NextResponse.json({ error: { code: 'PRODUCT_ID_INVALID' } }, { status: 400, headers: privateHeaders() });
    }

    const { data: ownedProduct, error: ownershipError } = await supabaseAdmin
      .from('product_availability')
      .select('id')
      .eq('product_id', productId)
      .eq('partner_id', actor.userId)
      .maybeSingle();

    if (ownershipError) {
      throw ownershipError;
    }

    if (!ownedProduct?.id) {
      return NextResponse.json({ error: { code: 'PRODUCT_ACCESS_DENIED' } }, { status: 403, headers: privateHeaders() });
    }

    const validated = await validateAndNormalizeImageFile(file);
    if (!validated.ok) {
      return NextResponse.json(
        { error: { code: validated.code, message: validated.message } },
        { status: 400, headers: privateHeaders() },
      );
    }

    const path = buildPath(actor.userId, productId, validated.data.signature.extension);

    const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(path, validated.data.bytes, {
      contentType: validated.data.signature.mimeType,
      upsert: false,
    });

    if (uploadError) {
      throw uploadError;
    }

    const { data, error } = await supabaseAdmin
      .from('product_images')
      .insert({
        product_id: productId,
        image_url: path,
        caption: caption || null,
      })
      .select('id, product_id, image_url, caption, sort_order, created_at')
      .single();

    if (error) {
      await supabaseAdmin.storage.from(BUCKET).remove([path]);
      throw error;
    }

    logServerEvent('api.partner_portal.products.image_uploaded', {
      route: '/api/partner-portal/products/images',
      actorId: actor.userId,
      productId,
    });

    return NextResponse.json({ data }, { status: 201, headers: privateHeaders() });
  } catch (error) {
    logServerError('api.partner_portal.products.image_upload_failed', error, {
      route: '/api/partner-portal/products/images',
      actorId: actor.userId,
    });
    return NextResponse.json({ error: { code: 'PRODUCT_IMAGE_UPLOAD_FAILED' } }, { status: 500, headers: privateHeaders() });
  }
}
