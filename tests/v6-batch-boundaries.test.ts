import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('wallet actions remain visible but cannot execute unsupported financial mutations', () => {
  const source = read('components/v6/Wallet.tsx');
  for (const action of ['Add Funds', 'Bank Transfer', 'My Cards', 'Refunds', 'Pay']) assert.ok(source.includes(action));
  assert.match(source, /disabled data-finance-rail="held"/);
  assert.doesNotMatch(source, /lib\/actions|fetch\(|supabase|Coming soon|Currently unavailable|غير متاح حاليًا|قريبًا/);
  assert.match(source, /value === undefined \? '—'/);
  assert.doesNotMatch(source, /12,450|9,850|Payment completed|Transfer completed/);
});

test('wallet and booking queries retain owner binding and distinguish read failure from empty data', () => {
  const wallet = read('app/my-wallet/page.tsx');
  const bookings = read('app/my-bookings/page.tsx');
  assert.ok(wallet.includes(".eq('owner_id', user.id).eq('owner_type', 'customer')"));
  assert.ok(wallet.includes(".eq('wallet_id', wallet.id)"));
  assert.ok(bookings.includes(".eq('user_id', user.id)"));
  assert.ok(wallet.includes('failed = Boolean(result.error)'));
  assert.ok(bookings.includes('failed={Boolean(error)}'));
  assert.doesNotMatch(wallet + bookings, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});

test('verification requires authoritative confirmed user and session, not local email context', () => {
  const source = read('components/v6/EmailVerification.tsx');
  assert.ok(source.includes('supabase.auth.verifyOtp'));
  assert.ok(source.includes("type: 'email'"));
  assert.ok(source.includes('!data.user || !data.session || !data.user.email_confirmed_at'));
  assert.ok(source.includes("supabase.auth.resend({ type: 'signup'"));
  assert.ok(source.includes('if (inFlight.current'));
  assert.ok(source.includes('setSeconds(60)'));
  assert.doesNotMatch(source, /auth\.updateUser|phone_verified|service_role/);
  assert.ok(source.includes('const [editing, setEditing] = useState(true)'));
});

test('welcome never substitutes for authentication and scoped shell uses actual locale', () => {
  const page = read('app/login-success/page.tsx');
  assert.ok(page.includes('getViewer()'));
  assert.match(page, /if \(!viewer\) redirect/);
  const shell = read('components/v6/Chrome.tsx');
  assert.ok(shell.includes('lang={language} dir={direction}'));
  assert.ok(shell.includes('aria-controls="account-navigation"'));
  assert.doesNotMatch(shell, /Diamond Member|dir3 Gold/);
});
