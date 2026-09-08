import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import postcss from 'postcss';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Support safe margins affect only its Arabic desktop body, not the shared request shell', () => {
  const ast = postcss.parse(read('components/v6/support-desktop.module.css'));
  const rules: string[] = [];
  ast.walkRules(rule => {
    if (!rule.selector.includes('page-stack-shell')) return;
    if ((rule.parent as postcss.AtRule).params === '(max-width:720px)') return;
    rules.push(rule.selector);
    assert.ok(rule.selector.startsWith('.shell[lang=ar] > main[class~="page-stack-shell"] > section'));
    assert.equal(rule.parent?.type, 'atrule');
    assert.equal((rule.parent as postcss.AtRule).params, '(min-width:1051px)');
    assert.doesNotMatch(rule.toString(), /row-reverse|transform|height|font|color/);
  });
  assert.equal(rules.length, 3);
  const css = ast.toString();
  assert.match(css, /padding-inline:32px/);
  assert.match(css, /max-width:48rem; margin-inline:auto; text-align:start/);
  assert.match(css, /gap:12px; padding-block:8px/);
});

test('Login Success new lounge scene has no desktop footer overlay and preserves smaller layouts', () => {
  const ast = postcss.parse(read('components/v6/v6.module.css'));
  let found = 0;
  ast.walkRules(rule => {
    if (!rule.selector.includes('.footerScene:has(.welcome) > footer[data-footer-surface=image]')) return;
    if ((rule.parent as postcss.AtRule).params !== '(min-width:1051px)') return;
    if (!rule.selector.includes('::before')) return;
    found++;
    const values = Object.fromEntries(rule.nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value]));
    assert.deepEqual(values, { content: 'none', display: 'none', background: 'none', 'backdrop-filter': 'none' });
  });
  assert.equal(found, 1);
  let scenes = 0;
  ast.walkRules(rule => {
    if (!rule.toString().includes('login-success-luxury-lounge-ceo.png')) return;
    if ((rule.parent as postcss.AtRule).params === '(max-width:720px)') return;
    scenes++;
    assert.equal((rule.parent as postcss.AtRule).params, '(min-width:1051px)');
    assert.equal(rule.selector, '.root .footerScene:has(.welcome),\n  .root[dir=rtl] .footerScene:has(.welcome)');
    assert.equal(rule.nodes.length, 1);
    assert.match(rule.toString(), /center\/cover no-repeat/);
    assert.doesNotMatch(rule.toString(), /gradient|6000%|transform|filter|opacity/);
  });
  assert.equal(scenes, 1);
  assert.match(read('components/v6/welcome-desktop.module.css'), /@media\(min-width:1051px\)\s*\{[^}]*\.desktop \{ background:none; \}/);
});

test('Welcome body retains its exact source assets, signature and real navigation', () => {
  const body = read('components/v6/LoginSuccess.tsx');
  const css = read('components/v6/welcome-desktop.module.css');
  assert.match(body, /Ezhalni — إزهلني!/);
  assert.match(body, /href="\/marketplace"/);
  assert.match(body, /href=\{destination\}/);
  assert.match(css, /login-success-ceo-en\.png/);
  assert.match(css, /login-success-ceo-ar\.png/);
});
