import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import postcss from 'postcss';

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const css = postcss.parse(read('components/v6/v6.module.css'));
const rules: postcss.Rule[] = [];
css.walkRules(rule => { if (rule.selector.includes('input[id=login-email]') && (rule.parent as postcss.AtRule).params === '(min-width:1051px)') rules.push(rule); });

test('Login normalization is contained to the Login desktop shell, never mobile or other routes', () => {
  assert.ok(rules.length > 0);
  for (const rule of rules) {
    assert.ok(rule.selector.startsWith('.root:has(input[id=login-email])'));
    assert.equal(rule.parent?.type, 'atrule');
    assert.equal((rule.parent as postcss.AtRule).name, 'media');
    assert.equal((rule.parent as postcss.AtRule).params, '(min-width:1051px)');
    assert.doesNotMatch(rule.toString(), /row-reverse|scaleX|direction\s*:/);
  }
});

test('Login reuses the shared header/footer with continuous existing scene and approved column order', () => {
  const source = rules.map(rule => rule.toString()).join('\n');
  assert.match(read('components/layout/SiteShell.tsx'), /if \(pathname === '\/login'\) return <Chrome>\{children\}<\/Chrome>/);
  assert.match(source, /golden_hour_over_the_rugged_desert_canyon\.png/);
  assert.match(source, /footer\[data-customer-footer\] \{ background:transparent/);
  assert.match(source, /section:nth-child\(1\) \{ grid-column:3; grid-row:1/);
  assert.match(source, /section:nth-child\(2\) \{ grid-column:2; grid-row:1/);
  assert.match(source, /section:nth-child\(3\) \{ grid-column:1; grid-row:1/);
  assert.match(source, /:focus-visible \{ outline:3px solid/);
});

test('Login retains real form, validation, locale and OAuth contracts without invented controls', () => {
  const page = read('app/(auth)/login/page.tsx');
  assert.match(page, /<form onSubmit=\{handleEmailLogin\} noValidate>/);
  assert.match(page, /supabase.auth.signInWithPassword/);
  assert.match(page, /supabase.auth.signInWithOAuth/);
  assert.match(page, /supabase.auth.getSession/);
  assert.match(page, /getPostLoginDestination/);
  assert.match(page, /buildOAuthCallbackUrl/);
  assert.match(page, /lang=\{language\} dir=\{direction\}/);
  assert.match(page, /var\(--font-arabic\)/);
  assert.match(page, /var\(--font-latin\)/);
  assert.equal((page.match(/<input\s/g) ?? []).length, 2);
  assert.ok(page.indexOf('{loading ? t.loading : t.google}') < page.indexOf('<form onSubmit'));
  assert.ok(page.indexOf('id="login-email"') < page.indexOf('id="login-password"'));
  assert.ok(page.indexOf('</form>') < page.indexOf('href="/register"'));
});

test('Login desktop uses only the CEO-approved canyon with proportional cover and preserved overlay', () => {
  const scene = rules.find(rule => rule.selector.endsWith('> div:has(main)'));
  assert.ok(scene);
  const declarations = Object.fromEntries(scene.nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value]));
  assert.equal(declarations['background-size'], undefined);
  assert.equal(declarations['background-position'], 'center,right center');
  assert.match(declarations.background, /golden_hour_over_the_rugged_desert_canyon\.png'\) center\/cover no-repeat/);
  assert.ok(declarations.background.startsWith('linear-gradient(180deg,rgba(255,255,255,.12),rgba(13,27,42,.12) 45%,rgba(13,27,42,.68)),'));
  assert.equal((declarations.background.match(/url\(/g) ?? []).length, 1);
  const asset = readFileSync(new URL('../public/brand/runtime/golden_hour_over_the_rugged_desert_canyon.png', import.meta.url));
  assert.equal(createHash('sha256').update(asset).digest('hex'), '72ca77ae8fa6de7e83e93606eee044928c9850c59833e91638a49a3d8a46589b');
});
