import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { createElement, type ComponentType, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import * as copy from '../lib/i18n/customer-hub';
import { normalizeBookingStatus } from '../lib/booking/workflow-status';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../components/account/MyAccountContent.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../components/v6/v6.module.css', import.meta.url), 'utf8');
type Props = Record<string, unknown>;

function load(language: 'ar' | 'en') {
  const dependencies: Record<string, unknown> = {
    'next/link': { default: 'a' },
    '@/components/account/MarketplaceRequestsPanel': { default: 'requests-panel' },
    '@/components/i18n/LanguageProvider': { useLanguage: () => ({ language, direction: language === 'ar' ? 'rtl' : 'ltr' }) },
    '@/lib/i18n/customer-hub': copy,
    '@/lib/booking/workflow-status': { normalizeBookingStatus },
    '@/components/v6/v6.module.css': { default: new Proxy({}, { get: (_, key) => String(key) }) },
    '@/components/v6/DabraIdentity': { DabraIntroduction: 'dabra-support' },
  };
  const exports: { default?: (props: Props) => ReactElement<Props>; AccountSummaryCard?: ComponentType<Props>; bookingStatusLabels?: Record<string, [string, string]> } = {};
  runInNewContext(ts.transpileModule(source + '\nexport { AccountSummaryCard, bookingStatusLabels };', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require: (id: string) => id in dependencies ? dependencies[id] : require(id) });
  return exports as Required<typeof exports>;
}

for (const language of ['ar', 'en'] as const) {
  test(`${language}: all summary states use one presentation component without invented business records`, () => {
    const { AccountSummaryCard } = load(language);
    for (const state of ['empty', 'populated', 'error', 'unavailable']) {
      // Exercise only presentation state, not fabricated documents, bookings or money.
      const html = renderToStaticMarkup(createElement(AccountSummaryCard, {
        title: 'Summary', state, icon: 'svg', href: '/my-account', action: 'View',
      }, null));
      assert.ok(html.includes(`data-summary-state="${state}"`));
      const iconForward = state === 'empty' || state === 'unavailable';
      assert.equal(html.includes('accountSummaryEmptyIcon'), iconForward);
      assert.equal(html.includes('accountSummarySupportingIcon'), !iconForward);
      assert.equal((html.match(/<svg/g) || []).length, 1);
      assert.ok(html.includes('aria-hidden="true"'));
      assert.ok(html.includes('href="/my-account"'));
    }
  });

  test(`${language}: absent wallet data is not interpreted as zero balance or no activity`, () => {
    const { default: Account, AccountSummaryCard } = load(language);
    const tree = Account({ displayName: null, displayEmail: '', role: null, roleRaw: null, accountStatus: null, joinedAt: null, requests: [] });
    const grid = (tree.props.children as ReactElement<Props>[]).find(node => node.props?.className === 'grid accountCards')!;
    const cards = grid.props.children as ReactElement<Props>[];
    assert.equal(cards.length, 3);
    assert.ok(cards.every(card => card.type === AccountSummaryCard));
    assert.equal(cards[0].props.state, 'error');
    assert.equal(cards[1].props.state, 'unavailable');
    assert.equal(cards[2].props.state, 'empty');
    const wallet = renderToStaticMarkup(cards[1]);
    assert.ok(wallet.includes(language === 'ar' ? 'تفاصيل محفظتك وسجل رحلاتك' : 'Your wallet details and travel history'));
    assert.doesNotMatch(wallet, /balance|refund|payment|SAR|USD|رصيد|دفع|استرداد/);
  });
}

test('desktop status labels preserve authoritative values without treating unknown or REQ as confirmed', () => {
  const { bookingStatusLabels: labels } = load('en');
  assert.equal(labels.confirmed[1], 'Confirmed');
  assert.equal(labels.pending[1], 'Awaiting confirmation');
  assert.equal(labels.assigned[0], 'تم التعيين');
  assert.equal(labels['in progress'][0], 'قيد التنفيذ');
  assert.equal(labels.request, undefined);
  assert.equal(labels[''], undefined);
  assert.ok(source.includes("?.[ar ? 0 : 1] || booking.status || '—'"));
  assert.ok(css.includes('.accountSummaryDesktopStatus { display:none; }'));
  assert.ok(css.includes('.accountCards .accountSummaryMobileStatus { display:none; }'));
});

test('document and booking states derive only from existing props; no request promotion or new fetch', () => {
  assert.ok(source.includes("documents === null ? 'error' : documents.length ? 'populated' : 'empty'"));
  assert.ok(source.includes("bookingsFailed ? 'error' : booking ? 'populated' : 'empty'"));
  assert.ok(source.includes('documents.map(doc =>'));
  assert.ok(source.includes('getVerificationStatusLabel(doc.verification_status, language)'));
  assert.ok(source.includes('formatCustomerHubDate(booking.created_at, language)'));
  assert.ok(source.includes("normalizeBookingStatus(booking.status) === 'Confirmed'"));
  assert.ok(source.includes('<MarketplaceRequestsPanel requests={requests}'));
  assert.doesNotMatch(source, /fetch\(|createSupabase|useEffect|balance\s*[:=]|transactions\s*[:=]/);
});

test('new summary icon styling is desktop-only and uses one gold line-icon family', () => {
  assert.match(css, /\.accountSummaryEmptyIcon, \.accountSummarySupportingIcon \{ display:none; \}/);
  const desktop = css.slice(css.indexOf('@media(min-width:1051px) {', css.indexOf('.accountSummaryEmptyIcon')));
  assert.match(desktop, /\.accountCards \.accountSummaryMobileIcon, \.accountCards \.cardIcon \{ display:none; \}/);
  assert.match(desktop, /accountSummaryEmptyIcon \{ display:block; width:44px; height:44px; color:var\(--gold\)/);
  assert.match(desktop, /accountSummarySupportingIcon \{ display:block; width:21px; height:21px; color:var\(--gold\)/);
  for (const name of ['LuFileText', 'LuCalendarDays', 'LuWalletCards']) assert.ok(source.includes(`icon={${name}}`));
  assert.ok(source.includes('strokeWidth={1.75}'));
});
