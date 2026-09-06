import assert from 'node:assert/strict';
import test from 'node:test';
import { getPostLoginDestination, getRolePostLoginDestination } from '../lib/auth/redirect';

test('trusted role routing maps each implemented role to its real destination', () => {
  assert.equal(getRolePostLoginDestination({ role: 'admin', roleRaw: 'admin' }), '/admin');
  assert.equal(getRolePostLoginDestination({ role: 'partner', roleRaw: 'partner' }), '/partner-portal');
  assert.equal(getRolePostLoginDestination({ role: null, roleRaw: 'provider' }), '/provider-portal');
  assert.equal(getRolePostLoginDestination({ role: null, roleRaw: 'service_provider' }), '/provider-portal');
  assert.equal(getRolePostLoginDestination({ role: 'customer', roleRaw: 'customer' }), '/my-account');
  assert.equal(getRolePostLoginDestination({ role: null, roleRaw: null }), '/my-account');
});

test('staff lands at the guarded operational entry, never the executive dashboard', () => {
  for (const identity of [{ role: 'staff', roleRaw: 'staff' }, { role: null, roleRaw: ' Staff ' }]) {
    const destination = getRolePostLoginDestination(identity);
    assert.equal(destination, '/admin');
    assert.notEqual(destination, '/admin/dashboard');
    assert.notEqual(destination, '/my-account');
  }
});

test('explicit account links and unknown-role fallbacks remain available', () => {
  assert.equal(getPostLoginDestination('/my-account', 'https://example.invalid'), '/my-account');
  assert.equal(getRolePostLoginDestination({ role: null, roleRaw: null }), '/my-account');
});
