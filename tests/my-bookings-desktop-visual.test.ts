import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';

const css = readFileSync(new URL('../components/v6/v6.module.css', import.meta.url), 'utf8');
const start = '/* CEO My Bookings desktop round: route-contained presentation only. */';
const end = '/* End My Bookings desktop round. */';
const block = css.slice(css.indexOf(start), css.indexOf(end) + end.length);
const root = postcss.parse(block);
const scope = '.root:has(.sidebar a[href="/my-bookings"][aria-current=page])';

test('My Bookings normalization cannot apply to another route or mobile', () => {
  assert.ok(css.includes(start));
  assert.ok(css.includes(end));
  let rules = 0;
  root.walkRules(rule => {
    rules++;
    assert.ok(rule.selector.startsWith(scope));
    const parent = rule.parent;
    assert.ok(parent?.type === 'atrule');
    assert.equal(parent.name, 'media');
    assert.equal(parent.params, '(min-width:1051px)');
  });
  assert.ok(rules > 0);
  assert.doesNotMatch(block, /\.header|\.customerLauncher|\.accountDashboard|\.welcome|display:\s*none|content:/);
});

test('My Bookings uses the approved white footer, gold active state and existing three columns', () => {
  assert.ok(block.includes('.sidebar [aria-current=page] { background:var(--gold); color:var(--ink);'));
  assert.ok(block.includes('footer[data-footer-surface=white] { background:#fff; color:var(--ink); }'));
  assert.ok(block.includes('section:nth-child(1) { grid-column:3; grid-row:1; }'));
  assert.ok(block.includes('section:nth-child(2) { grid-column:2; grid-row:1; }'));
  assert.ok(block.includes('section:nth-child(3) { grid-column:1; grid-row:1; }'));
  assert.doesNotMatch(block, /row-reverse|scaleX|background-image|url\(/);
});

test('spacing treatment leaves tab, search, request and booking behavior intact', () => {
  const source = readFileSync(new URL('../components/v6/Bookings.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('onClick={() => setTab(key)}'));
  assert.ok(source.includes('onChange={e => setSearch(e.target.value)}'));
  assert.ok(source.includes('aria-pressed={tab === key}'));
  assert.ok(source.includes('<MarketplaceRequestsPanel requests={requests}'));
  assert.ok(source.includes("data-confirmed={status === 'Confirmed'}"));
  assert.ok(block.includes('.requestSummary:not(:has(a)) > div { padding:12px 20px; }'));
  assert.ok(block.includes('.toolbar label { width:min(100%,420px); }'));
});

test('calendar belongs only to the empty branch and is invisible on mobile', () => {
  const source = readFileSync(new URL('../components/v6/Bookings.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('})}</div> : <div className={styles.empty}><FiCalendar className={styles.bookingsEmptyIcon} aria-hidden="true" />'));
  assert.ok(css.includes('.bookingsEmptyIcon { display:none; }'));
  assert.ok(block.includes('.bookingsEmptyIcon { display:block; width:40px; height:40px;'));
});

test('one existing launcher receives Concierge presentation only on the exact My Bookings route', () => {
  const chrome = readFileSync(new URL('../components/v6/Chrome.tsx', import.meta.url), 'utf8');
  assert.equal((chrome.match(/<FloatingDibrah\s/g) || []).length, 1);
  assert.ok(chrome.includes("desktopIdentity={(path === '/my-bookings' ?"));
  assert.ok(chrome.includes("greeting: ar ? 'مرحبًا، أنا الدبرة' : \"Hi, I'm DABRA\", role: ar ? 'الكونسيرج' : 'Concierge' } : undefined"));
  const runtime = readFileSync(new URL('../components/layout/FloatingDibrah.tsx', import.meta.url), 'utf8');
  assert.ok(runtime.includes('desktopIdentity={desktopIdentity}'));
  assert.equal((runtime.match(/id="dibrah"/g) || []).length, 1);
  assert.ok(runtime.includes('body: JSON.stringify({ message: trimmed, history: historyForRequest, locale: micLanguage })'));
  assert.doesNotMatch(runtime.slice(runtime.indexOf('const sendDraft'), runtime.indexOf('\n  return (', runtime.indexOf('const sendDraft'))), /desktopIdentity/);
  assert.ok(runtime.includes('DABRA never books, pays, cancels, refunds, or performs irreversible actions on its own.'));
  assert.ok(runtime.includes('launcherIdentity ?? <span'));
});

test('contextual identity appears only at approved phone/desktop breakpoints; other-route identity remains intact', () => {
  const identity = readFileSync(new URL('../components/layout/FloatingDibrahIdentity.module.css', import.meta.url), 'utf8');
  assert.ok(identity.includes('.context > .desktop { display:none; }'));
  const ast = postcss.parse(identity);
  ast.walkDecls('display', declaration => {
    if (declaration.value !== 'none') {
      const media = declaration.parent?.parent;
      assert.ok(media?.type === 'atrule');
      assert.ok(['(min-width:1051px)', '(max-width:720px)'].includes(media.params));
    }
  });
  ast.walkDecls(declaration => {
    assert.ok(!['position', 'background', 'width', 'height', 'transform'].includes(declaration.prop));
  });
});
