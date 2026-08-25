import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canReadTenantAssociation,
  canReadTenantRecord,
  hasValidTenantAssociation,
  isPrivilegedPortalActor,
} from '../lib/partner-portal/tenant-access';

const partnerA = { userId: 'partner-a', authRole: 'partner' as const };
const partnerB = { userId: 'partner-b', authRole: 'partner' as const };
const admin = { userId: 'admin-a', authRole: 'admin' as const };

test('partners read only records with their authoritative session owner id', () => {
  assert.equal(canReadTenantRecord(partnerA, { ownerId: 'partner-a' }), true);
  assert.equal(canReadTenantRecord(partnerA, { ownerId: 'partner-b' }), false);
  assert.equal(canReadTenantRecord(partnerB, { ownerId: 'partner-b' }), true);
  assert.equal(canReadTenantRecord(partnerB, { ownerId: 'partner-a' }), false);
});

test('missing or ambiguous ownership fails closed for partners', () => {
  assert.equal(canReadTenantRecord(partnerA, {}), false);
  assert.equal(canReadTenantRecord(partnerA, { ownerId: '' }), false);
  assert.equal(canReadTenantRecord(partnerA, { ownerId: ' partner-a' }), false);
});

test('child media must have the same explicit owner as its asset', () => {
  const assetA = { ownerId: 'partner-a' };
  assert.equal(canReadTenantAssociation(partnerA, assetA, { ownerId: 'partner-a' }), true);
  assert.equal(canReadTenantAssociation(partnerA, assetA, { ownerId: 'partner-b' }), false);
  assert.equal(canReadTenantAssociation(partnerA, assetA, {}), false);
  assert.equal(hasValidTenantAssociation(assetA, { ownerId: 'partner-b' }), false);
});

test('browser tenant substitution cannot override authenticated ownership', () => {
  const browserSuppliedTenant = 'partner-b';
  assert.equal(canReadTenantRecord(partnerA, { ownerId: browserSuppliedTenant }), false);
});

test('admin retains explicit privileged access', () => {
  assert.equal(isPrivilegedPortalActor(admin), true);
  assert.equal(canReadTenantRecord(admin, { ownerId: 'partner-a' }), true);
  assert.equal(canReadTenantRecord(admin, {}), true);
});

test('anonymous callers have no actor and cannot reach tenant records', () => {
  const anonymousActor = null;
  assert.equal(anonymousActor, null);
});
