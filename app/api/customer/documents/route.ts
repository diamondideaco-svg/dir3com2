import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRequestClient, supabaseAdmin } from '@/lib/supabase/server';
import { CUSTOMER_DOCUMENT_BUCKET, CUSTOMER_DOCUMENT_LIMIT, customerDocumentActor, DocumentFailure, listCustomerDocuments, ownedCustomerDocument, persistCustomerDocument, readCustomerUploadForm, safeCustomerDocumentPath, validateCustomerUpload } from '@/lib/customer/document-upload';
import { sanitizeDownloadFilename } from '@/lib/security/document-validation';
const headers = { 'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer' };
function failure(error: unknown) {
  const known = error instanceof DocumentFailure ? error : new DocumentFailure('DOCUMENT_REQUEST_FAILED',503);
  // Safe category only: never log bytes, names, signed URLs, tokens or internals.
  if (known.status >= 500) console.error('[customer-documents]',known.code);
  return NextResponse.json({error:{code:known.code}},{status:known.status,headers});
}
async function context(request: NextRequest) {
  const authenticated = await createSupabaseRequestClient(request);
  if (!authenticated) throw new DocumentFailure('CUSTOMER_AUTH_REQUIRED',401);
  const actor = await customerDocumentActor(authenticated.supabase);
  return { db:authenticated.supabase,actor };
}
export async function GET(request: NextRequest) {
  try {
    const { db,actor } = await context(request);
    const id = request.nextUrl.searchParams.get('documentId');
    if (!id) return NextResponse.json({data:await listCustomerDocuments(db,actor)},{headers});
    const document = await ownedCustomerDocument(db,actor,id);
    if (!document) throw new DocumentFailure('DOCUMENT_NOT_FOUND',404);
    const object = safeCustomerDocumentPath(actor,document);
    const download = request.nextUrl.searchParams.get('download') === '1';
    const { data,error } = await db.storage.from(CUSTOMER_DOCUMENT_BUCKET).createSignedUrl(object.path,60,
      download ? {download:sanitizeDownloadFilename(document.document_type,object.extension)} : undefined);
    if (error || !data?.signedUrl) throw new DocumentFailure('DOCUMENT_VIEW_FAILED',404);
    return new NextResponse(null,{status:303,headers:{...headers,Location:data.signedUrl}});
  } catch(error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get('origin');
    // Browser mutations must be same-origin; non-browser Core API clients use bearer auth.
    if ((origin && origin !== request.nextUrl.origin) || (!origin && !request.headers.get('authorization')?.startsWith('Bearer '))) throw new DocumentFailure('DOCUMENT_ORIGIN_DENIED',403);
    const { db,actor } = await context(request);
    if (!supabaseAdmin) throw new DocumentFailure('DOCUMENT_REQUEST_FAILED',503);
    const length = Number(request.headers.get('content-length'));
    if (length > CUSTOMER_DOCUMENT_LIMIT + 65536) throw new DocumentFailure('DOCUMENT_TOO_LARGE',413);
    if (!request.headers.get('content-type')?.startsWith('multipart/form-data;')) throw new DocumentFailure('DOCUMENT_INVALID_FILE');
    const form = await readCustomerUploadForm(request);
    const upload = await validateCustomerUpload(form);
    const result = await persistCustomerDocument(db,supabaseAdmin,actor,upload);
    return NextResponse.json({data:result},{status:result.replay ? 200 : 201,headers});
  } catch(error) { return failure(error); }
}
