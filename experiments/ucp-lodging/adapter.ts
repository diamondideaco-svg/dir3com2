import { createHash } from 'node:crypto';
import type { StaySearchInput, StaySearchResult } from '../../lib/travel/contracts';

// Offline experiment only. Never imported by an application route or provider.
export const UCP_PIN = '1b4e7bbdb718828120cf5eb6b0dc336737f1a488';
export const UCP_CAPABILITY = 'dev.ucp.lodging.booking';
const digits: Record<string, number> = { USD: 2, SAR: 2, EGP: 2, EUR: 2, AED: 2, GBP: 2, JPY: 0, KWD: 3, BHD: 3, OMR: 3 };

function requireValue(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}
function identifier(value: string) {
  requireValue(typeof value === 'string' && value.trim().length > 0 && value.length <= 8192, 'INVALID_IDENTIFIER');
  return value;
}
function handle(kind: string, ...values: string[]) {
  // Internal example bindings, not Google Hotel Center IDs or live catalog IDs.
  return `poc_${kind}_${createHash('sha256').update(JSON.stringify(values)).digest('hex')}`;
}
export function toMinorUnits(amount: string, currency: string): number {
  requireValue(Object.hasOwn(digits, currency), 'UNSUPPORTED_CURRENCY');
  requireValue(typeof amount === 'string' && /^\d+(?:\.\d+)?$/.test(amount) && amount.length <= 32, 'INVALID_AMOUNT');
  const [whole, fraction = ''] = amount.split('.');
  const precision = digits[currency];
  requireValue(fraction.length <= precision, 'EXCESS_AMOUNT_PRECISION');
  const minor = BigInt(whole) * BigInt(10 ** precision) + BigInt(fraction.padEnd(precision, '0') || '0');
  requireValue(minor <= BigInt(Number.MAX_SAFE_INTEGER), 'AMOUNT_OVERFLOW');
  return Number(minor);
}
function date(value: string) {
  requireValue(/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value, 'INVALID_STAY_DATE');
}

export function projectStay(input: {
  search: StaySearchInput; result: StaySearchResult;
  hotelId: string; roomId: string; rateId: string;
}, today = new Date().toISOString().slice(0, 10)) {
  const { search, result } = input;
  requireValue(result.sandbox === true && result.status === 'ok', 'SANDBOX_RESULT_REQUIRED');
  identifier(result.provider);
  const hotels = result.hotels.filter(h => h.id === input.hotelId && h.provider === result.provider);
  requireValue(hotels.length === 1, 'HOTEL_NOT_UNIQUE');
  const hotel = hotels[0];
  const rooms = hotel.rooms.filter(r => r.id === input.roomId);
  requireValue(rooms.length === 1, 'ROOM_NOT_UNIQUE');
  const rates = rooms[0].rates.filter(r => r.id === input.rateId && r.provider === result.provider);
  requireValue(rates.length === 1, 'RATE_NOT_UNIQUE');
  const rate = rates[0];
  identifier(hotel.id); identifier(rooms[0].id); identifier(rate.id);
  requireValue(!rate.roomId || rate.roomId === rooms[0].id, 'ROOM_BINDING_MISMATCH');
  // Existing canonical rates do not identify per-unit rates for a multi-room bundle.
  requireValue(search.occupancies.length === 1, 'MULTI_ROOM_BINDING_UNPROVEN');
  date(today); date(search.checkIn); date(search.checkOut);
  requireValue(search.checkIn >= today && search.checkOut > search.checkIn, 'INVALID_STAY_RANGE');
  const occupancy = search.occupancies[0];
  const ages = occupancy.childAges ?? [];
  requireValue(Number.isSafeInteger(occupancy.adults) && occupancy.adults >= 1
    && Array.isArray(ages) && ages.every(a => Number.isSafeInteger(a) && a >= 0 && a <= 17)
    && occupancy.adults + ages.length <= 9, 'INVALID_OCCUPANCY');
  const source = rate.suggestedSellingAmount !== undefined ? 'suggestedSellingAmount'
    : rate.offerTotalAmount !== undefined ? 'offerTotalAmount' : 'totalAmount';
  const currency = source === 'suggestedSellingAmount' ? rate.suggestedSellingCurrency
    : source === 'offerTotalAmount' ? rate.offerCurrency : rate.currency;
  requireValue(currency && currency === search.currency, 'CURRENCY_MISMATCH');
  const amount = toMinorUnits(rate[source]!, currency);
  requireValue(typeof rate.refundable === 'boolean', 'INVALID_POLICY_SUMMARY');
  if (rate.cancellationDeadline !== undefined) {
    requireValue(/(?:Z|[+-]\d{2}:\d{2})$/.test(rate.cancellationDeadline)
      && Number.isFinite(Date.parse(rate.cancellationDeadline)), 'AMBIGUOUS_POLICY_DEADLINE');
  }
  const guests = Array.from({ length: occupancy.adults + ages.length }, (_, i) => ({ id: `gst_${i + 1}` }));
  const request = {
    property: { id: handle('property', result.provider, hotel.id) },
    stays: [{
      id: handle('stay', result.provider, hotel.id, rooms[0].id, rate.id, search.checkIn, search.checkOut, JSON.stringify(occupancy), currency),
      accommodation_type: { id: handle('room', result.provider, hotel.id, rooms[0].id) },
      rate_plan: { id: handle('rate', result.provider, hotel.id, rate.id) },
      stay_dates: { start_date: search.checkIn, end_date: search.checkOut },
      occupancy: { adults: occupancy.adults, children: ages.length, child_ages: [...ages], total: guests.length },
      // No guessed primary guest or legal identity. IDs are scoped to this proposed session.
      guest_assignments: guests.map(guest => ({ guest_id: guest.id })),
    }],
    guests,
  };
  return {
    mode: 'offline_contract_poc' as const, capability: UCP_CAPABILITY, sourceCommit: UCP_PIN,
    request,
    // Not UCP authoritative totals. Do not put these observations in a booking response.
    provisionalQuote: { amount, currency, source, authoritative: false as const },
    policyObservation: { refundableFlag: rate.refundable, deadline: rate.cancellationDeadline ?? null, authoritative: false as const },
    readiness: 'blocked' as const,
    gaps: [
      'GOOGLE_ONBOARDING_AND_US_ELIGIBILITY_UNCONFIRMED',
      'CATALOG_BINDING_REGISTRY_NOT_IMPLEMENTED',
      'SUPPLIER_COMMERCIAL_ENTITLEMENT_AND_REVALIDATION_REQUIRED',
      'AUTHORITATIVE_ALL_IN_TOTALS_AND_TAX_FEE_BREAKDOWN_MISSING',
      'BINDING_CANCELLATION_PENALTIES_AND_PAYMENT_TERMS_MISSING',
      'CONSENTED_BOOKER_AND_LEAD_GUEST_MISSING',
      'MERCHANT_OF_RECORD_AND_LEGAL_LINKS_UNCONFIRMED',
    ],
  };
}

export type StayProjection = ReturnType<typeof projectStay>;
export function describeCreateTransports(projection: StayProjection) {
  // Descriptors only: no URL origin, token, UCP version negotiation, I/O or live registration.
  return {
    executable: false as const,
    rest: { method: 'POST', path: '/booking-sessions', body: structuredClone(projection.request) },
    mcp: { name: 'create_booking_session', arguments: { booking: structuredClone(projection.request) } },
    missingProtocolSetup: ['AUTHENTICATION', 'UCP_PROFILE_AND_VERSION_NEGOTIATION', 'MCP_META'],
  };
}

export function requireCommercialOperation(operation: string): never {
  // Deliberately unconditional: no environment flag can activate this experiment.
  void operation;
  throw new Error('UCP_POC_TRANSACTION_DISABLED');
}
