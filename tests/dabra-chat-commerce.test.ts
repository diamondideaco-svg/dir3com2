import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const page = fs.readFileSync(path.join(root, 'app', 'dabra', 'page.tsx'), 'utf8');
const component = fs.readFileSync(path.join(root, 'components', 'dabra', 'DabraChatCommerce.tsx'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'app', 'globals.css'), 'utf8');
const proxy = fs.readFileSync(path.join(root, 'proxy.ts'), 'utf8');

test('DABRA page exposes the Arabic-first chat commerce surface', () => {
  assert.match(page, /DabraChatCommerce/);
  assert.match(proxy, /'\/dabra'/);
  assert.match(component, /الدبرة/);
  assert.match(component, /مساعد السفر الذكي والحارس السياحي/);
  assert.match(component, /تحدث مع الدبرة/);
});

test('voice mode models every required state and preserves shared conversation flow', () => {
  for (const state of ['idle', 'listening', 'processing', 'speaking', 'muted', 'error']) {
    assert.match(component, new RegExp(`\\b${state}\\b`));
  }
  assert.match(component, /SpeechRecognition/);
  assert.match(component, /messages\.map/);
  assert.match(component, /history: messages/);
  assert.match(component, /recognition\.onresult/);
});

test('chat commerce surface includes tabs, quick actions, recommendation set, comparison and cart', () => {
  for (const label of ['قارن', 'أرخص', 'أريح', 'بدون توقف', 'أقرب', 'أفخم', 'غير التاريخ', 'شوف بدائل', 'اختصرها لي', 'اختاره لي']) {
    assert.match(component, new RegExp(label));
  }
  for (const label of ['طيران', 'فنادق', 'شقق', 'سيارات', 'باكدجات', 'BEST MATCH', 'BEST VALUE', 'PREMIUM', 'رأي الدبرة', 'حقيبتك']) {
    assert.match(component, new RegExp(label));
  }
  assert.match(component, /localStorage/);
  assert.match(component, /fetch\(`\/api\/services/);
  assert.match(component, /fetch\('\/api\/ai2\/chat'/);
  assert.match(component, /stream: true/);
  assert.match(component, /response\.body\.getReader/);
  assert.match(component, /dir3com-dabra-context/);
  assert.match(component, /ComparisonTable/);
});

test('responsive and accessibility hooks exist for the primary experience', () => {
  assert.match(styles, /\.dabra-layout/);
  assert.match(styles, /@media \(min-width: 700px\)/);
  assert.match(styles, /@media \(min-width: 1100px\)/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /aria-label="محادثة الدبرة"/);
  assert.match(component, /aria-label="نتائج السفر"/);
  assert.match(component, /onKeyDown/);
});
