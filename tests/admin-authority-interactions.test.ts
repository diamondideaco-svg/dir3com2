import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, '$1')), '..');
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

function filesUnder(relative: string): string[] {
  const absolute = path.join(root, relative);
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(relative, entry.name);
    return entry.isDirectory() ? filesUnder(child) : [child.replaceAll('\\', '/')];
  });
}

const adminRoutes = [
  '/admin', '/admin/assignment', '/admin/assignment/logs', '/admin/assignment/rules', '/admin/audit',
  '/admin/bookings', '/admin/bookings/[id]', '/admin/categories', '/admin/customers', '/admin/customers/[id]',
  '/admin/dashboard', '/admin/events', '/admin/finance', '/admin/notifications', '/admin/operations',
  '/admin/partners', '/admin/partners/new', '/admin/partners/vip-local-egypt', '/admin/partners/[id]',
  '/admin/pricing', '/admin/products', '/admin/shield', '/admin/verification', '/admin/verification/customers',
  '/admin/verification/documents', '/admin/verification/partners',
];

test('the complete current admin page inventory is explicit and protected by one server guard', () => {
  assert.equal(adminRoutes.length, 26);
  for (const route of adminRoutes) {
    const file = route === '/admin' ? 'app/admin/page.tsx' : `app${route}/page.tsx`;
    assert.equal(existsSync(path.join(root, file)), true, file);
  }
  const layout = read('app/admin/layout.tsx');
  const guard = read('lib/auth/admin.ts');
  assert.match(layout, /requireAdminShellAccess\('\/admin'\)/);
  assert.match(guard, /supabase\.auth\.getUser\(\)/);
  assert.match(guard, /resolveCanonicalUserRole\(supabase, user\.id\)/);
  assert.match(guard, /getTeamAccessGrant\(supabase, user\)/);
  assert.match(guard, /scope\.mode === 'country'/);
  assert.doesNotMatch(guard, /user_metadata/);
});

test('runtime admin-user management is not fabricated', () => {
  assert.equal(existsSync(path.join(root, 'app/admin/admins/page.tsx')), false);
  assert.equal(existsSync(path.join(root, 'app/admin/users/page.tsx')), false);
  const source = read('lib/actions/team-access-actions.ts');
  assert.match(source, /auth\.admin\.(createUser|inviteUserByEmail|updateUserById)/);
  assert.doesNotMatch(source, /auth\.admin\.deleteUser/);
  const grants = read('supabase/migrations/20260808173000_go_live_inc_006_profiles_partner_documents_runtime_grants.sql');
  assert.match(grants, /GRANT UPDATE \(email, full_name, updated_at\) ON TABLE public\.profiles TO authenticated/i);
  assert.doesNotMatch(grants, /GRANT UPDATE \([^)]*role/i);
});

test('admin audit and timeline actors are derived from the authenticated server context', () => {
  const actions = read('lib/actions/operations-actions.ts');
  assert.match(actions, /const \{ supabase, user \} = await requireAdminActionAccess\(\)/);
  assert.match(actions, /createAuditEntry\(supabase, \{ \.\.\.input, performedBy: user\.id \}\)/);
  assert.match(actions, /appendTimelineRecord\(supabase, \{ \.\.\.input, performedBy: user\.id \}\)/);
  assert.doesNotMatch(actions, /performedBy\?: string/);
});

test('admin booking surfaces fail closed to eligible Production records', () => {
  for (const file of ['app/admin/page.tsx', 'app/admin/bookings/page.tsx']) {
    const source = read(file);
    assert.match(source, /requireAdminPageDataAccess/);
    assert.match(source, /\.eq\('synthetic', false\)/);
    assert.match(source, /\.eq\('environment', 'production'\)/);
    assert.match(source, /\.is\('deleted_at', null\)/);
    assert.match(source, /isProductionBooking/);
  }
  const details = read('app/admin/bookings/[id]/page.tsx');
  assert.match(details, /!isProductionBooking\((?:rawBooking|booking)\)/);
  assert.match(details, /notFound\(\)/);
});

test('admin data failures are not converted to truthful-looking empty states', () => {
  for (const file of ['lib/actions/operations-actions.ts', 'lib/actions/verification-actions.ts', 'lib/actions/finance-actions.ts']) {
    assert.match(read(file), /throw new Error\('ADMIN_/);
  }
  assert.match(read('app/admin/error.tsx'), /No fallback empty data is shown/);
  assert.match(read('app/admin/loading.tsx'), /Loading authorized admin data/);
});

test('enabled audited state-changing controls require confirmation and prevent duplicate submits', () => {
  const locale = read('components/admin/AdminLocale.tsx');
  assert.match(locale, /useFormStatus\(\)/);
  assert.match(locale, /window\.confirm/);
  assert.match(locale, /disabled=\{pending\}/);
  for (const file of [
    'components/admin/MarketplaceRequestOperationsTable.tsx',
    'components/admin/VipPartnerConfigForm.tsx',
  ]) {
    assert.match(read(file), /AdminSubmitButton/);
  }
});

test('unsafe non-atomic admin mutations are disabled truthfully in UI and fail closed on the server', () => {
  for (const file of [
    'app/admin/bookings/[id]/page.tsx',
    'components/admin/VerificationTable.tsx',
    'components/assignment/AssignmentCard.tsx',
    'components/customers/CustomerTable.tsx',
    'components/customers/CustomerForm.tsx',
  ]) {
    const source = read(file);
    assert.match(source, /AdminUnavailableControl/);
    assert.doesNotMatch(source, /action=\{(?:completeBookingLifecycleAction|cancelBookingLifecycleAction|submitVerificationDecisionAction|approveAssignmentAction|rejectAssignmentAction|updateShieldLevelAction|deactivateCustomerAction|createCustomerAction)\}/);
  }

  assert.match(read('lib/actions/operations-actions.ts'), /ADMIN_BOOKING_LIFECYCLE_MUTATION_UNAVAILABLE/);
  assert.match(read('lib/actions/assignment-actions.ts'), /ADMIN_ASSIGNMENT_MUTATION_UNAVAILABLE/);
  assert.match(read('lib/actions/verification-actions.ts'), /ADMIN_VERIFICATION_MUTATION_UNAVAILABLE/);
});

test('product mutations use the dedicated audited lifecycle instead of the old unavailable controls', () => {
  const table = read('components/products/ProductTable.tsx');
  const form = read('components/products/ProductForm.tsx');
  const actions = read('lib/actions/product-actions.ts');
  assert.match(table, /ProductLifecycleControls/);
  assert.match(form, /createProductAction/);
  assert.match(actions, /rpc\('create_product_draft_lifecycle'/);
  assert.match(actions, /rpc\('publish_product_lifecycle'/);
  assert.match(actions, /requireScopedAdminActionAccess\('products:write'\)/);
  assert.doesNotMatch(actions, /update\(\{ status: 'published', verified: true \}\)/);
});

test('admin reads are server-authorized and booking owners cannot forge authoritative lifecycle fields', () => {
  const guard = read('lib/auth/admin.ts');
  const migration = read('supabase/migrations/20260901013000_bookings_owner_write_boundary.sql');
  assert.match(guard, /requireAdminPageAccess\(destination\)/);
  assert.match(guard, /supabase: supabaseAdmin/);
  assert.match(migration, /DROP POLICY IF EXISTS "Users manage own bookings"/);
  assert.match(migration, /FOR SELECT/);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.bookings FROM authenticated/);
});

test('currency rendering fails soft without mislabelling malformed stored currency as SAR', () => {
  const locale = read('components/admin/AdminLocale.tsx');
  assert.match(locale, /normalizedCurrency/);
  assert.match(locale, /catch \{/);
  assert.match(locale, /normalizedCurrency \|\| '—'/);
});

test('the admin shell exposes authoritative AR/EN direction and localized controls', () => {
  const shell = read('components/admin/AdminPlatformShell.tsx');
  assert.match(shell, /toggleLanguage/);
  assert.match(shell, /dir=\{direction\}/);
  assert.match(shell, /lang=\{language\}/);
  assert.match(read('components/admin/AdminLocale.tsx'), /AdminStatusText/);
  assert.match(read('components/admin/AdminLocale.tsx'), /AdminLocalizedInput/);
});

test('admin timestamps are deterministic between server and browser hydration', () => {
  const localeSource = read('components/admin/AdminLocale.tsx');
  assert.match(localeSource, /timeZone:\s*['"]UTC['"]/);
});

test('unimplemented controls are disabled with a truthful explanation', () => {
  const partner = read('components/admin/PartnerForm.tsx');
  const upload = read('components/admin/DocumentUploader.tsx');
  assert.match(partner, /disabled aria-describedby="partner-form-unavailable"/);
  assert.match(partner, /Saving is unavailable on this surface/);
  assert.match(upload, /disabled aria-describedby="admin-document-upload-unavailable"/);
  assert.match(upload, /Upload unavailable on this surface/);
});

test('document verification never fabricates preview, expiry, or timeline evidence', () => {
  const page = read('app/admin/verification/documents/page.tsx');
  assert.doesNotMatch(page, /daysUntilExpiry=\{14\}/);
  assert.doesNotMatch(page, /documentType="Passport"/);
  assert.doesNotMatch(page, /<VerificationTimeline/);
  assert.match(page, /No authoritative verification request is selected/);
});
