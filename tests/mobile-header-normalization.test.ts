import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';
const css = readFileSync(new URL('../components/v6/customer-chrome.module.css', import.meta.url), 'utf8');
const ast = postcss.parse(css);
const mobile = ast.nodes.find(n => n.type === 'atrule' && n.name === 'media' && n.params === '(max-width:720px)');
assert.ok(mobile && mobile.type === 'atrule');
const declarations = (selector: string) => {
  const rule = mobile.nodes?.find(n => n.type === 'rule' && n.selector === selector);
  assert.ok(rule && rule.type === 'rule', selector);
  return Object.fromEntries(rule.nodes.filter(n => n.type === 'decl').map(n => [n.prop, n.value]));
};

test('compact phone header uses two natural rows without a fixed oversized height', () => {
  const header = declarations('.header');
  assert.equal(header.display, 'grid');
  assert.equal(header.height, undefined);
  assert.equal(header['min-height'], '118px');
  assert.equal(header['grid-template-rows'], 'minmax(61px,auto) minmax(44px,auto)');
  assert.equal(declarations('.tools').display, 'contents');
  assert.equal(declarations('.languages')['flex-wrap'], 'nowrap');
});

test('home label stays one line and retains 44px touch height and readable font', () => {
  const home = declarations('.tools > .home');
  assert.equal(home['white-space'], 'nowrap');
  assert.equal(home.height, '44px');
  assert.equal(home['font-size'], '14px');
  assert.equal(home.padding, '8px 12px');
  assert.equal(home['max-width'], '100%');
  assert.equal(home['grid-column'], '1/-1');
});

test('utility slots are stable with or without the existing Customer menu', () => {
  assert.equal(declarations('.header')['grid-template-columns'], 'minmax(0,1fr) repeat(3,44px)');
  assert.equal(declarations('.tools > button[aria-controls]')['grid-column'], '2');
  assert.equal(declarations('.tools > button:nth-last-of-type(2)')['grid-column'], '3');
  assert.equal(declarations('.tools > button:last-of-type')['grid-column'], '4');
  assert.equal(declarations('.languages')['grid-column'], '1');
  assert.equal(declarations('.languages')['grid-row'], '2');
  assert.equal(declarations('.tools > button').width, '44px');
});

test('locale containment is header-only and the approved logo is scaled proportionally', () => {
  assert.equal(declarations('.header:has(.languages button[lang=ar][aria-pressed=true])').direction, 'rtl');
  assert.equal(declarations('.header:has(.languages button[lang=en][aria-pressed=true])').direction, 'ltr');
  assert.equal(declarations('.header > .logo').width, '154px');
  assert.equal(declarations('.header > .logo').height, '61px');
  const logo = declarations('.header > .logo img');
  assert.ok(Math.abs(parseFloat(logo.width) / parseFloat(logo.height) - 253.3 / 168.9) < 0.001);
  const section = mobile.toString().split('.footer {')[0];
  assert.doesNotMatch(section, /row-reverse|scaleX|overflow:hidden|font-size:1[0-3]px/);
  assert.doesNotMatch(section, /\.root|\bbody\b|\.welcome|\.portal|\.sidebar/);
});

test('the shared component retains both real labels, arrows and utility callbacks', () => {
  const source = readFileSync(new URL('../components/v6/CustomerChrome.tsx', import.meta.url), 'utf8');
  for (const text of ['العودة إلى الرئيسية', 'Back to home', 'FiArrowRight', 'FiArrowLeft', 'onClick={onLarge}', 'onClick={onAppearance}', "setLanguage('ar')", "setLanguage('en')", '{menu}']) assert.ok(source.includes(text));
});
