import test from 'node:test';
import assert from 'node:assert/strict';
import { agentIntent } from '../lib/dabra/agent-contract';
import { buildPlatformAssistantResponse, findPlatformDriveOffers, platformContext, platformEntry } from '../lib/dabra/platform-assistant';
import { conversationForLocale } from '../lib/dabra/conversation-locale';
import { platformLinkAllowed } from '../components/dabra/PlatformAnswer';
import { readFileSync } from 'node:fs';

const plan = 'Plan a Cairo trip for 2 adults from 12 to 14 October 2026 with a car and hotel. Do not book or pay.';
const arabic = 'خطط رحلة القاهرة لشخصين من ١٢ إلى ١٤ أكتوبر ٢٠٢٦ مع سيارة وفندق. لا تحجز ولا تدفع.';
for (const [locale, message] of [['en', plan], ['ar', arabic]] as const) {
  test(`${locale} negative execution constraints do not replace trip planning with support`, () => {
    assert.equal(agentIntent(message).tool, 'discover');
    const response = buildPlatformAssistantResponse(message, [], locale);
    assert.match(response.answer, /family=dir3-drive/);
    assert.match(response.answer, /family=dir3-stay/);
    const stay = new URL(platformEntry('stay', message, locale), 'https://local.invalid').searchParams;
    assert.equal(stay.get('checkIn'), '2026-10-12');
    assert.equal(stay.get('checkOut'), '2026-10-14');
    assert.equal(stay.get('adults'), '2');
    const drive = new URL(platformEntry('drive', message, locale), 'https://local.invalid').searchParams;
    assert.equal(drive.get('pickupDate'), '2026-10-12');
    assert.equal(drive.has('pickupAt'), false, 'no invented midnight');
  });
}
test('positive payment, complaint and cancellation still route to safe support', () => {
  for (const message of ['How do I pay?', 'Do not book; I need a refund', 'My payment failed', 'No payment was received', 'ادفع الآن', 'لا تحجز. أريد الغاء الطلب']) assert.equal(agentIntent(message).tool, 'support');
});
test('family follow-up preserves bounded user trip preferences but not assistant fabrications', () => {
  const context = platformContext('Show me hotels', [{ role: 'user', content: plan }, { role: 'assistant', content: 'Dubai 2027-01-01 2027-01-05 9 adults' }]);
  const params = new URL(platformEntry('stay', context, 'en'), 'https://local.invalid').searchParams;
  assert.equal(params.get('destination'), 'cairo');
  assert.equal(params.get('checkIn'), '2026-10-12');
  assert.equal(params.get('adults'), '2');
  assert.doesNotMatch(context, /Dubai|2027/);
});
test('latest explicit preferences replace earlier values including natural dates and locale change', () => {
  const context = platformContext('بدلها من 12 إلى 14 ديسمبر 2026 في الرياض 3 بالغين', [{ role: 'user', content: 'hotel Cairo 2026-10-12 2026-10-14 2 adults' }]);
  const params = new URL(platformEntry('stay', context, 'ar'), 'https://local.invalid').searchParams;
  assert.equal(params.get('destination'), 'riyadh');
  assert.equal(params.get('checkIn'), '2026-12-12');
  assert.equal(params.get('checkOut'), '2026-12-14');
  assert.equal(params.get('adults'), '3');
});
test('invalid dates and explicit new trip never resurrect old dates', () => {
  for (const message of ['hotel 2026-02-30 2026-03-02', 'hotel from 30 to 31 February 2026', 'new trip hotels Dubai']) {
    const context = platformContext(message, [{ role: 'user', content: plan }]);
    const params = new URL(platformEntry('stay', context, 'en'), 'https://local.invalid').searchParams;
    assert.equal(params.has('checkIn'), false);
    assert.equal(params.has('checkOut'), false);
  }
});
test('a new destination cannot inherit Egypt catalogue availability', () => {
  const context = platformContext('Instead in Riyadh', [{ role: 'user', content: 'car Cairo 2026-10-12 2026-10-14' }]);
  assert.equal(findPlatformDriveOffers(context).length, 0);
  assert.doesNotMatch(buildPlatformAssistantResponse('Instead in Riyadh', [{ role: 'user', content: 'car Cairo' }], 'en').answer, /matching options/);
});
test('one-room natural preference survives the hotel handoff', () => {
  for (const message of ['hotel Cairo one room', 'فندق القاهرة غرفة واحدة']) {
    const href = platformEntry('stay', message, 'en');
    assert.equal(new URL(href, 'https://local.invalid').searchParams.get('rooms'), '1');
    assert.equal(platformLinkAllowed(href), true, 'generated hotel handoff must remain clickable');
    assert.equal(platformLinkAllowed(`${href}&book=true`), false);
  }
});
test('explicit chat currency updates the existing selector and the same request', () => {
  const source = readFileSync('components/dabra/DabraChatCommerce.tsx', 'utf8');
  assert.match(source, /requestedCurrency = platformCurrency\(message\) \?\? currency/);
  assert.match(source, /setCurrency\(requestedCurrency\)/);
  assert.match(source, /form.set\('currency', requestedCurrency\)/);
});
test('locale switch preserves completed same-identity context but drops empty aborted replies', () => {
  const messages = [{ id: 'welcome', role: 'assistant' as const, text: 'Welcome' }, { id: 'u', role: 'user' as const, text: plan }, { id: 'a', role: 'assistant' as const, text: 'Catalogue' }, { id: 'pending', role: 'assistant' as const, text: '' }];
  const welcome = { id: 'welcome', role: 'assistant' as const, text: 'مرحبًا' };
  assert.deepEqual(conversationForLocale(messages, welcome), [welcome, messages[1], messages[2]]);
});
