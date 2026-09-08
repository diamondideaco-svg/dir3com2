import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';

const css = readFileSync(new URL('../components/v6/v6.module.css', import.meta.url), 'utf8');
const start = '/* CEO Travel Wallet desktop round: route-contained palette only. */';
const end = '/* End Travel Wallet desktop round. */';
const block = css.slice(css.indexOf(start), css.indexOf(end) + end.length);
const scope = '.root:has(.sidebar a[href="/my-wallet"][aria-current=page])';

test('wallet palette changes only apply to the exact wallet desktop route', () => {
  assert.ok(css.includes(start));
  assert.ok(css.includes(end));
  let rules = 0;
  postcss.parse(block).walkRules(rule => {
    rules++;
    for (const selector of rule.selectors) assert.ok(selector.startsWith(scope));
    const parent = rule.parent;
    assert.ok(parent?.type === 'atrule');
    assert.equal(parent.name, 'media');
    assert.equal(parent.params, '(min-width:1051px)');
  });
  assert.ok(rules > 0);
  assert.doesNotMatch(block, /\.header|\.footer|\.customerLauncher|\.walletArt|display:|content:|url\(|row-reverse|transform:|direction:/);
});

test('light balance and action containers preserve the original Wallet artwork', () => {
  assert.ok(block.includes('.balance { background:#fff; color:var(--ink); }'));
  assert.ok(block.includes('background:#f8f9fa;'));
  assert.ok(block.includes('stroke-width:1.75;'));
  assert.ok(css.includes("background:url('/brand/v6/wallet-reference.png') 35.04% 9.04%/327.05% auto"));
});

test('wallet visual change retains financial gates, ledger truth and shortcut destinations', () => {
  const source = readFileSync(new URL('../components/v6/Wallet.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('disabled data-finance-rail="held"'));
  assert.ok(source.includes("value === undefined ? '—' : value.toFixed(2)"));
  assert.ok(source.includes('walletSpending(failed ? null : wallet?.transactions || null'));
  assert.ok(source.includes('wallet?.available'));
  assert.ok(source.includes('wallet?.held'));
  for (const label of ['Add Funds', 'Bank Transfer', 'My Cards', 'Refunds', 'Pay', 'Reports']) assert.ok(source.includes(label));
  for (const route of ['/my-bookings', '/favorites?family=stay', '/favorites?family=drive', '/favorites?family=concierge', '#wallet-summary', '#wallet-transactions']) assert.ok(source.includes(route));
});

test('wallet desktop reuses approved My Account icons while preserving mobile icons', () => {
  const source = readFileSync(new URL('../components/v6/Wallet.tsx', import.meta.url), 'utf8');
  const account = readFileSync(new URL('../components/account/MyAccountContent.tsx', import.meta.url), 'utf8');
  for (const icon of ['LuPlane', 'LuHotel', 'LuCarFront', 'LuConciergeBell', 'LuWalletCards']) {
    assert.ok(source.includes(icon));
    assert.ok(account.includes(icon));
  }
  assert.ok(source.includes("'My cars', FiTruck, LuCarFront"));
  assert.ok(source.includes('<Symbol className={styles.walletMobileIcon} aria-hidden="true" />'));
  assert.ok(source.includes('<DesktopSymbol className={styles.walletDesktopIcon} strokeWidth={1.75} aria-hidden="true" />'));
  assert.ok(css.includes('.walletDesktopIcon { display:none; }'));
  const final = css.slice(css.indexOf('/* Wallet final desktop icons'), css.indexOf('/* End Wallet final desktop icons'));
  const ast = postcss.parse(final);
  ast.walkRules(rule => {
    for (const selector of rule.selectors) assert.ok(selector.startsWith(scope));
    assert.ok(rule.parent?.type === 'atrule');
    assert.equal(rule.parent.params, '(min-width:1051px)');
  });
  assert.ok(final.includes('color:var(--gold); stroke-width:1.75;'));
  assert.doesNotMatch(final, /\.header|\.footer|\.walletArt|\.balance|row-reverse/);
});

test('wallet passes Customer Service presentation to the one existing desktop launcher', () => {
  const chrome = readFileSync(new URL('../components/v6/Chrome.tsx', import.meta.url), 'utf8');
  assert.equal((chrome.match(/<FloatingDibrah\s/g) || []).length, 1);
  assert.ok(chrome.includes("?? (path === '/my-wallet' ? { greeting: ar ? 'مرحبًا، أنا الدبرة' : \"Hi, I'm DABRA\", role: ar ? 'خدمة العملاء' : 'Customer Service' } : undefined)"));
  postcss.parse(css).walkRules(rule => {
    if (rule.selector.includes('/my-wallet')) assert.ok(!rule.selector.includes('.customerLauncher'), 'attached CEO reference requires the unchanged shared text-card launcher');
  });
  const runtime = readFileSync(new URL('../components/layout/FloatingDibrah.tsx', import.meta.url), 'utf8');
  assert.ok(runtime.includes('aria-label={t.title}'));
  assert.ok(runtime.includes('DABRA never books, pays, cancels, refunds, or performs irreversible actions on its own.'));
});

test('wallet desktop footer uses the exact approved My Bookings master declarations', () => {
  const all = postcss.parse(css);
  const master = new Map<string, string>();
  all.walkRules(rule => {
    if (rule.selector.includes('/my-bookings') && rule.selector.includes('[data-footer-')) {
      master.set(rule.selector.replaceAll('/my-bookings', '/my-wallet'), rule.nodes.map(n => n.toString()).join(';'));
    }
  });
  assert.equal(master.size, 7);
  let matched = 0;
  all.walkRules(rule => {
    if (rule.selector.includes('/my-wallet') && rule.selector.includes('[data-footer-')) {
      assert.equal(rule.nodes.map(n => n.toString()).join(';'), master.get(rule.selector));
      assert.ok(rule.parent?.type === 'atrule');
      assert.equal(rule.parent.params, '(min-width:1051px)');
      matched++;
    }
  });
  assert.equal(matched, master.size);
});
