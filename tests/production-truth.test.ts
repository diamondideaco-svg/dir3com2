import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { driveRequestState } from '../lib/drive/request';

test('public surfaces do not claim unavailable payments, escrow, apps, offers, or partners', () => {
  const home = readFileSync('components/home/dir3-home-data.ts','utf8');
  const contact = readFileSync('components/public/ContactPublicPage.tsx','utf8');
  const footer = readFileSync('components/layout/Footer.tsx','utf8');
  const approved = readFileSync('components/approved/ApprovedVisualPage.tsx','utf8');
  const externalLinks = readFileSync('components/shared/PartnersTicker.tsx','utf8');
  const linkCatalog = readFileSync('lib/content/partners.ts','utf8');
  for (const source of [home,contact,footer,approved,externalLinks]) assert.doesNotMatch(source,/payments ready|واجهة دفع محلية جاهزة|فلوسك محفوظة|money stays protected|hello@dir3com\.com/i);
  assert.equal((home.match(/shieldOffers: \[\]/g) ?? []).length,2);
  assert.equal((home.match(/partnerCards: \[\]/g) ?? []).length,2);
  assert.match(home,/paymentMethods: readonly string\[\] = \[\]/);
  assert.match(footer,/Google Play · \{t\.comingSoon\}/);
  assert.match(footer,/App Store · \{t\.comingSoon\}/);
  assert.doesNotMatch(approved,/احجز الآن|Book now|redirect=%2Fbooking|href="\/booking"/);
  assert.match(approved,/href="\/marketplace">\{homeCopy\.marketplace\}<\/Link>/);
  assert.match(approved,/href={`\/marketplace\?family=dir3-\${page}`}/);
  assert.doesNotMatch(approved,/PartnersTicker|lib\/content\/partners/);
  assert.match(externalLinks,/no partnership or payment acceptance is implied/);
  assert.match(externalLinks,/لا تعني شراكة أو قبول وسيلة دفع/);
  for (const id of ['visa','mastercard','mada']) assert.match(linkCatalog,new RegExp(`id: '${id}'[^\\n]+published: false`));
});

test('reachable public CTAs discover services without claiming enabled transactions', () => {
  for (const file of ['PublicHero.tsx', 'PublicCtaBanner.tsx', 'PublicServiceDetailClient.tsx']) {
    const source = readFileSync(`components/public/${file}`, 'utf8');
    assert.doesNotMatch(source, /href=[^\n]*(?:\/booking|redirect=%2Fbooking)|Book now|احجز الآن|Continue to booking|Available for direct booking/i, file);
    assert.match(source, /Explore Marketplace/, file);
    assert.match(source, /استكشف السوق/, file);
    assert.match(source, /\/marketplace/, file);
  }
  const detail = readFileSync('components/public/PublicServiceDetailClient.tsx', 'utf8');
  assert.match(detail, /booking and payment are not enabled/);
});

test('acceptance consent excludes unavailable terms and preserves the request boundary', () => {
  const ui = readFileSync('components/drive/DriveRequestReview.tsx', 'utf8');
  assert.match(ui, /I approve only the displayed final price, vehicle\/service summary, and quote validity/);
  assert.match(ui, /أوافق على السعر النهائي وملخص السيارة والخدمة ومدة صلاحية العرض المعروضة فقط/);
  assert.match(ui, /I understand this is not a booking or payment/);
  assert.doesNotMatch(ui, /reviewed[^\n]*terms|راجعت[^\n]*الشروط/);
  const sql = readFileSync('supabase/migrations/20260925150000_drive_customer_quote_acceptance.sql', 'utf8');
  assert.match(sql, /Not acceptance of unavailable cancellation\/change terms, booking, payment or supplier confirmation/);
});

test('Operations renders both post-quote states in AR/EN instead of unknown status', () => {
  const source = readFileSync('components/drive/DriveOperations.tsx', 'utf8');
  const future = '2099-01-01T00:00:00Z';
  for (const [status, expected] of [['awaiting_customer_acceptance', 'quote_ready'], ['awaiting_payment', 'ready_for_payment']] as const) {
    assert.equal(driveRequestState(status, future), expected);
    assert.match(source, new RegExp(`${expected}:\\['[^']*[\\u0600-\\u06ff][^']*','[^']*[A-Za-z][^']*'\\]`));
  }
  assert.match(source, /Customer accepted the quote — payment is not enabled/);
});

test('customer acceptance uses the Operations context/request lock order with ownership and replay guards', () => {
  const sql = readFileSync('supabase/migrations/20260925150000_drive_customer_quote_acceptance.sql', 'utf8');
  const context = sql.indexOf('SELECT * INTO v_context');
  const request = sql.indexOf('SELECT * INTO v_request');
  assert.ok(context >= 0 && context < request);
  assert.match(sql.slice(context, request), /r\.user_id=auth\.uid\(\)/);
  assert.match(sql.slice(context, request), /FOR UPDATE OF c/);
  assert.match(sql.slice(request), /marketplace_requests WHERE id=p_request_id FOR UPDATE/);
  assert.match(sql, /v_request\.user_id IS DISTINCT FROM auth\.uid\(\)/);
  assert.match(sql, /v_context\.version IS DISTINCT FROM p_version/);
  assert.match(sql, /v_request\.quote_expires_at<=now\(\)/);
  assert.ok(sql.indexOf("'replayed',true") < sql.indexOf('INSERT INTO public.drive_request_events'));
  assert.equal((sql.match(/INSERT INTO public\.drive_request_events/g) ?? []).length, 1);
});

test('Drive acceptance remains a request boundary before payment and booking', () => {
  const action = readFileSync('app/my-requests/[reference]/drive/actions.ts','utf8');
  const ui = readFileSync('components/drive/DriveRequestReview.tsx','utf8');
  const migration = readFileSync('supabase/migrations/20260925150000_drive_customer_quote_acceptance.sql','utf8');
  assert.match(action,/accept_managed_drive_quote/);
  assert.doesNotMatch(action,/form\.get\('reference'\)|isMarketplaceRequestReference/);
  assert.match(action,/revalidatePath\('\/my-requests\/\[reference\]\/drive', 'page'\)/);
  assert.match(ui,/Acceptance only records your approval; it does not create a booking or charge/);
  assert.match(ui,/Payment unavailable/);
  assert.match(migration,/next_action='payment_not_enabled'/);
  assert.doesNotMatch(migration,/(?:INSERT INTO|UPDATE) public\.(?:bookings|payments)/i);
});
