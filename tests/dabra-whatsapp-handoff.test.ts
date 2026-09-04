import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDabraWhatsAppHandoff, openDabraWhatsAppHandoff } from '@/lib/dabra/whatsapp-handoff';

test('Arabic DABRA handoff uses the canonical Saudi WhatsApp rail with safe context', () => {
  const handoff = buildDabraWhatsAppHandoff({
    language: 'ar', family: 'dir3-drive', publicTitle: 'JETOUR T2', city: 'الرياض',
    requestedDate: '2026-09-10', travellerCount: 2, transactionState: 'request_to_confirm', requestReference: 'req-fc5095b5',
  });
  assert.equal(handoff.available, true);
  assert.match(handoff.href ?? '', /^https:\/\/wa\.me\/966532867009\?text=/);
  assert.match(handoff.message, /المصدر: الدبرة/);
  assert.match(handoff.message, /مرجع الطلب: REQ-FC5095B5/);
  assert.match(handoff.message, /لم يتم تأكيد حجز أو دفع/);
});

test('English handoff preserves family, product, destination and truthful transaction state', () => {
  const handoff = buildDabraWhatsAppHandoff({
    language: 'en', family: 'dir3-stay', publicTitle: 'Riyadh stay', city: 'Riyadh', transactionState: 'provider_checkout',
  });
  assert.match(handoff.message, /Source: DABRA/);
  assert.match(handoff.message, /Family: Stay/);
  assert.match(handoff.message, /Service: Riyadh stay/);
  assert.match(handoff.message, /Next step: Provider checkout/);
  assert.match(handoff.message, /does not confirm a booking or payment/);
});

test('internal IDs and caller-supplied owner metadata cannot enter the handoff', () => {
  const context = {
    language: 'en' as const,
    family: 'dir3-drive' as const,
    publicTitle: 'Airport transfer',
    requestReference: '77ac72af-f743-4bc9-9b31-8556965739ba',
    ownerId: 'private-owner',
    userEmail: 'private@example.com',
  };
  const handoff = buildDabraWhatsAppHandoff(context);
  assert.doesNotMatch(handoff.message, /77ac72af|private-owner|private@example\.com/);
});

test('opening WhatsApp never reports message delivery and fails truthfully when blocked', () => {
  assert.equal(openDabraWhatsAppHandoff('https://wa.me/966532867009', () => null), 'blocked');
  const opened = { opener: 'caller' };
  assert.equal(openDabraWhatsAppHandoff('https://wa.me/966532867009', () => opened), 'opened');
  assert.equal(opened.opener, null);
});
