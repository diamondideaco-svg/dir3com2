import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const page = fs.readFileSync(path.join(root, 'app', 'dabra', 'page.tsx'), 'utf8');
const component = fs.readFileSync(path.join(root, 'components', 'dabra', 'DabraChatCommerce.tsx'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'app', 'globals.css'), 'utf8');
const proxy = fs.readFileSync(path.join(root, 'proxy.ts'), 'utf8');
const chatRoute = fs.readFileSync(path.join(root, 'app', 'api', 'ai2', 'chat', 'route.ts'), 'utf8');
const chatContract = fs.readFileSync(path.join(root, 'lib', 'dabra', 'chat-response-contract.ts'), 'utf8');
const commerceState = fs.readFileSync(path.join(root, 'lib', 'dabra', 'travel-commerce-state.ts'), 'utf8');

test('DABRA page exposes the Arabic-first chat commerce surface', () => {
  assert.match(page, /DabraChatCommerce/);
  assert.match(proxy, /'\/dabra'/);
  assert.match(component, /الدبرة/);
  assert.match(component, /مساعد السفر الذكي والحارس السياحي/);
  assert.match(component, /استخدم الميكروفون/);
});

test('voice input models its states and preserves shared conversation flow', () => {
  for (const state of ['idle', 'listening', 'processing', 'error']) {
    assert.match(component, new RegExp(`\\b${state}\\b`));
  }
  assert.match(component, /SpeechRecognition/);
  assert.match(component, /messages\.map/);
  assert.match(component, /form\.set\('history', JSON\.stringify\(messages\.map/);
  assert.match(component, /recognition\.onresult/);
});

test('chat commerce surface includes tabs, quick actions, recommendation set, comparison and cart', () => {
  for (const label of ['قارن', 'أرخص', 'أريح', 'بدون توقف', 'أقرب', 'الأعلى سعرًا', 'غير التاريخ', 'شوف بدائل', 'اختصرها لي', 'اختاره لي']) {
    assert.match(component, new RegExp(label));
  }
  for (const label of ['طيران', 'فنادق', 'شقق', 'سيارات', 'باكدجات', 'رأي الدبرة', 'حقيبتك']) {
    assert.match(component, new RegExp(label));
  }
  for (const badge of ['BEST MATCH', 'BEST VALUE', 'PREMIUM']) assert.match(commerceState, new RegExp(badge));
  assert.match(component, /localStorage/);
  assert.match(component, /fetch\(`\/api\/services/);
  assert.match(component, /fetch\('\/api\/ai2\/chat'/);
  assert.match(component, /form\.set\('stream', 'true'\)/);
  assert.match(component, /consumeDabraChatResponse\(response/);
  assert.match(chatRoute, /body\?\.stream === true/);
  assert.match(chatRoute, /createDabraAssistantTextResponse\(response\)/);
  assert.match(chatContract, /response\.body\.getReader/);
  assert.match(component, /storageKey\(ownerId, 'context'\)/);
  assert.match(component, /ComparisonTable/);
});

test('responsive and accessibility hooks exist for the primary experience', () => {
  assert.match(styles, /\.dabra-layout/);
  assert.match(styles, /@media \(min-width: 700px\)/);
  assert.match(styles, /@media \(min-width: 1100px\)/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /aria-label=\{t\.conversation\}/);
  assert.match(component, /aria-label=\{t\.results\}/);
  assert.match(component, /conversation: 'DABRA conversation'/);
  assert.match(component, /results: 'Travel results'/);
  assert.match(component, /onKeyDown/);
});

test('attachment, marketplace search, filters and sorting are functional controls', () => {
  assert.match(component, /type="file"/);
  assert.match(component, /accept="image\/jpeg,image\/png,image\/webp,application\/pdf"/);
  assert.match(component, /handleAttachments/);
  assert.match(component, /MAX_ATTACHMENT_BYTES = 8 \* 1024 \* 1024/);
  assert.match(component, /multiple accept=/);
  assert.match(component, /form\.append\('attachment'/);
  assert.match(chatRoute, /validateAndNormalizeDocumentFile/);
  assert.match(chatRoute, /crypto\.subtle\.digest\('SHA-256'/);
  assert.match(component, /dabra-marketplace-query/);
  assert.match(component, /searchMarketplace\(marketplaceQuery\)/);
  assert.match(component, /setAvailabilityOnly/);
  assert.match(component, /setFavoritesOnly/);
  assert.match(component, /setResultSort/);
});

test('quick actions mutate the current result or trip state without creating a chat turn', () => {
  const start = component.indexOf('function applyQuickAction');
  const end = component.indexOf('function toggleVoice', start);
  const implementation = component.slice(start, end);
  assert.match(implementation, /setCompareMode/);
  assert.match(implementation, /setResultSort/);
  assert.match(implementation, /setNonstopOnly/);
  assert.match(implementation, /setResultLimit/);
  assert.match(implementation, /setCart/);
  assert.doesNotMatch(implementation, /sendMessage/);
});

test('voice input shares the text transcript without substituting browser speech for approved DABRA output', () => {
  assert.doesNotMatch(component, /speechSynthesis|SpeechSynthesisUtterance/);
  assert.match(component, /approvedVoiceAvailable === false/);
  assert.match(component, /playApprovedVoice/);
  assert.match(component, /fetch\('\/api\/dabra\/voice'/);
  assert.match(component, /recognition\.onresult/);
  assert.match(component, /void sendMessage\(transcript\)/);
  assert.match(component, /approvedVoiceCopy\.title/);
});

test('voice lifecycle, chat serialization and stale marketplace updates are guarded', () => {
  assert.match(component, /function stopVoiceResources/);
  assert.match(component, /recognition\.onresult = null/);
  assert.match(component, /recognition\.abort\?\.\(\)/);
  assert.match(component, /return \(\) => \{[^}]*invalidateActiveRequests\(\)/);
  assert.match(component, /voiceGeneration !== voiceGenerationRef\.current/);
  assert.match(component, /chatInFlightRef\.current/);
  assert.match(component, /chatAbortRef\.current\?\.abort\(\)/);
  assert.match(component, /requestId !== marketplaceRequestRef\.current/);
  assert.match(component, /marketplaceAbortRef\.current\?\.abort\(\)/);
  assert.match(component, /marketplaceGeneration === marketplaceRequestRef\.current/);
  assert.match(component, /setAttachments\(\[\]\)/);
  assert.match(component, /disabled=\{chatInFlight\}/);
  assert.match(styles, /\.dabra-waveform i \{ animation: none/);
  assert.match(styles, /\.dabra-voice-listening \.dabra-waveform i/);
});

test('cart reports transparent totals, missing components and verified-savings boundary', () => {
  assert.match(component, /missingTripComponents\(cart\)/);
  assert.match(component, /المكونات الناقصة/);
  assert.match(component, /التوفير لا يظهر إلا إذا كان موثقًا من المزود/);
  assert.match(component, /الضرائب والرسوم تظهر عند توفرها/);
});
