import assert from 'node:assert/strict';
import test from 'node:test';
import { getRolePostLoginDestination } from '../lib/auth/redirect';

test('trusted role routing maps each implemented role to its real destination', () => {
  assert.equal(getRolePostLoginDestination({ role: 'admin', roleRaw: 'admin' }), '/admin');
  assert.equal(getRolePostLoginDestination({ role: 'partner', roleRaw: 'partner' }), '/partner-portal');
  assert.equal(getRolePostLoginDestination({ role: null, roleRaw: 'provider' }), '/provider-portal');
  assert.equal(getRolePostLoginDestination({ role: null, roleRaw: 'service_provider' }), '/provider-portal');
  assert.equal(getRolePostLoginDestination({ role: 'customer', roleRaw: 'customer' }), '/my-account');
  assert.equal(getRolePostLoginDestination({ role: null, roleRaw: null }), '/my-account');
});
