import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { attachAuthoritativeCustomerName, filterAndSortAdminBookings } from '@/lib/admin/booking-customer';

const profiles = new Map([['u1', 'Ahmed Ali'], ['u2', 'سارة محمد']]);
const rows = [
  attachAuthoritativeCustomerName({ user_id: 'u1', guest_name: 'Guest A', booking_reference: 'DIR3-100', status: 'confirmed', created_at: '2026-01-02T00:00:00Z' }, profiles),
  attachAuthoritativeCustomerName({ user_id: 'u2', guest_name: 'Guest B', booking_reference: 'DIR3-200', status: 'pending', created_at: '2026-01-01T00:00:00Z' }, profiles),
  attachAuthoritativeCustomerName({ user_id: 'missing', guest_name: 'Truthful Guest', booking_reference: 'DIR3-[special]', status: 'pending', created_at: '2026-01-03T00:00:00Z' }, profiles),
];

test('admin booking queries never select the nonexistent bookings.customer_name column', () => {
  for (const file of ['../app/admin/page.tsx', '../app/api/partner-portal/bookings/route.ts']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\.select\([^)]*customer_name/);
  }
  const dashboard = readFileSync(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(dashboard, /\.select\([^)]*service_name/);
  assert.match(dashboard, /user_id, guest_name, guest_email, product_name/);
});

test('customer identity prefers canonical profiles and falls back truthfully to guest name', () => {
  assert.equal(rows[0].customer_name, 'Ahmed Ali');
  assert.equal(rows[2].customer_name, 'Truthful Guest');
  assert.equal(attachAuthoritativeCustomerName({ user_id: 'missing', guest_email: 'customer@example.test' }, profiles).customer_name, 'customer@example.test');
  assert.equal(attachAuthoritativeCustomerName({ user_id: 'missing' }, profiles).customer_name, 'missing');
  assert.equal(attachAuthoritativeCustomerName({}, profiles).customer_name, null);
});

test('booking search supports exact, partial, Arabic, English, special characters, no-result, and reset', () => {
  assert.deepEqual(filterAndSortAdminBookings(rows, { query: 'Ahmed Ali' }).map((row) => row.booking_reference), ['DIR3-100']);
  assert.deepEqual(filterAndSortAdminBookings(rows, { query: 'ahm' }).map((row) => row.booking_reference), ['DIR3-100']);
  assert.deepEqual(filterAndSortAdminBookings(rows, { query: 'سارة' }).map((row) => row.booking_reference), ['DIR3-200']);
  assert.deepEqual(filterAndSortAdminBookings(rows, { query: 'Truthful' }).map((row) => row.booking_reference), ['DIR3-[special]']);
  assert.deepEqual(filterAndSortAdminBookings(rows, { query: '[special]' }).map((row) => row.booking_reference), ['DIR3-[special]']);
  assert.deepEqual(filterAndSortAdminBookings(rows, { query: 'not-present' }), []);
  assert.equal(filterAndSortAdminBookings(rows, {}).length, 3);
});

test('booking filters combine with search and sorting resets deterministically', () => {
  assert.deepEqual(filterAndSortAdminBookings(rows, { query: 'DIR3', status: 'confirmed' }).map((row) => row.booking_reference), ['DIR3-100']);
  assert.deepEqual(filterAndSortAdminBookings(rows, { status: 'missing' }), []);
  assert.deepEqual(filterAndSortAdminBookings(rows, { sort: 'oldest' }).map((row) => row.booking_reference), ['DIR3-200', 'DIR3-100', 'DIR3-[special]']);
  assert.deepEqual(filterAndSortAdminBookings(rows, { sort: 'customer_asc' }).map((row) => row.customer_name), ['Ahmed Ali', 'Truthful Guest', 'سارة محمد']);
  assert.deepEqual(filterAndSortAdminBookings(rows, { sort: 'customer_desc' }).map((row) => row.customer_name), ['سارة محمد', 'Truthful Guest', 'Ahmed Ali']);
});
