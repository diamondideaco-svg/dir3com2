import { NextRequest, NextResponse } from 'next/server';
import { normalizeRole } from '@/lib/auth/identity';
import { isCeoActor } from '@/lib/auth/team-access';
import {
  DABRA_ACTION_RULES,
  DABRA_FAMILY_PERSONAS,
  evaluateDabraAction,
  normalizeDabraActionRequest,
  resolveDabraFamilyRole,
  type DabraPlatformRole,
  type TrustedDabraActor,
  type TrustedDabraResource,
} from '@/lib/dabra/family-contract';
import { isCanonicalMarketplaceFamily, type MarketplaceTruth } from '@/lib/marketplace/truth';
import { ProviderCheckoutError, resolveProviderCheckout } from '@/lib/marketplace/provider-checkout';
import { consumeProviderRequestBudget } from '@/lib/marketplace/provider-search-protection';
import { createSupabaseRequestClient, supabaseAdmin } from '@/lib/supabase/server';
import { logServerError } from '@/lib/security/safe-logger';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveTrustedActor(request: NextRequest): Promise<{
  actor: TrustedDabraActor;
  auth: Awaited<ReturnType<typeof createSupabaseRequestClient>>;
}> {
  const auth = await createSupabaseRequestClient(request);
  if (!auth) {
    return {
      actor: { authenticated: false, userId: null, tenantId: null, platformRole: 'anonymous', rawRole: null },
      auth: null,
    };
  }

  const [{ data: profile, error }, executive] = await Promise.all([
    auth.supabase
      .from('profiles')
      .select('role')
      .eq('id', auth.user.id)
      .maybeSingle(),
    isCeoActor(auth.supabase, auth.user),
  ]);
  if (error) logServerError('api.dabra.family.profile_read_failed', error);
  const rawRole = typeof profile?.role === 'string' ? profile.role : null;
  const platformRole = (normalizeRole(rawRole) ?? 'anonymous') as DabraPlatformRole;
  return {
    actor: {
      authenticated: true,
      userId: auth.user.id,
      tenantId: auth.user.id,
      platformRole,
      rawRole,
      executive,
    },
    auth,
  };
}

function normalizeTruth(product: Record<string, unknown>): MarketplaceTruth | null {
  const family = product.marketplace_family;
  const fulfilmentState = product.fulfilment_state;
  const transactionMethod = product.transaction_method;
  const environment = product.marketplace_environment;
  const supplyType = product.supply_type;
  if (!isCanonicalMarketplaceFamily(family)) return null;
  if (!['catalog_only', 'verified_requestable', 'verified_quote', 'live_bookable', 'unavailable', 'availability_unknown', 'external_provider', 'test_sandbox'].includes(String(fulfilmentState))) return null;
  if (!['none', 'instant_booking', 'provider_checkout', 'request_to_confirm', 'request_quote'].includes(String(transactionMethod))) return null;
  if (!['production', 'sandbox', 'test', 'synthetic', 'fallback'].includes(String(environment))) return null;
  if (!['verified_local_partner', 'global_travel_partner', 'dir3com_managed', 'unknown'].includes(String(supplyType))) return null;
  if (product.status !== 'published' || product.deleted_at !== null || product.synthetic !== false) return null;
  return {
    family,
    fulfilmentState: fulfilmentState as MarketplaceTruth['fulfilmentState'],
    transactionMethod: transactionMethod as MarketplaceTruth['transactionMethod'],
    environment: environment as MarketplaceTruth['environment'],
    supplyType: supplyType as MarketplaceTruth['supplyType'],
    supplierVerified: product.supplier_verified === true,
  };
}

async function resolveTrustedResource(
  input: NonNullable<ReturnType<typeof normalizeDabraActionRequest>>,
  actor: TrustedDabraActor,
  auth: Awaited<ReturnType<typeof createSupabaseRequestClient>>,
): Promise<TrustedDabraResource | null> {
  if (input.resourceType === 'customer_context' || input.resourceType === 'trip_plan') {
    return actor.userId ? { kind: input.resourceType, ownerId: actor.userId, tenantId: actor.tenantId ?? undefined } : null;
  }
  if (input.resourceType === 'partner_workspace') {
    return actor.userId ? { kind: 'partner_workspace', ownerId: actor.userId, tenantId: actor.tenantId ?? undefined } : null;
  }
  if (input.resourceType === 'admin_workspace' || input.resourceType === 'executive_workspace') {
    return { kind: input.resourceType };
  }
  if (input.resourceType === 'provider_offer') {
    if (!actor.userId || input.provider !== 'ticketmaster' || !input.providerItemId) return null;
    if (!consumeProviderRequestBudget(`dabra-provider-checkout:${actor.userId}`)) return null;
    try {
      await resolveProviderCheckout({ provider: input.provider, providerItemId: input.providerItemId });
    } catch (error) {
      if (!(error instanceof ProviderCheckoutError)) {
        logServerError('api.dabra.family.provider_checkout_verification_failed', error);
      }
      return null;
    }
    return {
      kind: 'provider_offer',
      id: input.providerItemId,
      ownerId: actor.userId,
      tenantId: actor.tenantId ?? undefined,
      truth: {
        family: 'concierge',
        fulfilmentState: 'external_provider',
        transactionMethod: 'provider_checkout',
        environment: 'production',
        supplyType: 'global_travel_partner',
        supplierVerified: false,
      },
      verifiedActions: ['open_provider_checkout'],
    };
  }
  if (input.resourceType === 'public_marketplace') {
    if (!actor.userId || !input.resourceId || !UUID.test(input.resourceId) || !supabaseAdmin) return null;
    const { data, error } = await supabaseAdmin
      .from('products')
      .select('id, status, deleted_at, synthetic, marketplace_family, marketplace_environment, fulfilment_state, transaction_method, supply_type, supplier_verified')
      .eq('id', input.resourceId)
      .maybeSingle();
    if (error) {
      logServerError('api.dabra.family.product_read_failed', error);
      return null;
    }
    const truth = data ? normalizeTruth(data as Record<string, unknown>) : null;
    return truth ? { kind: 'public_marketplace', id: input.resourceId, ownerId: actor.userId, tenantId: actor.tenantId ?? undefined, truth } : null;
  }
  if ((input.resourceType === 'booking' || input.resourceType === 'marketplace_request') && auth && actor.userId && input.resourceId && UUID.test(input.resourceId)) {
    const table = input.resourceType === 'booking' ? 'bookings' : 'marketplace_requests';
    const { data, error } = await auth.supabase
      .from(table)
      .select('id, user_id')
      .eq('id', input.resourceId)
      .eq('user_id', actor.userId)
      .maybeSingle();
    if (error) {
      logServerError('api.dabra.family.owned_resource_read_failed', error);
      return null;
    }
    return data ? {
      kind: input.resourceType,
      id: data.id,
      ownerId: actor.userId,
      tenantId: actor.tenantId ?? undefined,
      // Ownership alone is not evidence that payment, cancellation, refund, or
      // supplier mutation is currently valid. Canonical lifecycle handlers must
      // add trusted, action-specific evidence before DABRA can hand off.
      verifiedActions: [],
    } : null;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const { actor } = await resolveTrustedActor(request);
  return NextResponse.json({
    optional: true,
    activeRole: resolveDabraFamilyRole(actor),
    authenticated: actor.authenticated,
    canonicalRole: actor.platformRole,
    identityModel: 'capability_persona',
    personas: DABRA_FAMILY_PERSONAS,
    actionClasses: [...new Set(Object.values(DABRA_ACTION_RULES).map((rule) => rule.actionClass))],
    autonomousTransactions: false,
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try { body = await request.json(); } catch { body = null; }
  const input = normalizeDabraActionRequest(body);
  if (!input) return NextResponse.json({ error: 'Invalid DABRA action request.' }, { status: 400 });

  const { actor, auth } = await resolveTrustedActor(request);
  const resource = await resolveTrustedResource(input, actor, auth);
  const decision = evaluateDabraAction({ actor, action: input.action, resource: resource ?? undefined, humanApproval: input.humanApproval, language: input.language });
  const status = decision.reason === 'AUTHENTICATION_REQUIRED'
    ? 401
    : decision.reason === 'ROLE_NOT_ALLOWED' || decision.reason === 'RESOURCE_OWNERSHIP_MISMATCH'
      ? 403
      : decision.reason === 'RESOURCE_TYPE_MISMATCH'
        ? 400
        : decision.reason === 'MARKETPLACE_TRUTH_BLOCKED'
        ? 409
        : 200;
  return NextResponse.json({ decision }, { status, headers: { 'Cache-Control': 'private, no-store' } });
}
