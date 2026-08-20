import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluatePilotAccess, parsePilotAllowlist } from '@/lib/auth/pilot';

test('DABRA pilot authorization requires an active authorized profile', () => {
  assert.equal(evaluatePilotAccess({ userId: 'user-1', profile: { role: 'admin', status: 'active' }, allowlistRaw: '' }).allowed, true);
  assert.equal(evaluatePilotAccess({ userId: 'user-1', profile: { role: 'customer', status: 'active' }, allowlistRaw: '' }).allowed, false);
  assert.equal(evaluatePilotAccess({ userId: 'user-1', profile: { role: 'admin', status: 'inactive' }, allowlistRaw: '' }).allowed, false);
  assert.equal(evaluatePilotAccess({ userId: 'user-1', profile: { role: 'admin', status: 'active', deleted_at: '2026-01-01' }, allowlistRaw: '' }).allowed, false);
});

test('DABRA pilot allowlist is exact and does not broaden authorization', () => {
  assert.deepEqual([...parsePilotAllowlist('user-1, user-2')], ['user-1', 'user-2']);
  assert.equal(evaluatePilotAccess({ userId: 'user-2', profile: { role: 'customer', status: 'active' }, allowlistRaw: 'user-1,user-2' }).allowed, true);
  assert.equal(evaluatePilotAccess({ userId: 'user-20', profile: { role: 'customer', status: 'active' }, allowlistRaw: 'user-1,user-2' }).allowed, false);
});
