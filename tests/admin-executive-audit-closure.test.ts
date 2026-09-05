import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const executivePage = read('app/admin/dashboard/page.tsx');
const auditPage = read('app/admin/audit/page.tsx');
const productAudit = read('components/admin/ProductLifecycleAudit.tsx');
const adminAuth = read('lib/auth/admin.ts');

// These are source contracts, not substitutes for authenticated browser UAT.
test('executive route authorizes before loading executive data', () => {
  const guard = executivePage.indexOf("await requireAdminPageAccess('/admin/dashboard')");
  const load = executivePage.indexOf('await getExecutiveDashboardData()');
  assert.ok(guard >= 0 && load > guard, 'global admin guard must precede the executive query');
  assert.match(adminAuth, /requireAdminPageAccess[\s\S]*?!isAdminRole\(context\.role\)\) notFound\(\)/);
});

test('audit route denies scoped staff before rendering either audit surface', () => {
  const guard = auditPage.indexOf("await requireAdminPageAccess('/admin/audit')");
  assert.ok(guard >= 0 && guard < auditPage.indexOf('<ProductLifecycleAudit />'));
  assert.ok(guard < auditPage.indexOf('<AuditTable />'));
});

test('product audit reads the actual ledger using the session client and bounded queries', () => {
  assert.match(productAudit, /await requireAdminActionAccess\(\)/);
  assert.ok(productAudit.indexOf('await requireAdminActionAccess()') < productAudit.indexOf('try {'));
  assert.match(productAudit, /\.from\('product_audit_events'\)/);
  assert.match(productAudit, /\.limit\(50\)/);
  assert.doesNotMatch(productAudit, /supabaseAdmin|getOperationsSummary|\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
});

test('product audit errors cannot masquerade as a successful empty ledger', () => {
  assert.match(productAudit, /if \(error \|\| !data\) throw new Error\('PRODUCT_AUDIT_READ_FAILED'\)/);
  assert.match(productAudit, /catch \{[\s\S]*role="alert"/);
  assert.match(productAudit, /No product lifecycle events are recorded/);
});

test('audit display preserves explicit false verification and archived snapshot truth', () => {
  assert.match(productAudit, /typeof snapshot\.verified === 'boolean' \? snapshot\.verified : null/);
  assert.match(productAudit, /verified === null/);
  assert.match(productAudit, /archived \? 'archived'/);
  assert.match(productAudit, /value=\{row\.before_state\}/);
  assert.match(productAudit, /value=\{row\.after_state\}/);
  assert.doesNotMatch(productAudit, /JSON\.stringify/);
});
