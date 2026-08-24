import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('partners cannot self-promote profile or product review state', () => {
  const profileRoute = read('app/api/partner-portal/profile/route.ts');
  const productRoute = read('app/api/partner-portal/products/route.ts');

  assert.match(profileRoute, /resolvePartnerManagedStatus\(reviewStatus, currentPartner\.status\)/);
  assert.match(profileRoute, /reviewStatus\.trim\(\)\.toLowerCase\(\) === 'submitted'\) return 'pending'/);
  assert.match(profileRoute, /return safeText\(currentStatus, 40\)\.toLowerCase\(\) \|\| 'pending'/);
  assert.match(productRoute, /new Set\(\['draft', 'pending_review'\]\)/);
  assert.match(productRoute, /const status = 'draft';/);
  assert.doesNotMatch(productRoute, /new Set\(\[[^\]]*'active'[^\]]*\]\)/);
});

test('partner UI exposes review submission, logout, and readable mobile form controls', () => {
  const portal = read('components/portal/PartnerProviderPortalClient.tsx');

  assert.match(portal, /submitProfile: 'Submit Profile for Review'/);
  assert.match(portal, /submitService: 'Submit Service for Review'/);
  assert.match(portal, /supabase\.auth\.signOut\(\)/);
  assert.match(portal, /mode === 'partner' \? '\[&_input\]:text-\[#334155\]/);
  assert.match(portal, /saveExistingProduct\(row\.products!\.id, 'pending_review'\)/);
});

test('local migration admits pending_review without expanding product CRUD', () => {
  const migration = read('supabase/migrations/20260824085336_partner_product_review_status.sql');

  assert.match(migration, /CHECK \(status IN \('active', 'inactive', 'draft', 'featured', 'pending_review'\)\)/);
  assert.doesNotMatch(migration, /\b(?:GRANT|POLICY|INSERT|UPDATE|DELETE)\b/i);
});
