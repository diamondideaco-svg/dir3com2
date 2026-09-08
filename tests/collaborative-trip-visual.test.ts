import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';

const source = readFileSync(new URL('../components/v6/CollaborativeTripCapabilities.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../components/v6/collaborative-trip.module.css', import.meta.url), 'utf8');
const bookings = readFileSync(new URL('../components/v6/Bookings.tsx', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../app/my-bookings/[id]/page.tsx', import.meta.url), 'utf8');

test('collaboration section headings and supporting copy match the final CEO copy in both languages', () => {
  const heading = source.slice(source.indexOf('<div className={styles.heading}>'), source.indexOf('<div className={styles.grid}>'));
  for (const text of [
    'خططوا معًا', 'Plan together',
    'ادعُ رفاق الرحلة وشاركوا التخطيط والاختيارات.',
    'Invite your travel companions and plan and choose together.',
    'سافروا معًا', 'Travel together',
    'شاركوا تفاصيل الرحلة وتواصلوا طوال الرحلة.',
    'Share trip details and stay connected throughout the journey.',
  ]) assert.ok(heading.includes(text), text);
  assert.doesNotMatch(heading, /قبل الحجز|بعد الحجز|Before booking|After booking/);
  assert.ok(heading.includes('<span className={styles.preview}>{soon}</span>'));
});

test('planning and post-payment collection have distinct, required presentation phases', () => {
  assert.ok(source.includes("phase: 'planning' | 'collection'"));
  const planning = source.slice(source.indexOf('const planningCapabilities'), source.indexOf('const collectionCapabilities'));
  const collection = source.slice(source.indexOf('const collectionCapabilities'), source.indexOf('/**'));
  for (const label of ['خططوا الرحلة معًا', 'Plan together', 'دعوة المسافرين', 'Invite travellers', 'المشاركون', 'Participants', 'المحادثة المشتركة مع الدبرة', 'Shared DABRA conversation', 'الاختيارات المشتركة', 'Shared choices']) assert.ok(planning.includes(label));
  for (const label of ['مشاركة الرحلة', 'Share trip', 'دعوة المسافرين', 'Invite travellers', 'المشاركون', 'Participants', 'القَطّة / مشاركة تكلفة الرحلة', 'Collect from friends']) assert.ok(collection.includes(label));
  assert.doesNotMatch(planning, /LuCoins|Collect from friends/);
  assert.doesNotMatch(collection, /Shared DABRA|Shared choices|Split checkout|Split booking payment/);
});

test('the only capability action is the existing native-dialog pattern with no external authority', () => {
  assert.ok(source.includes('dialog.current?.showModal()'));
  assert.ok(source.includes('dialog.current?.close()'));
  assert.ok(source.includes('onClose={() => opener.current?.focus()}'));
  assert.ok(source.includes('aria-haspopup="dialog"'));
  assert.ok(source.includes('aria-describedby={`${id}-message`}'));
  assert.ok(source.includes('type="button"'));
  assert.doesNotMatch(source, /fetch\(|supabase|router\.|navigator\.|window\.open|localStorage|sessionStorage|<a\b|<Link\b|<form\b|<input\b|useEffect/);
  assert.ok(source.includes("? 'قريبًا' : 'Coming soon'"));
  assert.ok(source.includes('ستتمكن من دعوة رفاق الرحلة والتخطيط معًا في نفس الرحلة ومشاركة نفس محادثة الدبرة والاختيارات.'));
  assert.ok(source.includes('You’ll be able to invite fellow travellers, plan the same trip together, and share the same DABRA conversation and trip choices.'));
  assert.ok(source.includes('بعد دفع الحجز كاملًا وتأكيده، ستتمكن من إرسال روابط لرفاق الرحلة لتحصيل مساهماتهم في تكلفة الرحلة.'));
  assert.ok(source.includes('After you pay the booking in full and it is confirmed, you’ll be able to send contribution links to fellow travellers to collect their share of the trip cost.'));
});

test('collection preview is separate from Marketplace REQ and detail retains owner lookup and confirmation gate', () => {
  assert.ok(bookings.includes('<CollaborativeTripCapabilities phase="collection" />'));
  assert.ok(bookings.indexOf('<CollaborativeTripCapabilities') < bookings.indexOf('<div className={styles.requestSummary}>'));
  assert.ok(detail.includes("normalizeBookingStatus(booking.status) === 'Confirmed' && <CollaborativeTripCapabilities phase=\"collection\" />"));
  assert.ok(detail.includes(".eq('user_id', userId)"));
  assert.ok(detail.includes('if (!booking)'));
  assert.ok(detail.indexOf('if (!booking)') < detail.indexOf('<CollaborativeTripCapabilities'));
  assert.doesNotMatch(source, /bookingId|requestId|participants\.length|paidAmount|balance|amountRequested/);
  const request = readFileSync(new URL('../components/account/MarketplaceRequestDetail.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(request, /CollaborativeTripCapabilities/);
});

test('pre-booking capabilities reuse the existing DABRA planning page without a parallel planner', () => {
  const dabra = readFileSync(new URL('../components/dabra/DabraChatCommerce.tsx', import.meta.url), 'utf8');
  assert.equal((dabra.match(/<CollaborativeTripCapabilities phase="planning"/g) || []).length, 1);
  assert.ok(dabra.indexOf('<CollaborativeTripCapabilities') > dabra.indexOf('<DabraFamilySafetyPanel />'));
  assert.ok(dabra.includes('consumeDabraChatResponse'));
  assert.ok(dabra.includes('createPersisted'));
  assert.ok(dabra.includes('className="dabra-composer"'));
  assert.ok(dabra.includes('className="dabra-results"'));
  assert.doesNotMatch(bookings, /phase="planning"/);
});

test('new CSS is component-scoped, keeps two mobile columns and preserves header/footer/DABRA', () => {
  const ast = postcss.parse(css);
  const media = ast.nodes.find(n => n.type === 'atrule' && n.params === '(max-width:720px)');
  assert.ok(media && media.type === 'atrule');
  assert.ok(media.toString().includes('grid-template-columns:repeat(2,minmax(0,1fr))'));
  assert.ok(css.includes('min-height:104px'));
  assert.ok(css.includes('outline:3px solid #88601c'));
  assert.ok(css.includes('color:#d4af37'));
  assert.ok(source.includes('strokeWidth={1.75}'));
  assert.ok(source.includes('data-dabra-avoid'));
  assert.ok(source.includes('lang={language} dir={direction}'));
  assert.ok(css.includes('var(--font-tajawal)'));
  assert.ok(css.includes('var(--font-montserrat)'));
  for (const selector of ['.heading h2', '.dialog h3']) {
    const rule = ast.nodes.find(n => n.type === 'rule' && n.selector === selector);
    assert.ok(rule && rule.type === 'rule');
    assert.ok(rule.nodes.some(n => n.type === 'decl' && n.prop === 'font-family' && n.value === 'inherit'));
  }
  assert.doesNotMatch(css, /:global|\.header\b|\.footer\b|\.sidebar\b|#dibrah|row-reverse|scaleX/);
});
