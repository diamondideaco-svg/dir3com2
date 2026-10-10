import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as locale from '../lib/i18n/config';
import * as catalog from '../lib/drive/catalog';
import * as record from '../lib/drive/record';
import * as state from '../lib/drive/request';
import { isMarketplaceRequestReference } from '../lib/marketplace/customer-requests';
import { getPostLoginDestination } from '../lib/auth/redirect';

type Element = { type: unknown; props: Record<string, unknown> };
type PageProps = { params: Promise<{ reference: string }>; searchParams: Promise<{ language?: string | string[] }> };
const reference = 'REQ-00000192';
const owner = '00000000-0000-4000-8000-000000000001';
const jsx = (type: unknown, props: Record<string, unknown>): Element => ({ type, props });
function load(path: string, modules: Record<string, unknown>) {
  const exports: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, URL, require(name: string) { assert.ok(name in modules, name); return modules[name]; } });
  return exports;
}
function page(user: string | null = owner, found = true) {
  const filters: Record<string, unknown> = {};
  let reads = 0;
  const query = { select() { return query; }, eq(key: string, value: unknown) { filters[key] = value; return query; },
    async maybeSingle() { return { data: found ? { request_reference: reference } : null, error: null }; } };
  const db = { auth: { getUser: async () => ({ data: { user: user ? { id: user } : null } }) },
    from(name: string) { reads++; assert.equal(name, 'marketplace_requests'); return query; } };
  const subject = load('app/my-requests/[reference]/drive/page.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/navigation': { notFound() { throw new Error('NOT_FOUND'); }, redirect(url: string) { throw new Error(`REDIRECT:${url}`); } },
    '@/lib/supabase/server': { createSupabaseServerClient: async () => db },
    '@/lib/marketplace/customer-requests': { isMarketplaceRequestReference },
    '@/lib/drive/record': record, '@/lib/i18n/config': locale,
    '@/components/drive/DriveRequestReview': { default: 'request-review' },
  });
  return { render: subject.default as (props: PageProps) => Promise<Element>, filters, reads: () => reads };
}
function props(language?: string | string[]): PageProps {
  return { params: Promise.resolve({ reference }), searchParams: Promise.resolve({ language }) };
}
const fixture: record.DriveRequestRecord = {
  id: '00000000-0000-4000-8000-000000000192', request_reference: reference,
  drive_offer_id: 'safeerat-eg-nissan-sunny', status: 'awaiting_customer_acceptance',
  quote_amount: 150, quote_currency: 'USD', quote_expires_at: '2099-01-11T12:00:00Z',
  drive_request_context: { country: 'EG', supplier_amount: 66, supplier_currency: 'USD', version: 2,
    confirmed_vehicle: 'Isolated vehicle', confirmed_vehicle_year: null, customer_accepted_at: null,
    trip: { mode: 'chauffeur', pickup: 'Cairo', dropoff: 'Giza', pickupAt: '2099-01-12T12:00', returnAt: '2099-01-13T12:00',
      passengers: 2, luggage: 1, currency: 'USD', name: 'Isolated QA', phone: '+10000000001', acknowledged: true,
      flightNumber: '', flightArrival: '', specialRequest: '', notes: '', minimumModelYear: null, acceptableModelYears: null } },
};
function review(preference: locale.AppLanguage, explicit?: locale.AppLanguage) {
  const subject = load('components/drive/DriveRequestReview.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    react: { useState: (value: unknown) => [typeof value === 'function' ? value() : value, () => undefined],
      useActionState: () => ['', () => undefined, false], useEffect: () => undefined },
    'next/image': { default: 'img' }, 'next/navigation': { useRouter: () => ({ refresh() {} }) },
    '@/app/my-requests/[reference]/drive/actions': { acceptDriveQuote: () => assert.fail('No customer acceptance in rendering tests') },
    '@/components/i18n/LanguageProvider': { useLanguage: () => ({ language: preference, direction: locale.languageDirection(preference) }) },
    '@/lib/i18n/config': locale, '@/lib/drive/catalog': catalog, '@/lib/drive/record': record, '@/lib/drive/request': state,
    './DriveMarketplace': { DriveInclusions: 'inclusions' }, './drive.module.css': { default: {} },
  });
  return (subject.default as (props: { request: record.DriveRequestRecord; notificationLanguage?: locale.AppLanguage }) => Element)
    ({ request: fixture, notificationLanguage: explicit });
}
function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join(' ');
  if (node && typeof node === 'object' && 'props' in node) return text((node as Element).props.children);
  return typeof node === 'string' || typeof node === 'number' ? String(node) : '';
}

for (const language of ['ar', 'en'] as const) {
  test(`notification ${language} is read by owned page and retained through server login-next`, async () => {
    const authenticated = page(); const view = await authenticated.render(props(language));
    assert.equal(view.props.notificationLanguage, language);
    assert.deepEqual(authenticated.filters, { request_reference: reference, user_id: owner });
    const anonymous = page(null); const destination = `/my-requests/${reference}/drive?language=${language}`;
    await assert.rejects(anonymous.render(props(language)), (error: Error) => {
      assert.ok(error.message.startsWith('REDIRECT:'));
      const redirect = new URL(error.message.slice('REDIRECT:'.length), 'https://qa.example.invalid');
      assert.equal(redirect.pathname, '/login'); assert.equal(redirect.searchParams.get('next'), destination);
      assert.equal(getPostLoginDestination(redirect.searchParams.get('next')), destination); return true;
    });
    assert.equal(anonymous.reads(), 0);
  });
  for (const preference of ['ar', 'en'] as const) {
    test(`notification ${language} quote render overrides ${preference} cookie/storage context before and after hydration`, () => {
      // Execute the actual review component with both pre-hydration/default and post-storage contexts.
      // No browser/layout or real authentication proof is claimed by these component regressions.
      const expected = text(review(language));
      for (const context of [locale.DEFAULT_LANGUAGE, preference]) {
        const rendered = review(context, language);
        assert.equal(rendered.props.lang, language); assert.equal(rendered.props.dir, locale.languageDirection(language));
        assert.equal(text(rendered), expected);
        if (language === 'en') { assert.match(text(rendered), /Final quote review/); assert.match(text(rendered), /not a booking/); }
      }
    });
  }
  test(`anonymous proxy retains ${language} notification query through login routing`, () => {
    const subject = load('proxy.ts', { 'next/server': { NextResponse: {
      next: () => ({ kind: 'next' }), redirect: (url: URL) => url,
    } } });
    const url = new URL(`https://qa.example.invalid/my-requests/${reference}/drive?language=${language}`);
    const result = (subject.proxy as (request: unknown) => URL)({ nextUrl: url, url: url.toString(), cookies: { getAll: () => [] } });
    assert.equal(getPostLoginDestination(result.searchParams.get('next')), url.pathname + url.search);
  });
}
test('invalid/duplicate language falls back to current preference and cannot change ownership', async () => {
  for (const language of [undefined, 'fr', 'EN', 'en&user_id=other', ['ar', 'en']]) {
    const authenticated = page(); const view = await authenticated.render(props(language));
    assert.equal(view.props.notificationLanguage, undefined); assert.equal(authenticated.filters.user_id, owner);
  }
  for (const preference of ['ar', 'en'] as const) {
    const rendered = review(preference); assert.equal(rendered.props.lang, preference); assert.equal(rendered.props.dir, locale.languageDirection(preference));
  }
  await assert.rejects(page(owner, false).render(props('en')), /NOT_FOUND/);
});
