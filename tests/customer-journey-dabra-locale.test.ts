import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { buildAI2ChatResponse } from '@/lib/ai2/runtime/chat';
import { answerMatchesDabraLocale, enforceDabraResponseLocale, parseDabraLocale } from '@/lib/dabra/locale-contract';

const root = process.cwd();
const read = (...segments: string[]) => fs.readFileSync(path.join(root, ...segments), 'utf8');

test('header keeps Marketplace separate and sends five families to dedicated journeys in AR and EN', () => {
  const source = read('components', 'layout', 'Header.tsx');
  assert.equal((source.match(/href: '\/marketplace'/g) ?? []).length, 2);
  for (const family of ['drive', 'stay', 'fly', 'concierge', 'vip']) {
    assert.equal((source.match(new RegExp(`href: '/services/${family}'`, 'g')) ?? []).length, 2);
    assert.doesNotMatch(source, new RegExp(`href: '/marketplace\\?family=dir3-${family}'`));
  }
});

test('each canonical service journey exposes its own family-filtered Marketplace CTA', () => {
  const source = read('components', 'services', 'ServicePageContent.tsx');
  assert.match(source, /href={`\/marketplace\?family=dir3-\${service}`}/);
  assert.match(source, /Browse \${page\.eyebrow} marketplace/);
  assert.match(source, /تصفح سوق \${page\.eyebrow}/);
  assert.match(source, /<ServiceSearchTable initialService=\{service\} \/>/);
});

test('service journeys use neutral bilingual copy without unsupported commercial or verification claims', () => {
  const source = read('components', 'services', 'ServicePageContent.tsx');
  for (const unsupported of [
    'أفضل الأسعار', 'سائقين موثوقين', 'مختارة بعناية', 'سائقون محترفون', 'مستوى حصري',
    'best prices', 'competitive rates', 'trusted drivers', 'carefully selected', 'professional drivers',
    'premium quality', 'exclusive experiences', 'guaranteed', 'verified providers', 'licensed providers',
  ]) {
    assert.equal(source.toLowerCase().includes(unsupported.toLowerCase()), false, `unsupported claim remains: ${unsupported}`);
  }
  assert.match(source, /خيارات رحلات الطيران وقارن تفاصيلها/);
  assert.match(source, /Explore flight options and compare their details/);
  assert.match(source, /خيارات تنقل بسيارات خاصة مع عرض تفاصيل الخدمة/);
  assert.match(source, /Private transport options with service details shown/);
});

test('dedicated journeys initialize the shared search with family-native semantics', () => {
  const source = read('components', 'shared', 'ServiceSearchTable.tsx');
  assert.match(source, /useState<ServiceDef\['key'\]>\(initialService\)/);
  const fly = source.slice(source.indexOf("key: 'fly'"), source.indexOf("key: 'concierge'"));
  for (const field of ['originCity', 'destinationCity', 'departureDate', 'returnDate', 'passengers']) assert.match(fly, new RegExp(field));
  const stay = source.slice(source.indexOf("key: 'stay'"), source.indexOf("key: 'fly'"));
  for (const field of ['city', 'checkIn', 'checkOut', 'guests']) assert.match(stay, new RegExp(field));
  assert.doesNotMatch(stay, /originCity|destinationCity|passengers/);
  const drive = source.slice(source.indexOf("key: 'drive'"), source.indexOf("key: 'stay'"));
  for (const field of ['pickupCity', 'dropoffCity', 'pickupDate', 'passengers']) assert.match(drive, new RegExp(field));
  const concierge = source.slice(source.indexOf("key: 'concierge'"), source.indexOf("key: 'vip'"));
  for (const field of ['city', 'serviceDate', 'guests']) assert.match(concierge, new RegExp(field));
  const vip = source.slice(source.indexOf("key: 'vip'"), source.indexOf('const copy'));
  for (const field of ['city', 'tripDate', 'guests']) assert.match(vip, new RegExp(field));
});

test('DABRA client binds UI, request, history boundary, recognition, and speech to selected locale', () => {
  const source = read('components', 'dabra', 'DabraChatCommerce.tsx');
  assert.match(source, /useLanguage\(\)/);
  assert.match(source, /form\.set\('locale', language\)/);
  assert.match(source, /language === 'ar' \? 'ar-SA' : 'en-US'/);
  assert.match(source, /setMessages\(\[welcomeMessage\(language\)\]\)/);
  assert.match(source, /dir={direction} lang={language}/);
  assert.match(source, /Preparing your secure session/);
  assert.match(source, /Quick actions/);
});

test('server selected locale overrides current text and prior-history script', async () => {
  const history = [{ role: 'assistant' as const, content: 'أهلًا بك، كيف أساعدك؟' }];
  const english = await buildAI2ChatResponse('احجز وادفع لي الآن', history, undefined, 'en');
  assert.equal(english.language, 'en');
  assert.equal(answerMatchesDabraLocale(english.answer, 'en'), true);
  const arabic = await buildAI2ChatResponse('Book and pay for it now', [{ role: 'assistant', content: 'Welcome back' }], undefined, 'ar');
  assert.equal(arabic.language, 'ar');
  assert.equal(answerMatchesDabraLocale(arabic.answer, 'ar'), true);
});

test('response boundary replaces a provider answer that violates selected locale before delivery', () => {
  const base = {
    answer: 'هذه إجابة عربية بالكامل ولا تطابق اللغة الإنجليزية المختارة.',
    sources: [], language: 'ar' as const, groundingStatus: 'answered-general' as const,
    promptBound: true as const, promptVersion: 'dabra-character-conversation-v1' as const,
    retrievalMode: 'internal-rag' as const, provider: 'local' as const,
  };
  const safe = enforceDabraResponseLocale(base, 'en');
  assert.equal(safe.language, 'en');
  assert.equal(answerMatchesDabraLocale(safe.answer, 'en'), true);
  assert.notEqual(safe.answer, base.answer);
  assert.equal(parseDabraLocale('fr'), null);
});

test('Ticketmaster remains server-only preview supply and production public exposure stays gated', () => {
  const provider = read('lib', 'travel', 'ticketmaster', 'discovery.ts');
  const preview = read('lib', 'marketplace', 'real-preview.ts');
  assert.match(provider, /import 'server-only'/);
  assert.match(preview, /process\.env\.VERCEL_ENV === 'preview'/);
  assert.match(preview, /process\.env\.NODE_ENV !== 'production'/);
  assert.match(preview, /requireRealMarketplacePreview\(\)/);
  assert.match(preview, /if \(!isRealMarketplacePreviewEnabled\(\)\) notFound\(\)/);
});

test('blocked Duffel and LiteAPI records cannot surface through public preview fallback', () => {
  const preview = read('lib', 'marketplace', 'real-preview.ts');
  const client = read('components', 'public', 'RealMarketplacePreviewClient.tsx');
  assert.match(preview, /flightResult\.status === 'ok'/);
  assert.match(preview, /stayResult\.status === 'ok'/);
  assert.match(client, /Duffel · TEST SANDBOX/);
  assert.match(client, /LiteAPI · TEST SANDBOX/);
  assert.match(client, /booking and payment are unavailable here/);
});
