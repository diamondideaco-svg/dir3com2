import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { languageDirection } from '@/lib/i18n/config';
import { executiveDashboardCopy } from '@/lib/i18n/executive-dashboard';
import {
  isProductionBooking,
  resolveBookingMetrics,
  resolveCountMetric,
  type ExecutiveBookingRow,
} from '@/lib/integration/executive-dashboard-contract';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const productionBooking: ExecutiveBookingRow = {
  id: 'booking-1',
  booking_reference: 'DIR3-LIVE-1',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: '1250.50',
  synthetic: false,
  environment: 'production',
  source_channel: 'marketplace',
};

test('synthetic bookings are excluded from Production booking KPIs', () => {
  assert.equal(isProductionBooking({ ...productionBooking, synthetic: true }), false);
});

test('sandbox and explicit test bookings are excluded even when other fields look live', () => {
  assert.equal(isProductionBooking({ ...productionBooking, environment: 'sandbox' }), false);
  assert.equal(isProductionBooking({ ...productionBooking, booking_reference: 'TEST-BOOK-1' }), false);
  assert.equal(isProductionBooking({ ...productionBooking, source_channel: 'preview-run' }), false);
});

test('unknown environment fails closed from Production KPIs', () => {
  assert.equal(isProductionBooking({ ...productionBooking, environment: null }), false);
  assert.equal(isProductionBooking({ ...productionBooking, environment: '' }), false);
});

test('a valid Production booking is included', () => {
  const metrics = resolveBookingMetrics([productionBooking], null);
  assert.deepEqual(metrics.productionBookings, { status: 'available', value: 1 });
});

test('request and quote states never count as bookings', () => {
  const metrics = resolveBookingMetrics([
    { ...productionBooking, status: 'request' },
    { ...productionBooking, status: 'quoted', booking_reference: 'DIR3-LIVE-2' },
  ], null);
  assert.deepEqual(metrics.productionBookings, { status: 'available', value: 0 });
});

test('unconfirmed payment is excluded from confirmed Production revenue', () => {
  const metrics = resolveBookingMetrics([{ ...productionBooking, payment_status: 'pending' }], null);
  assert.deepEqual(metrics.productionBookings, { status: 'available', value: 1 });
  assert.deepEqual(metrics.confirmedProductionRevenue, { status: 'available', value: 0 });
});

test('confirmed paid Production revenue is included', () => {
  const metrics = resolveBookingMetrics([productionBooking], null);
  assert.deepEqual(metrics.confirmedProductionRevenue, { status: 'available', value: 1250.5 });
});

test('invalid amount on a confirmed paid Production booking fails revenue closed', () => {
  const metrics = resolveBookingMetrics([{ ...productionBooking, total_amount: null }], null);
  assert.deepEqual(metrics.productionBookings, { status: 'available', value: 1 });
  assert.deepEqual(metrics.confirmedProductionRevenue, { status: 'unavailable' });
});

test('a successful zero-row result remains an authoritative zero', () => {
  const metrics = resolveBookingMetrics([], null);
  assert.deepEqual(metrics.productionBookings, { status: 'available', value: 0 });
  assert.deepEqual(metrics.confirmedProductionRevenue, { status: 'available', value: 0 });
  assert.deepEqual(resolveCountMetric(0, null), { status: 'available', value: 0 });
});

test('query failures are unavailable and never converted to zero', () => {
  const metrics = resolveBookingMetrics([], { code: 'TEST_QUERY_FAILURE' });
  assert.deepEqual(metrics.productionBookings, { status: 'unavailable' });
  assert.deepEqual(metrics.confirmedProductionRevenue, { status: 'unavailable' });
  assert.deepEqual(resolveCountMetric(null, { code: 'TEST_QUERY_FAILURE' }), { status: 'unavailable' });
});

test('dashboard queries enforce canonical Production and synthetic filters', () => {
  const source = read('lib/integration/dashboard-engine.ts');
  assert.match(source, /\.eq\('synthetic', false\)/);
  assert.match(source, /\.eq\('environment', 'production'\)/);
  assert.match(source, /\.is\('deleted_at', null\)/);
  assert.match(source, /authoritative query unavailable/);
});

test('hardcoded health and false-zero indicators are absent from the Executive Dashboard', () => {
  const page = read('app/admin/dashboard/page.tsx');
  const client = read('components/admin/ExecutiveDashboardClient.tsx');
  const renderedSource = `${page}\n${client}`;

  assert.doesNotMatch(renderedSource, /Database Status/);
  assert.doesNotMatch(renderedSource, /Escrow Status/);
  assert.doesNotMatch(renderedSource, /\bOperational\b/);
  assert.doesNotMatch(renderedSource, /\bHealthy\b/);
  assert.doesNotMatch(renderedSource, /value=["']0["']/);
  assert.match(client, /metric\.status === 'available'/);
  assert.match(client, /t\.unavailable/);
});

test('Arabic and English Executive copy are complete and isolated', () => {
  assert.equal(executiveDashboardCopy.ar.metrics.productionBookings, 'حجوزات الإنتاج');
  assert.equal(executiveDashboardCopy.en.metrics.productionBookings, 'Production bookings');
  assert.match(JSON.stringify(executiveDashboardCopy.ar), /[\u0600-\u06ff]/u);
  assert.doesNotMatch(JSON.stringify(executiveDashboardCopy.en), /[\u0600-\u06ff]/u);
  assert.equal(languageDirection('ar'), 'rtl');
  assert.equal(languageDirection('en'), 'ltr');
});

test('Executive dashboard and admin shell follow the authoritative language context', () => {
  for (const path of [
    'components/admin/ExecutiveDashboardClient.tsx',
    'components/admin/AdminPlatformShell.tsx',
  ]) {
    const source = read(path);
    assert.match(source, /useLanguage\(\)/);
    assert.match(source, /dir=\{direction\}/);
    assert.match(source, /lang=\{language\}/);
    assert.doesNotMatch(source, /dir="rtl"/);
  }
});

test('CEO access continues to use the existing admin guard without RBAC widening', () => {
  const layout = read('app/admin/layout.tsx');
  const guard = read('lib/auth/admin.ts');

  assert.match(layout, /requireAdminPageAccess\('\/admin'\)/);
  assert.match(guard, /supabase\.auth\.getUser\(\)/);
  assert.match(guard, /isAdminRole\(role\)/);
  assert.match(guard, /notFound\(\)/);
  assert.doesNotMatch(guard, /user_metadata/);
});
