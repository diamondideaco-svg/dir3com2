import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseRequestClient, supabaseAdmin } from '@/lib/supabase/server';
import { logServerError } from '@/lib/security/safe-logger';
import { isPublicMarketplaceProduct } from '@/lib/marketplace/public-filters';

type RequestType = 'request_to_confirm' | 'request_quote';

export function requestTypeMatchesProduct(requestType: RequestType, product: Record<string, unknown>) {
  if (product.is_active !== true || product.deleted_at !== null) return false;
  if (!isPublicMarketplaceProduct({
    status: typeof product.status === 'string' ? product.status : null,
    synthetic: typeof product.synthetic === 'boolean' ? product.synthetic : null,
    marketplace_environment: typeof product.marketplace_environment === 'string' ? product.marketplace_environment : null,
    fulfilment_state: typeof product.fulfilment_state === 'string' ? product.fulfilment_state : null,
  })) return false;
  if (requestType === 'request_to_confirm') {
    return product.fulfilment_state === 'verified_requestable' && product.transaction_method === requestType;
  }
  return product.fulfilment_state === 'verified_quote' && product.transaction_method === requestType;
}

function validUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseBrief(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const allowed = ['dates', 'location', 'travellers', 'requirements', 'notes'] as const;
  const brief: Record<string, string | number> = {};
  for (const key of allowed) {
    const item = (value as Record<string, unknown>)[key];
    if (typeof item === 'string') brief[key] = item.trim().slice(0, 1000);
    if (typeof item === 'number' && Number.isFinite(item)) brief[key] = item;
  }
  return brief;
}

export async function GET(request: NextRequest) {
  const auth = await createSupabaseRequestClient(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await auth.supabase
    .from('marketplace_requests')
    .select('id, request_reference, product_id, request_type, status, requested_for, traveller_count, quote_amount, quote_currency, quote_expires_at, payment_status, created_at, updated_at')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    logServerError('api.marketplace.requests.read_failed', error);
    return NextResponse.json({ error: 'Unable to load requests.' }, { status: 500 });
  }
  return NextResponse.json({ requests: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await createSupabaseRequestClient(request);
  if (!auth) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!supabaseAdmin) return NextResponse.json({ error: 'Request service unavailable' }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const requestType = body.request_type;
  if (!validUuid(body.product_id) || (requestType !== 'request_to_confirm' && requestType !== 'request_quote')) {
    return NextResponse.json({ error: 'Invalid product or request type' }, { status: 400 });
  }

  const { data: product, error: productError } = await supabaseAdmin
    .from('products')
    .select('id, status, is_active, deleted_at, synthetic, marketplace_environment, fulfilment_state, transaction_method')
    .eq('id', body.product_id)
    .maybeSingle();

  if (productError) {
    logServerError('api.marketplace.requests.product_lookup_failed', productError);
    return NextResponse.json({ error: 'Unable to verify product' }, { status: 500 });
  }
  if (!product || !requestTypeMatchesProduct(requestType, product as Record<string, unknown>)) {
    return NextResponse.json({ error: 'Product is not eligible for this request path' }, { status: 409 });
  }

  const travellers = Number(body.traveller_count ?? 1);
  if (!Number.isInteger(travellers) || travellers < 1 || travellers > 99) {
    return NextResponse.json({ error: 'Invalid traveller count' }, { status: 400 });
  }

  const requestReference = `REQ-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const { data, error } = await supabaseAdmin.from('marketplace_requests').insert({
    request_reference: requestReference,
    user_id: auth.user.id,
    product_id: body.product_id,
    request_type: requestType,
    requested_for: typeof body.requested_for === 'string' ? body.requested_for : null,
    traveller_count: travellers,
    customer_brief: parseBrief(body.customer_brief),
    status: 'request_submitted',
  }).select('id, request_reference, request_type, status, payment_status, created_at').single();

  if (error) {
    logServerError('api.marketplace.requests.insert_failed', error);
    return NextResponse.json({ error: 'Unable to create request' }, { status: 500 });
  }
  return NextResponse.json({ request: data }, { status: 201 });
}
