import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseRequestClient, supabaseAdmin } from '@/lib/supabase/server';
import { logServerError } from '@/lib/security/safe-logger';
import { requestTypeMatchesProduct } from '@/lib/marketplace/request-gate';
import { listCustomerMarketplaceRequests } from '@/lib/marketplace/customer-requests';
import { parseMarketplaceRequestInputs } from '@/lib/marketplace/request-input';

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

  const { requests, error } = await listCustomerMarketplaceRequests(auth.supabase, auth.user.id);

  if (error) {
    logServerError('api.marketplace.requests.read_failed', error);
    return NextResponse.json({ error: 'Unable to load requests.' }, { status: 500 });
  }
  return NextResponse.json({ requests });
}

export async function POST(request: NextRequest) {
  const auth = await createSupabaseRequestClient(request);
  if (!auth) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!supabaseAdmin) return NextResponse.json({ error: 'Request service unavailable' }, { status: 503 });

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const body = rawBody as Record<string, unknown>;

  const requestType = body.request_type;
  if (!validUuid(body.product_id) || (requestType !== 'request_to_confirm' && requestType !== 'request_quote')) {
    return NextResponse.json({ error: 'Invalid product or request type' }, { status: 400 });
  }

  const parsedInputs = parseMarketplaceRequestInputs(body);
  if (!parsedInputs.ok) {
    return NextResponse.json({ error: parsedInputs.error }, { status: 400 });
  }

  const { data: product, error: productError } = await supabaseAdmin
    .from('products')
    .select('id, name_ar, name_en, status, deleted_at, synthetic, marketplace_environment, marketplace_family, fulfilment_state, transaction_method, supplier_name')
    .eq('id', body.product_id)
    .maybeSingle();

  if (productError) {
    logServerError('api.marketplace.requests.product_lookup_failed', productError);
    return NextResponse.json({ error: 'Unable to verify product' }, { status: 500 });
  }
  if (!product || !requestTypeMatchesProduct(requestType, product as Record<string, unknown>)) {
    return NextResponse.json({ error: 'Product is not eligible for this request path' }, { status: 409 });
  }

  const requestReference = `REQ-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const { data, error } = await supabaseAdmin.from('marketplace_requests').insert({
    request_reference: requestReference,
    user_id: auth.user.id,
    product_id: body.product_id,
    request_type: requestType,
    requested_for: parsedInputs.requestedFor,
    traveller_count: parsedInputs.travellers,
    customer_brief: parseBrief(body.customer_brief),
    status: 'request_submitted',
    marketplace_family: product.marketplace_family,
    supplier_name: product.supplier_name,
    service_name: product.name_ar || product.name_en,
    fulfilment_method: requestType,
    transaction_method: product.transaction_method,
    next_action: 'operations_review',
  }).select('id, request_reference, request_type, status, payment_status, marketplace_family, supplier_name, service_name, fulfilment_method, transaction_method, handoff_type, created_at').single();

  if (error) {
    logServerError('api.marketplace.requests.insert_failed', error);
    return NextResponse.json({ error: 'Unable to create request' }, { status: 500 });
  }
  return NextResponse.json({ request: data }, { status: 201 });
}
