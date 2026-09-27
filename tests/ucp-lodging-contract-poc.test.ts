import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { projectStay, describeCreateTransports, requireCommercialOperation, toMinorUnits } from '../experiments/ucp-lodging/adapter';
import type { StaySearchInput, StaySearchResult } from '../lib/travel/contracts';

// Synthetic, isolated contract fixture. Never a provider response or public inventory.
function fixture() {
  const search: StaySearchInput = { checkIn: '2027-01-12', checkOut: '2027-01-14', currency: 'USD', guestNationality: 'EG', occupancies: [{ adults: 2, childAges: [7] }] };
  const result: StaySearchResult = { provider: 'liteapi', sandbox: true, status: 'ok', hotels: [{ id: 'fixture-hotel', provider: 'liteapi', rooms: [{ id: 'fixture-room', name: 'Synthetic room', rates: [{ id: 'opaque-fixture-rate', provider: 'liteapi', roomId: 'fixture-room', roomName: 'Synthetic room', currency: 'USD', totalAmount: '123.45', refundable: true, cancellationDeadline: '2027-01-10T18:00:00+02:00' }] }] }] };
  return { search, result, hotelId: 'fixture-hotel', roomId: 'fixture-room', rateId: 'opaque-fixture-rate' };
}
const run = (f = fixture()) => projectStay(f, '2026-09-27');

test('maps canonical property/stay/room/rate/date/occupancy without claiming a reservation', () => {
  const p = run();
  assert.equal(p.request.stays[0].occupancy.total, 3);
  assert.deepEqual(p.request.stays[0].occupancy.child_ages, [7]);
  assert.deepEqual(p.request.stays[0].stay_dates, { start_date: '2027-01-12', end_date: '2027-01-14' });
  assert.equal(p.provisionalQuote.amount, 12345);
  assert.equal(p.provisionalQuote.authoritative, false);
  assert.equal(p.readiness, 'blocked');
  assert.equal('status' in p.request, false);
  assert.equal('totals' in p.request, false);
  assert.equal('confirmation' in p, false);
  assert.equal(p.gaps.length, 7);
});
test('opaque supplier payloads and guest PII never appear in the projection', () => {
  const f = fixture();
  f.rateId = f.result.hotels[0].rooms[0].rates[0].id = 'opaque payload containing private supplier metadata';
  Object.assign(f.result.hotels[0], { apiKey: 'PRIVATE_SENTINEL', customerEmail: 'private@example.invalid' });
  const p = run(f);
  assert.doesNotMatch(JSON.stringify(p), /PRIVATE_SENTINEL|private@example|private supplier metadata/);
  assert.deepEqual(p.request.guests, [{ id: 'gst_1' }, { id: 'gst_2' }, { id: 'gst_3' }]);
  assert.ok(p.request.stays[0].guest_assignments.every(a => p.request.guests.some(g => g.id === a.guest_id)));
});
test('money conversion is exact and honors zero and three decimal currencies', () => {
  assert.equal(toMinorUnits('0.29', 'USD'), 29);
  assert.equal(toMinorUnits('100', 'JPY'), 100);
  assert.equal(toMinorUnits('1.234', 'KWD'), 1234);
  for (const [amount, currency] of [['1.234', 'USD'], ['1.1', 'JPY'], ['-1', 'USD'], ['1e3', 'USD'], ['NaN', 'USD'], ['1', 'XYZ'], ['9007199254740992', 'USD']]) {
    assert.throws(() => toMinorUnits(amount, currency));
  }
});
test('preserves supplier selling amount without inventing tax or cancellation penalties', () => {
  const f = fixture(); const r = f.result.hotels[0].rooms[0].rates[0];
  r.suggestedSellingAmount = '150.20'; r.suggestedSellingCurrency = 'USD';
  const p = run(f);
  assert.equal(p.provisionalQuote.amount, 15020);
  assert.equal(p.policyObservation.deadline, r.cancellationDeadline);
  assert.equal(p.policyObservation.authoritative, false);
  assert.ok(p.gaps.some(g => g.includes('PENALTIES')));
  r.suggestedSellingCurrency = 'EGP';
  assert.throws(() => run(f), /CURRENCY_MISMATCH/);
});
test('rejects live or unavailable results and ambiguous hotel/room/rate associations', () => {
  let f = fixture(); f.result.sandbox = false; assert.throws(() => run(f), /SANDBOX/);
  f = fixture(); f.result.status = 'unavailable'; assert.throws(() => run(f), /SANDBOX/);
  f = fixture(); f.result.hotels.push(structuredClone(f.result.hotels[0])); assert.throws(() => run(f), /HOTEL_NOT_UNIQUE/);
  f = fixture(); f.rateId = 'missing'; assert.throws(() => run(f), /RATE_NOT_UNIQUE/);
  f = fixture(); f.result.hotels[0].rooms[0].rates[0].roomId = 'different'; assert.throws(() => run(f), /ROOM_BINDING/);
});
test('rejects invalid dates, unknown multi-room allocation and invented child ages', () => {
  let f = fixture(); f.search.checkIn = '2027-02-30'; assert.throws(() => run(f), /DATE/);
  f = fixture(); f.search.checkOut = f.search.checkIn; assert.throws(() => run(f), /RANGE/);
  f = fixture(); f.search.occupancies.push({ adults: 1 }); assert.throws(() => run(f), /MULTI_ROOM/);
  f = fixture(); f.search.occupancies[0].childAges = [18]; assert.throws(() => run(f), /OCCUPANCY/);
  f = fixture(); f.search.occupancies[0].adults = 0; assert.throws(() => run(f), /OCCUPANCY/);
});
test('proposed stay binding changes when dates or occupancy change', () => {
  const f = fixture(); const first = run(f).request.stays[0].id;
  assert.equal(first, run(f).request.stays[0].id);
  f.search.checkOut = '2027-01-15'; assert.notEqual(first, run(f).request.stays[0].id);
  f.search.checkOut = '2027-01-14'; f.search.occupancies[0].adults = 3;
  assert.notEqual(first, run(f).request.stays[0].id);
});
test('REST/MCP descriptors carry the same request and are explicitly not executable', () => {
  const p = run(); const d = describeCreateTransports(p);
  assert.equal(d.executable, false);
  assert.equal(d.rest.path, '/booking-sessions');
  assert.equal(d.mcp.name, 'create_booking_session');
  assert.deepEqual(d.rest.body, d.mcp.arguments.booking);
  d.rest.body.guests[0].id = 'changed';
  assert.equal(p.request.guests[0].id, 'gst_1');
});
test('all requested transactions are blocked unconditionally', () => {
  for (const operation of ['create_booking_session', 'get_booking_session', 'update_booking_session', 'complete_booking_session', 'cancel_booking_session', 'payment', 'REQ']) {
    assert.throws(() => requireCommercialOperation(operation), /UCP_POC_TRANSACTION_DISABLED/);
  }
});
test('experiment is not wired into production surfaces and contains no network or provider calls', () => {
  for (const root of ['app', 'lib', 'components']) {
    const walk = (path: string) => {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        const file = join(path, entry.name);
        if (entry.isDirectory()) walk(file);
        else if (/\.[cm]?[jt]sx?$/.test(file)) assert.doesNotMatch(readFileSync(file, 'utf8'), /experiments\/ucp-lodging/);
      }
    };
    walk(root);
  }
  const source = readFileSync('experiments/ucp-lodging/adapter.ts', 'utf8');
  assert.doesNotMatch(source, /fetch\s*\(|process\.env|createTestBooking|prebook\s*\(/);
});
