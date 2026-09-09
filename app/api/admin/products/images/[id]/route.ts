import { NextResponse } from 'next/server';
import { requireScopedAdminActionAccess, scopeCountryQuery } from '@/lib/auth/admin';
import { logServerError } from '@/lib/security/safe-logger';
import { isMissingStorageObject } from '@/lib/storage/errors';

const BUCKET = 'partner-media';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase: supabaseAdmin, scope } = await requireScopedAdminActionAccess('products:read');

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: { code: 'IMAGE_ID_REQUIRED' } }, { status: 400 });

    const { data: product, error } = await scopeCountryQuery(supabaseAdmin
      .from('products')
      .select('id, country, product_images!inner(id, image_url)')
      .is('deleted_at', null)
      .eq('product_images.id', id), scope)
      .maybeSingle();

    if (error) throw error;
    const image = product?.product_images?.find(image => image.id === id);
    if (!image) return NextResponse.json({ error: { code: 'IMAGE_NOT_FOUND' } }, { status: 404 });

    const { data: signed, error: signedError } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(image.image_url, 300);
    if (signedError && isMissingStorageObject(signedError)) {
      return NextResponse.json({ error: { code: 'IMAGE_OBJECT_NOT_FOUND' } }, { status: 404 });
    }
    if (signedError || !signed?.signedUrl) throw signedError || new Error('ADMIN_IMAGE_PREVIEW_FAILED');

    return new NextResponse(null, {
      status: 307,
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        Location: signed.signedUrl,
      },
    });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: { code: 'ADMIN_ACCESS_DENIED' } }, { status: 403 });
    }
    logServerError('api.admin.products.image_preview_failed', error);
    return NextResponse.json({ error: { code: 'ADMIN_IMAGE_PREVIEW_FAILED' } }, { status: 500 });
  }
}
