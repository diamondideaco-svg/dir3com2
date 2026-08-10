import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { isTrustedSandboxAutomation, normalizeString, toClientErrorMessage } from '@/lib/ai2/sandbox/route-helpers';
import {
  SandboxError,
  assertCompleteAvailabilityWindow,
  buildSandboxCreateBookingPayload,
  buildSandboxModifyBookingPayload,
  buildStayDates,
  evaluateSandboxRuntimeGuard,
} from '@/lib/ai2/sandbox/service';
import { applyPublicProductFilters, applyPublicServiceFilters, isPublicMarketplaceProduct } from '@/lib/marketplace/public-filters';

test('authorization token trust is constant-time and strict', () => {
  const valid = 'sandbox-internal-token-0001';
  assert.equal(isTrustedSandboxAutomation(valid, valid), true);
  assert.equal(isTrustedSandboxAutomation(valid, 'sandbox-internal-token-0002'), false);
  assert.equal(isTrustedSandboxAutomation(valid, 'short'), false);
});

test('runtime guard allows only the staging allowlist project ref', () => {
  const ok = evaluateSandboxRuntimeGuard({
    appEnv: 'staging',
    nodeEnv: 'development',
    supabaseUrl: 'https://ynupwivgvwcyrsdhtkcc.supabase.co',
  });
  assert.equal(ok.ok, true);

  const prodBlocked = evaluateSandboxRuntimeGuard({
    appEnv: 'production',
    nodeEnv: 'production',
    supabaseUrl: 'https://ynupwivgvwcyrsdhtkcc.supabase.co',
  });
  assert.deepEqual(prodBlocked, { ok: false, reason: 'PRODUCTION_ENV' });

  const missingRef = evaluateSandboxRuntimeGuard({
    appEnv: 'staging',
    nodeEnv: 'development',
    supabaseUrl: 'not-a-url',
  });
  assert.deepEqual(missingRef, { ok: false, reason: 'INVALID_SUPABASE_URL' });

  const mismatch = evaluateSandboxRuntimeGuard({
    appEnv: 'staging',
    nodeEnv: 'development',
    supabaseUrl: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co',
  });
  assert.deepEqual(mismatch, { ok: false, reason: 'PROJECT_REF_MISMATCH' });
});

test('pricing boundaries treat departure as exclusive night boundary', () => {
  const arrival = new Date('2026-08-10T00:00:00.000Z');
  const oneNightDeparture = new Date('2026-08-11T00:00:00.000Z');
  const multiDeparture = new Date('2026-08-14T00:00:00.000Z');

  const oneNight = buildStayDates(arrival, oneNightDeparture);
  assert.deepEqual(oneNight, ['2026-08-10']);

  const multiNight = buildStayDates(arrival, multiDeparture);
  assert.deepEqual(multiNight, ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13']);

  assert.throws(() => buildStayDates(arrival, arrival), SandboxError);
});

test('availability window requires full nightly coverage and blocks closed dates', () => {
  const stayDates = ['2026-08-10', '2026-08-11'];

  assert.doesNotThrow(() =>
    assertCompleteAvailabilityWindow(stayDates, [
      { date: '2026-08-10', availability_status: 'available', available: true },
      { date: '2026-08-11', availability_status: 'partially_booked', available: true },
    ])
  );

  assert.throws(
    () =>
      assertCompleteAvailabilityWindow(stayDates, [
        { date: '2026-08-10', availability_status: 'available', available: true },
      ]),
    /NO_AVAILABILITY/
  );

  assert.throws(
    () =>
      assertCompleteAvailabilityWindow(stayDates, [
        { date: '2026-08-10', availability_status: 'available', available: true },
        { date: '2026-08-11', availability_status: 'full', available: false },
      ]),
    /UNAVAILABLE/
  );
});

test('booking mutation payloads stay synthetic and scoped', () => {
  const payload = buildSandboxCreateBookingPayload(
    {
      productId: 'p1',
      arrivalDate: '2026-08-10',
      departureDate: '2026-08-11',
      guests: 2,
      guestName: 'Sandbox Guest',
      guestPhone: '+201000000000',
      sourceChannel: 'dabra-ai2-sandbox',
    },
    {
      subtotal: 200,
      nights: 1,
      guests: 2,
      productName: 'Synthetic Product',
      productCity: 'Cairo',
      currency: 'EGP',
      total: 240,
    },
    'staging',
    'TEST-BOOK-1'
  );

  assert.equal(payload.synthetic, true);
  assert.equal(payload.environment, 'staging');
  assert.equal(payload.booking_reference, 'TEST-BOOK-1');

  const modify = buildSandboxModifyBookingPayload(
    {
      bookingId: 'b1',
      arrivalDate: '2026-08-12',
      departureDate: '2026-08-14',
      guests: 3,
      notes: 'updated',
    },
    {
      guests: 3,
      total: 360,
    }
  );

  assert.equal(modify.guests, 3);
  assert.equal(modify.total_amount, 360);
  assert.equal(modify.scenario_code, 'sandbox_modified');
});

test('public marketplace isolation excludes synthetic items even if status is published/active', () => {
  assert.equal(isPublicMarketplaceProduct({ status: 'published', synthetic: false }), true);
  assert.equal(isPublicMarketplaceProduct({ status: 'published', synthetic: true }), false);
  assert.equal(isPublicMarketplaceProduct({ status: 'active', synthetic: true }), false);

  const calls: Array<{ type: string; column: string; value: unknown }> = [];
  const fakeQuery = {
    in(column: string, value: readonly string[]) {
      calls.push({ type: 'in', column, value: value.join(',') });
      return this;
    },
    eq(column: string, value: unknown) {
      calls.push({ type: 'eq', column, value });
      return this;
    },
  };

  applyPublicProductFilters(fakeQuery);

  assert.equal(calls.some((call) => call.type === 'in' && call.column === 'status'), true);
  assert.equal(calls.some((call) => call.type === 'eq' && call.column === 'synthetic' && call.value === false), true);

  const serviceCalls: Array<{ type: string; column: string; value: unknown }> = [];
  const fakeServiceQuery = {
    eq(column: string, value: unknown) {
      serviceCalls.push({ type: 'eq', column, value });
      return this;
    },
  };

  applyPublicServiceFilters(fakeServiceQuery);
  assert.equal(serviceCalls.some((call) => call.type === 'eq' && call.column === 'synthetic' && call.value === false), true);
});

test('public adapters and service API keep DB-level synthetic isolation and avoid unfiltered retries', () => {
  const adapters = fs.readFileSync(path.resolve('lib/marketplace/adapters.ts'), 'utf8');
  assert.match(adapters, /applyPublicServiceFilters/);
  assert.match(adapters, /applyPublicProductFilters/);
  assert.match(adapters, /applyPublicCategoryFilters/);
  assert.doesNotMatch(adapters, /products:products\(/);

  const serviceRoute = fs.readFileSync(path.resolve('app/api/services/[slug]/route.ts'), 'utf8');
  assert.match(serviceRoute, /applyPublicProductFilters/);
  assert.match(serviceRoute, /applyPublicCategoryFilters/);
  assert.match(serviceRoute, /applyPublicAssetSyntheticFilter/);
  assert.doesNotMatch(serviceRoute, /from\('services'\)/);
  assert.doesNotMatch(serviceRoute, /resolveSingleWithSyntheticCompatibility/);
  assert.doesNotMatch(serviceRoute, /resolveArrayWithSyntheticCompatibility/);

  const bookingPage = fs.readFileSync(path.resolve('app/booking/page.tsx'), 'utf8');
  assert.match(bookingPage, /\.in\('status', \['published', 'active', 'featured'\]\)/);
  assert.match(bookingPage, /\.eq\('synthetic', false\)/);
  const searchRoute = fs.readFileSync(path.resolve('app/api/search/marketplace/route.ts'), 'utf8');
  assert.match(searchRoute, /getMarketplaceSnapshot/);
  assert.doesNotMatch(searchRoute, /supabaseAdmin/);
  assert.doesNotMatch(searchRoute, /from\('products'\)|from\('services'\)|from\('product_categories'\)/);
});

test('public isolation script covers search, service detail, and synthetic image leakage checks', () => {
  const script = fs.readFileSync(path.resolve('scripts/sandbox/check-public-isolation.mjs'), 'utf8');
  assert.match(script, /\/api\/search\/marketplace/);
  assert.match(script, /\/api\/services\//);
  assert.match(script, /detailSyntheticImageLeak/);
});

test('errors are sanitized and do not leak Supabase internals', () => {
  const raw = new Error('relation public.bookings does not exist: schema details');
  const safe = toClientErrorMessage(raw);
  assert.equal(safe, 'Sandbox operation failed.');

  const dbSafe = toClientErrorMessage(new SandboxError('SANDBOX_DB_ERROR'));
  assert.equal(dbSafe, 'Sandbox backend is currently unavailable.');
});

test('Arabic input text remains valid UTF-8 content through normalization', () => {
  const input = '  احجز لي رحلة من القاهرة إلى جدة  ';
  const output = normalizeString(input);
  assert.equal(output, 'احجز لي رحلة من القاهرة إلى جدة');
});
