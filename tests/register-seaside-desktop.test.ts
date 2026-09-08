import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import postcss from 'postcss';

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const css = postcss.parse(read('app/(auth)/register/register.module.css'));
const desktop: postcss.AtRule[] = [];
css.walkAtRules('media', node => { if (node.params === '(min-width:1051px)') desktop.push(node); });

test('Register seaside treatment only changes desktop background and footer, not panel or hero', () => {
  assert.equal(desktop.length, 1);
  const selectors: string[] = [];
  desktop[0].walkRules(rule => { selectors.push(rule.selector); });
  assert.ok(selectors.every(selector => selector === '.stage' || selector.includes('.canonicalFooter')));
  assert.doesNotMatch(desktop[0].toString(), /row-reverse|scaleX|direction:|\.panel|\.hero|\.header/);
  assert.match(desktop[0].toString(), /background-position:center; background-size:cover/);
});

test('Register uses the exact unmodified CEO attachment as its desktop background', () => {
  const asset = readFileSync(new URL('../public/brand/runtime/register-seaside-ceo-approved.png', import.meta.url));
  assert.equal(createHash('sha256').update(asset).digest('hex'), 'c8efc8bb7c1ef81c9efb16a478d48fa61e88b716416cc94b208c443a410aa639');
  assert.match(desktop[0].toString(), /url\('\/brand\/runtime\/register-seaside-ceo-approved\.png'\)/);
  assert.match(read('app/(auth)/register/register.module.css'), /\.stage \{[^}]*dir3com-login-background-approved\.png/);
});

test('Register reuses shared transparent Footer Master in contact/services/company reading order', () => {
  const page = read('app/(auth)/register/page.tsx');
  assert.match(page, /<CustomerHeader /);
  assert.match(page, /<CustomerFooter surface="image" className=\{styles.canonicalFooter\}/);
  const local = desktop[0].toString();
  for (const [section, column] of [[1, 3], [2, 2], [3, 1]]) {
    assert.ok(local.includes(`section:nth-child(${section}) { grid-column:${column}; grid-row:1; }`));
  }
  assert.doesNotMatch(local, /background-color:|background:\s*(?:#|black|white|navy)/);
});
