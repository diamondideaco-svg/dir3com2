import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('public surfaces do not claim unavailable payments, escrow, apps, offers, or partners', () => {
  const home = readFileSync('components/home/dir3-home-data.ts','utf8');
  const contact = readFileSync('components/public/ContactPublicPage.tsx','utf8');
  const footer = readFileSync('components/layout/Footer.tsx','utf8');
  for (const source of [home,contact,footer]) assert.doesNotMatch(source,/payments ready|واجهة دفع محلية جاهزة|فلوسك محفوظة|money stays protected|hello@dir3com\.com/i);
  assert.equal((home.match(/shieldOffers: \[\]/g) ?? []).length,2);
  assert.equal((home.match(/partnerCards: \[\]/g) ?? []).length,2);
  assert.match(home,/paymentMethods: readonly string\[\] = \[\]/);
  assert.match(footer,/Google Play · \{t\.comingSoon\}/);
  assert.match(footer,/App Store · \{t\.comingSoon\}/);
});

test('Drive acceptance remains a request boundary before payment and booking', () => {
  const action = readFileSync('app/my-requests/[reference]/drive/actions.ts','utf8');
  const ui = readFileSync('components/drive/DriveRequestReview.tsx','utf8');
  const migration = readFileSync('supabase/migrations/20260925150000_drive_customer_quote_acceptance.sql','utf8');
  assert.match(action,/accept_managed_drive_quote/);
  assert.match(ui,/Acceptance only records your approval; it does not create a booking or charge/);
  assert.match(ui,/Payment unavailable/);
  assert.match(migration,/next_action='payment_not_enabled'/);
  assert.doesNotMatch(migration,/(?:INSERT INTO|UPDATE) public\.(?:bookings|payments)/i);
});
