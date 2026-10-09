import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { DRIVE_OFFERS } from '../lib/drive/catalog';
import { platformEntry } from '../lib/dabra/platform-assistant';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/ai2/chat/route';

type Formatter = { approvedDestination(raw: string): string | null; formatWhatsAppAnswer(answer: string, limit: number): string };
const require = createRequire(import.meta.url);
const before = require('./fixtures/kapso/task186-whatsapp-formatter-before.cjs') as Formatter;
const after = require('../scripts/kapso/task186-whatsapp-formatter.cjs') as Formatter;
const origin = 'https://www.dir3com.com';
const href = '/marketplace?family=dir3-drive&language=en&destination=cairo&pickup=cairo';
const link = (destination: string, label = 'اختيار السيارة') => `[${label}](${destination})`;

test('reproduces the actual query-allowlist defect with unchanged passing controls', () => {
  assert.equal(before.formatWhatsAppAnswer(link(href), 1000), 'اختيار السيارة');
  assert.equal(before.formatWhatsAppAnswer(link(`${href}&offer=safeerat-eg-nissan-sunny`), 1000), 'اختيار السيارة');
  for (const destination of ['/support', '/marketplace?family=dir3-drive&language=en']) {
    assert.equal(after.formatWhatsAppAnswer(link(destination), 1000), before.formatWhatsAppAnswer(link(destination), 1000));
  }
});

test('preserves Cairo preferences and all 30 published Drive offer identities', () => {
  assert.equal(after.approvedDestination(href), `${origin}/marketplace?family=dir3-drive&destination=cairo&pickup=cairo`);
  assert.equal(after.approvedDestination(origin + href), after.approvedDestination(href));
  assert.equal(DRIVE_OFFERS.length, 30);
  for (const offer of DRIVE_OFFERS) {
    const destination = after.approvedDestination(`${href}&offer=${offer.id}`);
    assert.equal(destination, `${origin}/marketplace?family=dir3-drive&destination=cairo&pickup=cairo&offer=${offer.id}`);
  }
  assert.equal(after.approvedDestination('/marketplace?family=dir3-stay&destination=cairo'), `${origin}/marketplace?family=dir3-stay&destination=cairo`);
});

test('actual Web POST to local Workflow formatter returns intact HTTPS in AR/EN without network or sends', async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('Network forbidden'); };
  try {
    for (const locale of ['ar', 'en'] as const) {
      for (const message of ['car Cairo', 'Nissan Sunny Cairo']) {
        // Same body as actual task186-egypt-envelope-observer; no channel field.
        const response = await POST(new NextRequest(`${origin}/api/ai2/chat`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, locale, stream: false, history: [] }),
        }));
        assert.equal(response.status, 200);
        const payload = await response.json();
        assert.match(payload.answer, /\]\(\/marketplace\?/); // Web wire format remains unchanged.
        assert.equal(payload.agent.mutations, 0);
        const body = after.formatWhatsAppAnswer(payload.answer, 1000);
        assert.match(body, /https:\/\/www\.dir3com\.com\/marketplace\?family=dir3-drive&destination=cairo&pickup=cairo/);
        assert.doesNotMatch(body, /\]\(\/marketplace/);
        if (message.startsWith('Nissan')) assert.match(body, /&offer=safeerat-eg-nissan-sunny(?:\s|$)/);
        assert.ok(body.length <= 1000);
      }
    }
    assert.equal(calls, 0);
  } finally { globalThis.fetch = previous; }
});

test('rejects hostile origins, paths, duplicate and unknown queries, and invalid/family-mismatched values', () => {
  const destinations = [
    'https://evil.invalid' + href, 'http://www.dir3com.com' + href, '//www.dir3com.com' + href,
    'https://www.dir3com.com@evil.invalid' + href, 'https://www.dir3com.com:443' + href,
    '/marketplace/../marketplace?family=dir3-drive', '/%6darketplace?family=dir3-drive',
    '/\\marketplace?family=dir3-drive', href + '#fragment', href + '\n',
    href + '&redirect=evil', href + '&offer=not-published', href + '&offer=safeerat-eg-nissan-sunny&offer=safeerat-eg-nissan-sunny',
    '/marketplace?family=dir3-drive&destination=evil.invalid', '/marketplace?family=dir3-drive&destination=dubai',
    '/marketplace?family=dir3-drive&destination=%63airo', '/marketplace?family=dir3-drive&pickup=Cairo',
    '/marketplace?family=dir3-stay&pickup=cairo', '/marketplace?family=dir3-stay&offer=safeerat-eg-nissan-sunny',
    '/marketplace?family=dir3-drive&language=fr', '/marketplace?family=dir3-drive&family=dir3-stay',
  ];
  for (const destination of destinations) {
    assert.equal(after.approvedDestination(destination), null, destination);
    assert.equal(after.formatWhatsAppAnswer(link(destination, 'Open'), 1000), 'Open');
  }
});

test('keeps raw URL removal, image handling, Arabic joining and Unicode behavior unchanged', () => {
  for (const answer of [
    'Open https://www.dir3com.com/marketplace?family=dir3-drive', 'https://evil.invalid',
    'h\u200bttps://evil.invalid', 'evil。invalid/path', '![Photo](/marketplace?family=dir3-drive)',
    'العربية\u200d 😀 👨‍👩‍👧‍👦 140.25 2/3', '[evi](javascript:alert(1))l.invalid',
  ]) assert.equal(after.formatWhatsAppAnswer(answer, 1000), before.formatWhatsAppAnswer(answer, 1000));
});

test('1000-character limits keep new query URLs atomic and truncation marker on a separate line', () => {
  const url = after.approvedDestination(`${href}&offer=safeerat-eg-nissan-sunny`)!;
  const answer = link(`${href}&offer=safeerat-eg-nissan-sunny`, 'Choose') + '\n' + 'x'.repeat(1200);
  for (let limit = 0; limit <= 1100; limit++) {
    const result = after.formatWhatsAppAnswer(answer, limit);
    assert.ok(result.length <= limit, `limit ${limit}`);
    if (result.includes('https:')) assert.ok(result.includes(url), `partial URL at limit ${limit}`);
    assert.doesNotMatch(result, /sunny…/);
    assert.doesNotMatch(result, /[\ud800-\udbff]$/);
  }
  const boundary = after.formatWhatsAppAnswer(answer, ('Choose\n' + url + '\n').length + 1);
  assert.equal(boundary, 'Choose\n' + url + '\n…');
});

test('date and currency variants are explicitly outside this observed-query patch rather than silently stripped', () => {
  const dated = platformEntry('drive', 'car Cairo 2026-12-12 2026-12-14', 'en');
  assert.match(dated, /pickupDate=2026-12-12/);
  assert.equal(after.approvedDestination(dated), null);
  assert.equal(after.approvedDestination(href + '&currency=USD'), null);
});
