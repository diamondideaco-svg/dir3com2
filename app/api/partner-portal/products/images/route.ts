import { NextResponse } from 'next/server';
import { requirePortalActor } from '@/lib/partner-portal/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { logServerError, logServerEvent } from '@/lib/security/safe-logger';
import { validateAndNormalizeDocumentFile } from '@/lib/security/document-validation';
import { isMissingStorageObject } from '@/lib/storage/errors';
import { uploadStorageObjectWithRecovery } from '@/lib/storage/resilient-upload';

const BUCKET = 'partner-media';

function isBucketMissingError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { message?: unknown; error?: unknown };
  const message = typeof candidate.message === 'string' ? candidate.message : '';
  const nested = typeof candidate.error === 'string' ? candidate.error : '';
  const text = `${message} ${nested}`.toLowerCase();
  return text.includes('bucket') && (text.includes('not found') || text.includes('does not exist'));
}

async function uploadWithBucketRecovery(input: { path: string; bytes: Uint8Array; contentType: string }) {
  if (!supabaseAdmin) {
    return { ok: false as const, code: 'PORTAL_UNAVAILABLE' as const, details: null };
  }

  const bucket = supabaseAdmin.storage.from(BUCKET);
  const objectExists = async (path: string) => {
    const lastSlash = path.lastIndexOf('/');
    const folder = lastSlash === -1 ? '' : path.slice(0, lastSlash);
    const filename = lastSlash === -1 ? path : path.slice(lastSlash + 1);
    const { data, error } = await bucket.list(folder, { limit: 2, search: filename });
    return {
      exists: !error && Boolean(data?.some((item) => item.name === filename)),
      error,
    };
  };
  const upload = () => bucket.upload(input.path, input.bytes, {
    contentType: input.contentType,
    upsert: false,
  });

  const first = await uploadStorageObjectWithRecovery({
    path: input.path,
    upload,
    objectExists,
  });

  if (first.ok) {
    return { ok: true as const, attempts: first.attempts, recoveredExistingObject: first.recoveredExistingObject };
  }

  if (!isBucketMissingError(first.error)) {
    return { ok: false as const, code: 'MEDIA_UPLOAD_FAILED' as const, details: first.error };
  }

  const create = await supabaseAdmin.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'],
  });

  if (create.error && !String(create.error.message || '').toLowerCase().includes('already exists')) {
    return { ok: false as const, code: 'MEDIA_STORAGE_BUCKET_CREATE_FAILED' as const, details: create.error };
  }

  const second = await uploadStorageObjectWithRecovery({
    path: input.path,
    upload,
    objectExists,
  });

  if (!second.ok) {
    return { ok: false as const, code: 'MEDIA_UPLOAD_FAILED' as const, details: second.error };
  }

  return { ok: true as const, attempts: second.attempts, recoveredExistingObject: second.recoveredExistingObject };
}

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

function safeImageId(value: unknown) {
  const normalized = String(value || '').trim();
  return /^[0-9a-f-]{36}$/i.test(normalized) ? normalized : null;
}

async function getOwnedImage(imageId: string, actorId: string) {
  if (!supabaseAdmin) return { image: null, error: new Error('PORTAL_UNAVAILABLE') };

  const { data: image, error } = await supabaseAdmin
    .from('product_images')
    .select('id, product_id, image_url')
    .eq('id', imageId)
    .maybeSingle();
  if (error || !image) return { image: null, error: error || new Error('IMAGE_NOT_FOUND') };

  const { data: ownership, error: ownershipError } = await supabaseAdmin
    .from('product_availability')
    .select('id')
    .eq('product_id', image.product_id)
    .eq('partner_id', actorId)
    .maybeSingle();
  if (ownershipError || !ownership) return { image: null, error: ownershipError || new Error('PRODUCT_ACCESS_DENIED') };

  return { image, error: null };
}

type OwnedImage = { id: string; product_id: string; image_url: string };

async function retryPendingImageCleanup(ownerId: string) {
  if (!supabaseAdmin) return;
  const { data: pending } = await supabaseAdmin
    .from('partner_image_cleanup_queue')
    .select('id, bucket, storage_path, attempts')
    .eq('owner_id', ownerId)
    .limit(10);

  for (const item of pending || []) {
    const { error } = await supabaseAdmin.storage.from(item.bucket).remove([item.storage_path]);
    if (!error || isMissingStorageObject(error)) {
      await supabaseAdmin.from('partner_image_cleanup_queue').delete().eq('id', item.id).eq('owner_id', ownerId);
    } else {
      await supabaseAdmin
        .from('partner_image_cleanup_queue')
        .update({ attempts: Number(item.attempts || 0) + 1 })
        .eq('id', item.id)
        .eq('owner_id', ownerId);
    }
  }
}

async function deleteImageDurably(ownerId: string, image: OwnedImage) {
  if (!supabaseAdmin) throw new Error('PORTAL_UNAVAILABLE');

  const { error: queueError } = await supabaseAdmin.from('partner_image_cleanup_queue').upsert({
    owner_id: ownerId,
    product_image_id: image.id,
    bucket: BUCKET,
    storage_path: image.image_url,
  }, { onConflict: 'bucket,storage_path' });
  if (queueError) throw queueError;

  const { error: rowError } = await supabaseAdmin
    .from('product_images')
    .delete()
    .eq('id', image.id)
    .eq('product_id', image.product_id);
  if (rowError) {
    await supabaseAdmin
      .from('partner_image_cleanup_queue')
      .delete()
      .eq('product_image_id', image.id)
      .eq('owner_id', ownerId);
    throw rowError;
  }

  const { error: storageError } = await supabaseAdmin.storage.from(BUCKET).remove([image.image_url]);
  if (!storageError || isMissingStorageObject(storageError)) {
    await supabaseAdmin
      .from('partner_image_cleanup_queue')
      .delete()
      .eq('product_image_id', image.id)
      .eq('owner_id', ownerId);
    return { cleanupPending: false };
  }

  logServerError('api.partner_portal.products.image_cleanup_deferred', storageError, {
    route: '/api/partner-portal/products/images',
    actorId: ownerId,
    productId: image.product_id,
  });
  return { cleanupPending: true };
}

export async function GET(request: Request) {
  const actor = await requirePortalActor();
  if (!actor || !supabaseAdmin) {
    return NextResponse.json({ error: { code: 'PORTAL_ACCESS_DENIED' } }, { status: 403, headers: privateHeaders() });
  }

  const imageId = String(new URL(request.url).searchParams.get('imageId') || '').trim();
  if (!imageId) {
    return NextResponse.json({ error: { code: 'IMAGE_ID_REQUIRED' } }, { status: 400, headers: privateHeaders() });
  }

  try {
    await retryPendingImageCleanup(actor.userId);
    const { data: image, error: imageError } = await supabaseAdmin
      .from('product_images')
      .select('id, product_id, image_url')
      .eq('id', imageId)
      .maybeSingle();

    if (imageError) throw imageError;
    if (!image) return NextResponse.json({ error: { code: 'IMAGE_NOT_FOUND' } }, { status: 404, headers: privateHeaders() });

    const { data: ownership, error: ownershipError } = await supabaseAdmin
      .from('product_availability')
      .select('id')
      .eq('product_id', image.product_id)
      .eq('partner_id', actor.userId)
      .maybeSingle();

    if (ownershipError) throw ownershipError;
    if (!ownership) return NextResponse.json({ error: { code: 'PRODUCT_ACCESS_DENIED' } }, { status: 403, headers: privateHeaders() });

    const { data: signed, error: signedError } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(image.image_url, 300);
    if (signedError || !signed?.signedUrl) throw signedError || new Error('IMAGE_PREVIEW_FAILED');

    return new NextResponse(null, { status: 307, headers: { ...privateHeaders(), Location: signed.signedUrl } });
  } catch (error) {
    if (isMissingStorageObject(error)) {
      return NextResponse.json({ error: { code: 'IMAGE_OBJECT_NOT_FOUND' } }, { status: 404, headers: privateHeaders() });
    }
    logServerError('api.partner_portal.products.image_preview_failed', error, { route: '/api/partner-portal/products/images', actorId: actor.userId });
    return NextResponse.json({ error: { code: 'PRODUCT_IMAGE_PREVIEW_FAILED' } }, { status: 500, headers: privateHeaders() });
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
    await retryPendingImageCleanup(actor.userId);
    const formData = (await request.formData()) as unknown as { get(name: string): FormDataEntryValue | null };
    const file = formData.get('file');
    const productId = safeProductId(formData.get('productId'));
    const replaceImageId = safeImageId(formData.get('replaceImageId'));
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

    let oldImage: { id: string; product_id: string; image_url: string } | null = null;
    if (replaceImageId) {
      const owned = await getOwnedImage(replaceImageId, actor.userId);
      if (owned.error || !owned.image || owned.image.product_id !== productId) {
        return NextResponse.json({ error: { code: 'IMAGE_ACCESS_DENIED' } }, { status: 403, headers: privateHeaders() });
      }
      oldImage = owned.image;
    }

    const validated = await validateAndNormalizeDocumentFile(file);
    if (!validated.ok) {
      return NextResponse.json(
        { error: { code: validated.code, message: validated.message } },
        { status: 400, headers: privateHeaders() },
      );
    }

    const path = buildPath(actor.userId, productId, validated.data.signature.extension);

    const upload = await uploadWithBucketRecovery({
      path,
      bytes: validated.data.bytes,
      contentType: validated.data.signature.mimeType,
    });

    if (!upload.ok) {
      logServerError('api.partner_portal.products.image_upload_failed', upload.details, {
        route: '/api/partner-portal/products/images',
        actorId: actor.userId,
        productId,
        storagePath: path,
        code: upload.code,
      });
      return NextResponse.json({ error: { code: upload.code } }, { status: 500, headers: privateHeaders() });
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

    if (oldImage) {
      const cleanup = await deleteImageDurably(actor.userId, oldImage);
      if (cleanup.cleanupPending) {
        return NextResponse.json({ data, warning: { code: 'OLD_IMAGE_CLEANUP_PENDING' } }, { status: 201, headers: privateHeaders() });
      }
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

export async function DELETE(request: Request) {
  const actor = await requirePortalActor();
  if (!actor) return NextResponse.json({ error: { code: 'PORTAL_ACCESS_DENIED' } }, { status: 403, headers: privateHeaders() });
  if (!supabaseAdmin) return NextResponse.json({ error: { code: 'PORTAL_UNAVAILABLE' } }, { status: 503, headers: privateHeaders() });

  const imageId = safeImageId(new URL(request.url).searchParams.get('imageId'));
  if (!imageId) return NextResponse.json({ error: { code: 'IMAGE_ID_INVALID' } }, { status: 400, headers: privateHeaders() });

  try {
    await retryPendingImageCleanup(actor.userId);
    const owned = await getOwnedImage(imageId, actor.userId);
    if (owned.error || !owned.image) {
      const status = owned.error?.message === 'IMAGE_NOT_FOUND' ? 404 : 403;
      return NextResponse.json({ error: { code: owned.error?.message || 'IMAGE_ACCESS_DENIED' } }, { status, headers: privateHeaders() });
    }

    const cleanup = await deleteImageDurably(actor.userId, owned.image);

    logServerEvent('api.partner_portal.products.image_deleted', { route: '/api/partner-portal/products/images', actorId: actor.userId, productId: owned.image.product_id });
    return NextResponse.json({
      data: { id: owned.image.id, deleted: true },
      ...(cleanup.cleanupPending ? { warning: { code: 'IMAGE_CLEANUP_PENDING' } } : {}),
    }, { headers: privateHeaders() });
  } catch (error) {
    logServerError('api.partner_portal.products.image_delete_failed', error, { route: '/api/partner-portal/products/images', actorId: actor.userId });
    return NextResponse.json({ error: { code: 'PRODUCT_IMAGE_DELETE_FAILED' } }, { status: 500, headers: privateHeaders() });
  }
}
