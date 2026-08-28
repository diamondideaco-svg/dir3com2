import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { buildAI2ChatResponse } from '@/lib/ai2/runtime/chat';
import { DABRA_LOCALE_FALLBACK, parseDabraLocale } from '@/lib/dabra/locale-contract';
import { answerMatchesDabraLocale, ensureDabraResponseLocale, identifyDabraResponseLanguage } from '@/lib/dabra/response-language';
import { normalizeStayRooms } from '@/lib/services/search-state';

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

test('all active service and marketplace copy sources exclude unsupported claims in AR and EN', () => {
  const sources = [
    ['components', 'approved', 'ApprovedVisualPage.tsx'],
    ['components', 'services', 'ServicePageContent.tsx'],
    ['components', 'home', 'PlatformFoundationHome.tsx'],
    ['components', 'public', 'MarketplaceExplorer.tsx'],
    ['components', 'public', 'PublicFeatureStrip.tsx'],
    ['components', 'public', 'public-page-data.ts'],
    ['components', 'shared', 'ServiceCard.tsx'],
    ['lib', 'services', 'canonical.ts'],
    ['lib', 'marketplace', 'data.ts'],
  ].map((segments) => read(...segments));
  const source = sources.join('\n').toLowerCase();
  for (const unsupported of [
    'أفضل الأسعار', 'سائقين موثوقين', 'مختارة بعناية', 'سائقون محترفون', 'مستوى حصري',
    'best prices', 'competitive rates', 'trusted drivers', 'carefully selected', 'professional drivers',
    'premium quality', 'exclusive experiences', 'guaranteed', 'verified providers', 'licensed providers',
    'premium discovery', 'premium service', 'اكتشاف فاخر', 'خدمة مميزة', 'التجربة المميزة',
    'تجربة فاخرة نظيفة',
    '120+', '24/7', 'fast lane',
  ]) {
    assert.equal(source.includes(unsupported.toLowerCase()), false, `unsupported claim remains: ${unsupported}`);
  }
  const canonical = read('lib', 'services', 'canonical.ts');
  const component = read('components', 'services', 'ServicePageContent.tsx');
  for (const family of ['dir3 Drive', 'dir3 Stay', 'dir3 Fly', 'dir3 Concierge', 'dir3 VIP']) assert.match(canonical, new RegExp(family));
  assert.match(component, /getCanonicalService\(service\)/);
  assert.match(component, /getCanonicalService\(item\.key\)/);
});

test('Stay rooms are normalized to an integer minimum before URL construction', () => {
  assert.equal(normalizeStayRooms('0'), 1);
  assert.equal(normalizeStayRooms('-1'), 1);
  assert.equal(normalizeStayRooms(''), 1);
  assert.equal(normalizeStayRooms('NaN'), 1);
  assert.equal(normalizeStayRooms('malformed'), 1);
  assert.equal(normalizeStayRooms('1.5'), 1);
  assert.equal(normalizeStayRooms('1'), 1);
  assert.equal(normalizeStayRooms('2'), 2);

  const source = read('components', 'shared', 'ServiceSearchTable.tsx');
  assert.match(source, /submissionValues\.rooms = String\(normalizeStayRooms\(values\.rooms\)\)/);
  assert.match(source, /params\.set\(field\.name, submissionValues\[field\.name\]\)/);
});

test('approved Home hero and CTAs render from the selected AR or EN locale', () => {
  const source = read('components', 'approved', 'ApprovedVisualPage.tsx');
  assert.match(source, /const approvedHomeCopy =/);
  assert.match(source, /journey: <>من فكرة السفرة/);
  assert.match(source, /book: 'احجز الآن'/);
  assert.match(source, /explore: 'استكشف'/);
  assert.match(source, /journey: <>From planning the journey/);
  assert.match(source, /book: 'Book now'/);
  assert.match(source, /explore: 'Explore'/);
  assert.match(source, /const homeCopy = approvedHomeCopy\[language\]/);
  assert.match(source, /<p>\{homeCopy\.journey\}<\/p>/);
  assert.match(source, />\{homeCopy\.book\}<\/Link>/);
  assert.match(source, />\{homeCopy\.explore\}<\/Link>/);
});

test('dedicated journeys initialize the shared search with family-native semantics', () => {
  const source = read('components', 'shared', 'ServiceSearchTable.tsx');
  assert.match(source, /useState<ServiceDef\['key'\]>\(initialService\)/);
  const fly = source.slice(source.indexOf("key: 'fly'"), source.indexOf("key: 'concierge'"));
  for (const field of ['originCity', 'destinationCity', 'departureDate', 'returnDate', 'passengers']) assert.match(fly, new RegExp(field));
  const stay = source.slice(source.indexOf("key: 'stay'"), source.indexOf("key: 'fly'"));
  for (const field of ['city', 'checkIn', 'checkOut', 'rooms', 'guests']) assert.match(stay, new RegExp(field));
  assert.doesNotMatch(stay, /originCity|destinationCity|passengers/);
  assert.match(source, /service === 'stay' \? \{ rooms: '1' \} : \{\}/);
  assert.match(source, /params\.set\(field\.name, submissionValues\[field\.name\]\)/);
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

const response = (answer: string) => ({
  answer,
  sources: [], language: 'en' as const, groundingStatus: 'answered-general' as const,
  promptBound: true as const, promptVersion: 'dabra-character-conversation-v1' as const,
  retrievalMode: 'internal-rag' as const, provider: 'local' as const,
});

test('DABRA locale validator rejects Arabic, Russian, and Romanian in English mode', () => {
  assert.equal(answerMatchesDabraLocale('The hotel is available in Cairo.', 'en'), true);
  for (const foreign of [
    'الفندق متاح في القاهرة.',
    'Отель доступен в Каире.',
    'Un hotel bun în Cairo.',
    'Un hotel bun la Cairo.',
    'Hotel bun la Cairo.',
    'El hotel está disponible en Cairo.',
    "L'hôtel est disponible au Caire.",
    "L'hotel è disponibile al Cairo.",
    'Das Hotel ist in Kairo verfügbar.',
    'qzvxx blorf nyrt ulm qxw',
  ]) assert.equal(answerMatchesDabraLocale(foreign, 'en'), false);
});

test('short travel proper nouns and codes do not falsely trigger locale rejection', () => {
  for (const identifier of ['Riyadh', 'Cairo', 'RUH', 'CAI', 'Saudia', 'Hilton', 'Marriott', 'Hilton Riyadh', 'RUH → CAI']) {
    assert.equal(answerMatchesDabraLocale(identifier, 'ar'), true);
    assert.equal(answerMatchesDabraLocale(identifier, 'en'), true);
  }
  for (const sentence of [
    'Book Hilton Cairo for two guests.',
    'Saudia RUH to CAI is the selected route.',
    'Show Marriott Riyadh.',
  ]) assert.equal(answerMatchesDabraLocale(sentence, 'en'), true);
  for (const sentence of ['اعرض لي Hilton في Cairo.', 'رحلة Saudia من RUH إلى CAI.']) {
    assert.equal(answerMatchesDabraLocale(sentence, 'ar'), true);
  }
});

test('DABRA locale validator rejects English, Russian, and Romanian in Arabic mode', () => {
  assert.equal(answerMatchesDabraLocale('الفندق متاح في القاهرة ويمكنني عرض التفاصيل.', 'ar'), true);
  for (const foreign of [
    'I can help you compare flights and hotels for your trip.',
    'Отель доступен в Каире.',
    'Un hotel bun la Cairo.',
    'El hotel está disponible en Cairo.',
    "L'hôtel est disponible au Caire.",
  ]) assert.equal(answerMatchesDabraLocale(foreign, 'ar'), false);
});

test('language identification reports positive language evidence and fails closed on low-confidence text', () => {
  assert.equal(identifyDabraResponseLanguage('The hotel is available in Cairo.').language, 'en');
  assert.equal(identifyDabraResponseLanguage('الفندق متاح في القاهرة.').language, 'ar');
  assert.equal(answerMatchesDabraLocale('qzvxx blorf nyrt ulm qxw', 'en'), false);
});

test('response boundary performs one repair and then uses deterministic selected-locale fallback', async () => {
  const base = {
    answer: 'هذه إجابة عربية بالكامل ولا تطابق اللغة الإنجليزية المختارة.',
    sources: [], language: 'ar' as const, groundingStatus: 'answered-general' as const,
    promptBound: true as const, promptVersion: 'dabra-character-conversation-v1' as const,
    retrievalMode: 'internal-rag' as const, provider: 'local' as const,
  };
  let repairCalls = 0;
  const safe = await ensureDabraResponseLocale(base, 'en', async () => {
    repairCalls += 1;
    return response('I can help you compare the available travel options.');
  });
  assert.equal(safe.language, 'en');
  assert.equal(answerMatchesDabraLocale(safe.answer, 'en'), true);
  assert.notEqual(safe.answer, base.answer);
  assert.equal(repairCalls, 1);

  const failedEnglish = await ensureDabraResponseLocale(base, 'en', async () => {
    repairCalls += 1;
    return response('Я могу помочь вам выбрать отель.');
  });
  assert.equal(failedEnglish.answer, DABRA_LOCALE_FALLBACK.en);
  assert.equal(repairCalls, 2);
  const failedArabic = await ensureDabraResponseLocale(response('Vă pot ajuta să alegeți hotelul.'), 'ar', async () => response('Still in English.'));
  assert.equal(failedArabic.answer, DABRA_LOCALE_FALLBACK.ar);
  const reproduced = await ensureDabraResponseLocale(response('Un hotel bun la Cairo.'), 'en', async () => response('Hotel bun la Cairo.'));
  assert.equal(reproduced.answer, DABRA_LOCALE_FALLBACK.en);
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
