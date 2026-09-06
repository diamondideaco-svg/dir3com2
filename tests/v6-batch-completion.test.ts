import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { walletSpending } from '../lib/customer/wallet-spending';
import { storageKey, readPersisted, createPersisted, validatePersistedFavorites } from '../lib/dabra/travel-commerce-state';
const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('spending never fabricates balance, travel category or mixed-currency total', () => {
  assert.equal(walletSpending(null, 'SAR', null), null);
  assert.equal(walletSpending([], 'SAR', null), 0);
  assert.equal(walletSpending([], null, null), null);
  const rows = [{ type: 'debit', amount: 30, currency: 'SAR', date: '2026-09-01' }, { type: 'credit', amount: 100, currency: 'SAR', date: '2026-09-01' }, { type: 'debit', amount: 20, currency: 'SAR', date: '2026-08-01' }];
  assert.equal(walletSpending(rows, 'SAR', '2026-09'), 30);
  assert.equal(walletSpending(rows, 'SAR', null), 50);
  assert.equal(walletSpending([...rows, { ...rows[0], currency: 'USD' }], 'SAR', null), null);
  assert.equal(walletSpending([{ ...rows[0], amount: NaN }], 'SAR', null), null);
});

test('account data cards remain owner scoped and requests are never promoted to bookings', () => {
  const page = read('app/my-account/page.tsx');
  assert.ok(page.includes(".eq('owner_type', 'customer').eq('owner_id', user.id)"));
  assert.ok(page.includes(".eq('user_id', user.id)"));
  assert.ok(page.includes('documentsResult.error ? null'));
  assert.ok(page.includes('bookingsFailed: Boolean(bookingsResult.error)'));
  const view = read('components/account/MyAccountContent.tsx');
  assert.ok(view.includes('<MarketplaceRequestsPanel requests={requests}'));
  assert.ok(view.includes("normalizeBookingStatus(booking.status) === 'Confirmed'"));
  assert.doesNotMatch(view, /dir3 Gold|Diamond Member|محمد ياسين|name@example/);
});

test('favorites retain the shared real persistence contract with empty/nonempty and foreign-owner rejection', () => {
  const owner = 'user:customer-a', now = Date.now();
  assert.deepEqual(readPersisted(JSON.stringify(createPersisted([], owner, now)), owner, validatePersistedFavorites, now), []);
  const saved = JSON.stringify(createPersisted(['existing-fixture-service'], owner, now));
  assert.deepEqual(readPersisted(saved, owner, validatePersistedFavorites, now), ['existing-fixture-service']);
  assert.equal(readPersisted(saved, 'user:customer-b', validatePersistedFavorites, now), null);
  assert.notEqual(storageKey(owner, 'favorites'), storageKey('user:customer-b', 'favorites'));
  const source = read('components/v6/Favorites.tsx');
  assert.ok(source.includes("storageKey(owner,'favorites')"));
  assert.ok(source.includes("fetch('/api/services?"));
  assert.ok(read('app/favorites/page.tsx').includes('key={viewer.id}'));
});
