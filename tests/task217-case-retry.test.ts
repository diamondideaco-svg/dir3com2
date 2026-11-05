import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { CustomerCaseSession } from '../lib/contact/customer-case-session';

const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
const caseId = '33333333-3333-4333-8333-333333333333', now = '2026-11-04T00:00:00Z';
const details = { name: 'SYNTHETIC', email: 'case@example.invalid', phone: '', subject: 'service', country: 'EG', message: 'SYNTHETIC_PRIVATE_MARKER' };
const payload = JSON.stringify(details);
function deferred<T>() { let done!: (value: T) => void, fail!: (reason: Error) => void; const promise = new Promise<T>((resolve, reject) => { done = resolve; fail = reject; }); return { promise, done, fail }; }
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const identity = (userId: string) => Response.json({ identityState: 'authenticated', authenticated: true, userId });
const owned = () => Response.json({ kind: 'ready', cases: [{ reference: 'CASE-' + caseId, status: 'received', subject: 'service', country: 'EG',
  createdAt: now, updatedAt: now, events: [{ status: 'received', createdAt: now }] }], truncated: false, retrievedAt: now });
const receipt = () => Response.json({ status: 'received', reference: 'CASE-' + caseId, externalDelivery: false }, { status: 201 });

function wire() {
  let actor = a, nextIdentity: Promise<Response> | null = null, nextCases: Promise<Response> | null = null;
  const posts: { key: string; options: RequestInit; reply: ReturnType<typeof deferred<Response>> }[] = [];
  const transport: typeof fetch = async (url, options) => {
    assert.equal(options?.credentials, 'same-origin');
    if (url === '/api/dabra/session-identity') { const value = nextIdentity; nextIdentity = null; return value ?? identity(actor); }
    assert.equal(url, '/api/support/cases', 'no nonce/PII in URLs or alternate destination');
    if (options?.method !== 'POST') { const value = nextCases; nextCases = null; return value ?? owned(); }
    const key = new Headers(options.headers).get('Idempotency-Key'); assert.ok(key);
    const reply = deferred<Response>(); posts.push({ key, options, reply }); return reply.promise;
  };
  const session = new CustomerCaseSession(transport);
  return { session, posts, transport, setActor: (value: string) => { actor = value; },
    identityNext: (value: Promise<Response>) => { nextIdentity = value; }, casesNext: (value: Promise<Response>) => { nextCases = value; } };
}
type Wire = ReturnType<typeof wire>;
const submit = (w: Wire, text = payload, signal = new AbortController().signal) =>
  w.session.submitCase({ payload: text, generation: w.session.getSnapshot().generation, signal });

type Props = { children?: unknown; onSubmit?: (event: { preventDefault: () => void }) => Promise<void> };
function elements(value: unknown): ReactElement<Props>[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!isValidElement<Props>(value)) return [];
  return [value, ...elements(value.props.children)];
}
function formFixture(w: Wire, language: 'ar' | 'en', customer = true) {
  const require = createRequire(import.meta.url), slots: unknown[] = [], refs: { current: unknown }[] = [];
  let stateIndex = 0, refIndex = 0, cleanup: (() => void) | undefined, saved = 0;
  const generation = w.session.getSnapshot().generation, empty = ({ children }: Props) => children ?? null;
  const publicPosts: { url: string; options: RequestInit; reply: ReturnType<typeof deferred<Response>> }[] = [];
  const exports: { default?: (props: unknown) => ReactElement } = {};
  runInNewContext(ts.transpileModule(readFileSync('components/public/ContactPublicPage.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, crypto: globalThis.crypto, AbortController,
    fetch: (url: string, options: RequestInit) => { if (customer) return w.transport(url, options);
      const reply = deferred<Response>(); publicPosts.push({ url, options, reply }); return reply.promise; },
    require: (name: string) => ({
      react: { useState: (initial: unknown) => { const i = stateIndex++; if (!(i in slots)) slots[i] = initial;
        return [slots[i], (next: unknown) => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
        useRef: (initial: unknown) => { const i = refIndex++; return refs[i] ?? (refs[i] = { current: initial }); },
        useEffect: (effect: () => () => void) => { cleanup ??= effect(); } },
      '@/components/i18n/LanguageProvider': { useLanguage: () => ({ language }) },
      '@/components/design-system': { SectionContainer: empty, ContentContainer: empty },
      '@/components/ui/button': { Button: empty },
      '@/components/ui/card': { Card: empty, CardContent: empty, CardHeader: empty, CardTitle: empty },
      '@/components/public/PublicHero': { default: (props: { title: string }) => props.title },
    }[name] ?? require(name)),
  });
  const render = () => { stateIndex = 0; refIndex = 0; assert.ok(exports.default);
    return exports.default(customer ? { customerCase: true,
      submitCustomerCase: (request: { payload: string; signal: AbortSignal }) => w.session.submitCase({ ...request, generation }),
      onSaved: () => { saved++; } } : {}); };
  const send = () => { const form = elements(render()).find(element => element.type === 'form'); assert.ok(form?.props.onSubmit);
    return form.props.onSubmit({ preventDefault() {} }); };
  render();
  return { render, send, fill: (message = details.message) => { slots[0] = { ...details, message }; },
    cleanup: () => cleanup?.(), saved: () => saved, publicPosts };
}

for (const language of ['ar', 'en'] as const) test('retry: actual ' + language + ' form keeps unknown key across remount and edited manual retries', async () => {
  const w = wire(); await w.session.refreshIdentity();
  const first = formFixture(w, language); first.fill(); const original = first.send(); assert.equal(w.posts.length, 1);
  const key = w.posts[0].key; first.cleanup();
  const next = formFixture(w, language); next.fill('EDITED_SYNTHETIC'); const retry = next.send();
  assert.equal(w.posts.length, 2); assert.equal(w.posts[1].key, key);
  w.posts[0].reply.done(receipt()); await original; assert.equal(first.saved(), 0);
  w.posts[1].reply.done(Response.json({ code: 'CONTACT_KEY_CONFLICT' }, { status: 409 })); await retry;
  const html = renderToStaticMarkup(next.render());
  assert.match(html, language === 'ar' ? /تحديث الصفحة بالكامل|تسجيل الخروج/ : /reload the page|sign out/);
  for (const status of [400, 429]) {
    const current = next.send(); const post = w.posts.at(-1)!; assert.equal(post.key, key);
    post.reply.done(Response.json({ code: status === 400 ? 'CONTACT_INVALID' : 'CONTACT_RATE_LIMITED' }, { status })); await current;
  }
  await w.session.reload(); // A list, even containing a case, cannot acknowledge this nonce.
  const final = next.send(); const finalPost = w.posts.at(-1)!; assert.equal(finalPost.key, key);
  finalPost.reply.done(receipt()); await final; assert.equal(next.saved(), 1);
  assert.ok(!JSON.stringify(w.session.getSnapshot()).includes(key));
  assert.ok(!JSON.stringify(w.session.getSnapshot()).includes(details.message));
  next.fill('EXPLICIT_NEW_SUBMISSION'); const fresh = next.send(); const freshPost = w.posts.at(-1)!;
  assert.notEqual(freshPost.key, key); freshPost.reply.done(receipt()); await fresh;
});

test('retry: revalidation hides private state and blocks POST until same Auth AND Customer are verified', async () => {
  const w = wire(); await w.session.refreshIdentity(); const generation = w.session.getSnapshot().generation;
  const auth = deferred<Response>(), cases = deferred<Response>(); w.identityNext(auth.promise); w.casesNext(cases.promise);
  const refresh = w.session.refreshIdentity({ sameAccountRefresh: true, userId: a });
  assert.equal(w.session.getSnapshot().generation, generation); assert.equal(w.session.getSnapshot().identity, 'loading');
  assert.equal(w.session.getSnapshot().cases, null); assert.equal((await submit(w)).kind, 'inactive'); assert.equal(w.posts.length, 0);
  auth.done(identity(a)); await tick();
  assert.equal(w.session.getSnapshot().identity, 'loading'); assert.equal((await submit(w)).kind, 'inactive');
  cases.done(owned()); await refresh; assert.equal(w.session.getSnapshot().generation, generation); assert.equal(w.posts.length, 0);
  const pending = submit(w); w.posts[0].reply.done(receipt()); const result = await pending;
  assert.equal(result.kind, 'saved'); if (result.kind === 'saved') assert.equal(result.commit(), true);
});

test('retry: old completion cannot release a newer invocation, even with same actor/generation/nonce', async () => {
  const w = wire(); await w.session.refreshIdentity();
  const first = submit(w); const key = w.posts[0].key; w.posts[0].reply.done(receipt()); const stale = await first;
  assert.equal(stale.kind, 'saved');
  await w.session.refreshIdentity({ sameAccountRefresh: true, userId: a });
  const second = submit(w); assert.equal(w.posts[1].key, key);
  if (stale.kind === 'saved') assert.equal(stale.commit(), false);
  w.posts[1].reply.done(receipt()); const current = await second;
  assert.equal(current.kind, 'saved'); if (current.kind === 'saved') assert.equal(current.commit(), true);
  const third = submit(w); const newerKey = w.posts[2].key; assert.notEqual(newerKey, key);
  if (stale.kind === 'saved') assert.equal(stale.commit(), false);
  w.posts[2].reply.done(receipt()); const end = await third;
  assert.equal(end.kind, 'saved'); if (end.kind === 'saved') assert.equal(end.commit(), true);
});

test('retry: one pending Session request blocks a second mounted form without dispatch', async () => {
  const w = wire(); await w.session.refreshIdentity();
  const first = submit(w); assert.equal((await submit(w)).kind, 'busy'); assert.equal(w.posts.length, 1);
  w.posts[0].reply.done(receipt()); const result = await first;
  assert.equal(result.kind, 'saved'); if (result.kind === 'saved') assert.equal(result.commit(), true);
});

test('retry: only a valid Customer receipt releases unknown; malformed or foreign protocols retain the key', async () => {
  const w = wire(); await w.session.refreshIdentity();
  const invalid = [
    { status: 'received', reference: 'CONTACT-' + caseId, externalDelivery: false },
    { status: 'received', reference: 'CASE-invalid', externalDelivery: false },
    { status: 'received', reference: 'CASE-' + caseId, externalDelivery: true },
    { status: 'received', reference: 'CASE-' + caseId },
    { status: 'received', reference: 'CASE-' + caseId, externalDelivery: false, privateEmail: 'synthetic@example.invalid' },
  ];
  let key: string | null = null;
  for (const body of invalid) {
    const pending = submit(w); const post = w.posts.at(-1)!; key ??= post.key; assert.equal(post.key, key);
    post.reply.done(Response.json(body)); const result = await pending;
    assert.equal(result.kind, 'error'); if (result.kind === 'error') assert.equal(result.commit(), true);
  }
  const pending = submit(w); const post = w.posts.at(-1)!; assert.equal(post.key, key);
  post.reply.done(receipt()); const result = await pending;
  assert.equal(result.kind, 'saved'); if (result.kind === 'saved') assert.equal(result.commit(), true);
});

test('retry: failure/absence/changed principal clears immediately; old completion cannot bind to returning A', async () => {
  for (const fault of ['logout', 'changed', 'identity503', 'role403', 'role503', 'malformed']) {
    const w = wire(); await w.session.refreshIdentity(); const generation = w.session.getSnapshot().generation;
    const pending = submit(w); const key = w.posts[0].key; w.posts[0].reply.done(receipt()); const old = await pending;
    if (fault === 'changed') w.setActor(b);
    if (fault === 'identity503') w.identityNext(Promise.resolve(Response.json({}, { status: 503 })));
    if (fault === 'role403') w.casesNext(Promise.resolve(Response.json({}, { status: 403 })));
    if (fault === 'role503') w.casesNext(Promise.resolve(Response.json({}, { status: 503 })));
    if (fault === 'malformed') w.identityNext(Promise.resolve(Response.json({ authenticated: true, userId: 'invalid' })));
    const refresh = w.session.refreshIdentity({ sameAccountRefresh: fault !== 'logout', userId: fault === 'logout' ? null : a });
    if (fault === 'logout') assert.ok(w.session.getSnapshot().generation > generation);
    await refresh; if (old.kind === 'saved') assert.equal(old.commit(), false);
    assert.ok(w.session.getSnapshot().generation > generation);
    w.setActor(a); await w.session.refreshIdentity();
    const fresh = submit(w); const post = w.posts.at(-1)!; assert.notEqual(post.key, key);
    if (old.kind === 'saved') assert.equal(old.commit(), false);
    post.reply.done(receipt()); const result = await fresh;
    assert.equal(result.kind, 'saved'); if (result.kind === 'saved') assert.equal(result.commit(), true);
  }
});


test('retry: USER_UPDATED runs the actual page callback and hides private UI until Customer verification', async () => {
  const w = wire(), require = createRequire(import.meta.url);
  const events: { changed?: (event: string, session: { user: { id: string } }) => void } = {};
  let mounted = false, cleanup: (() => void) | undefined;
  const empty = ({ children }: Props) => children ?? null;
  const exports: { default?: () => ReactElement } = {};
  runInNewContext(ts.transpileModule(readFileSync('components/public/CustomerCasesPage.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require: (name: string) => ({
    react: { useState: () => [w.session], useSyncExternalStore: () => w.session.getSnapshot(),
      useEffect: (effect: () => () => void) => { if (!mounted) { mounted = true; cleanup = effect(); } } },
    'next/link': { default: empty },
    '@/components/i18n/LanguageProvider': { useLanguage: () => ({ language: 'en' }) },
    '@/components/design-system': { SectionContainer: empty, ContentContainer: empty },
    '@/components/ui/button': { Button: empty },
    '@/components/public/ContactPublicPage': { default: empty },
    '@/lib/contact/customer-case-session': { CustomerCaseSession },
    '@/lib/supabase/client': { supabase: { auth: { onAuthStateChange: (callback: typeof events.changed) => {
      events.changed = callback; return { data: { subscription: { unsubscribe() {} } } };
    } } } },
  }[name] ?? require(name)) });
  const render = () => { assert.ok(exports.default); return exports.default(); };
  render(); await tick(); const generation = w.session.getSnapshot().generation;
  const first = submit(w); const key = w.posts[0].key;
  const customerCheck = deferred<Response>(); w.casesNext(customerCheck.promise);
  assert.ok(events.changed); events.changed('USER_UPDATED', { user: { id: a } });
  assert.equal(w.session.getSnapshot().generation, generation);
  assert.equal(w.session.getSnapshot().identity, 'loading');
  assert.ok(!renderToStaticMarkup(render()).includes('CASE-' + caseId));
  assert.equal((await submit(w)).kind, 'inactive'); assert.equal(w.posts.length, 1);
  await tick(); assert.equal(w.session.getSnapshot().identity, 'loading');
  customerCheck.done(owned()); await tick();
  assert.equal(w.session.getSnapshot().identity, 'customer'); assert.equal(w.session.getSnapshot().generation, generation);
  w.posts[0].reply.done(receipt()); assert.equal((await first).kind, 'inactive');
  const current = submit(w); assert.equal(w.posts[1].key, key); w.posts[1].reply.done(receipt());
  const result = await current; assert.equal(result.kind, 'saved'); if (result.kind === 'saved') assert.equal(result.commit(), true);
  cleanup?.();
});

test('retry: overlapping same-account identity responses cannot clear the later verified nonce', async () => {
  const w = wire(); await w.session.refreshIdentity(); const generation = w.session.getSnapshot().generation;
  const start = submit(w); const key = w.posts[0].key; w.posts[0].reply.done(Response.json({}, { status: 503 }));
  const unknown = await start; assert.equal(unknown.kind, 'error'); if (unknown.kind === 'error') assert.equal(unknown.commit(), true);
  const staleIdentity = deferred<Response>(); w.identityNext(staleIdentity.promise);
  const firstRefresh = w.session.refreshIdentity({ sameAccountRefresh: true, userId: a });
  await w.session.refreshIdentity({ sameAccountRefresh: true, userId: a });
  staleIdentity.done(Response.json({}, { status: 503 })); await firstRefresh;
  assert.equal(w.session.getSnapshot().identity, 'customer'); assert.equal(w.session.getSnapshot().generation, generation);
  const retry = submit(w); assert.equal(w.posts[1].key, key); w.posts[1].reply.done(receipt());
  const result = await retry; assert.equal(result.kind, 'saved'); if (result.kind === 'saved') assert.equal(result.commit(), true);
});

test('retry: transport and JSON loss plus HTTP202 retain unknown; POST401 clears before malformed body', async () => {
  const w = wire(); await w.session.refreshIdentity();
  const first = submit(w); const key = w.posts[0].key; w.posts[0].reply.fail(new Error('SYNTHETIC_RESPONSE_LOST'));
  const missing = await first; assert.equal(missing.kind, 'error'); if (missing.kind === 'error') assert.equal(missing.commit(), true);
  for (const response of [new Response('{'), Response.json({ status: 'received', reference: 'CASE-' + caseId, externalDelivery: false }, { status: 202 })]) {
    const pending = submit(w); const post = w.posts.at(-1)!; assert.equal(post.key, key); post.reply.done(response);
    const result = await pending; assert.equal(result.kind, 'error'); if (result.kind === 'error') assert.equal(result.commit(), true);
  }
  const generation = w.session.getSnapshot().generation, rejected = submit(w), post = w.posts.at(-1)!;
  assert.equal(post.key, key); post.reply.done(new Response('{', { status: 401 }));
  assert.equal((await rejected).kind, 'inactive'); assert.equal(w.session.getSnapshot().identity, 'authentication_required');
  assert.ok(w.session.getSnapshot().generation > generation);
  await w.session.refreshIdentity(); const fresh = submit(w); const newPost = w.posts.at(-1)!;
  assert.notEqual(newPost.key, key); newPost.reply.done(receipt()); const result = await fresh;
  assert.equal(result.kind, 'saved'); if (result.kind === 'saved') assert.equal(result.commit(), true);
});


test('retry: public contact retains its anonymous endpoint and same-mounted-form retry behavior', async () => {
  const w = wire(), form = formFixture(w, 'en', false); form.fill();
  const first = form.send(); assert.equal(form.publicPosts.length, 1); assert.equal(w.posts.length, 0);
  const original = form.publicPosts[0]; assert.equal(original.url, '/api/contact');
  assert.equal(original.options.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(String(original.options.body)), details);
  original.reply.done(Response.json({ code: 'CONTACT_DELIVERY_UNAVAILABLE' }, { status: 503 })); await first;
  const retry = form.send(); assert.equal(form.publicPosts.length, 2);
  const next = form.publicPosts[1]; assert.equal(new Headers(next.options.headers).get('Idempotency-Key'), new Headers(original.options.headers).get('Idempotency-Key'));
  next.reply.done(Response.json({ status: 'received', reference: caseId, externalDelivery: false }, { status: 201 })); await retry;
  assert.ok(renderToStaticMarkup(form.render()).includes(caseId)); form.cleanup();
});

for (const target of ['Auth', 'Cases'] as const) test('retry: rejected ' + target + ' headers clear private authority before parsing an unusable body', async () => {
  const w = wire(); await w.session.refreshIdentity(); const generation = w.session.getSnapshot().generation;
  const first = submit(w), key = w.posts[0].key; w.posts[0].reply.done(Response.json({}, { status: 503 }));
  const unknown = await first; assert.equal(unknown.kind, 'error'); if (unknown.kind === 'error') assert.equal(unknown.commit(), true);
  const rejected = new Response('{}', { status: target === 'Auth' ? 503 : 403 }); let bodyReads = 0;
  rejected.json = async () => { bodyReads++; throw new Error('SYNTHETIC_BODY_UNAVAILABLE'); };
  if (target === 'Auth') { w.identityNext(Promise.resolve(rejected)); await w.session.refreshIdentity({ sameAccountRefresh: true, userId: a }); }
  else { w.casesNext(Promise.resolve(rejected)); await w.session.reload(); }
  assert.equal(bodyReads, 0, 'known failed identity/access must clear before reading the body');
  assert.equal(w.session.getSnapshot().identity, target === 'Auth' ? 'unavailable' : 'authentication_required');
  assert.equal(w.session.getSnapshot().cases, null); assert.ok(w.session.getSnapshot().generation > generation);
  await w.session.refreshIdentity(); const fresh = submit(w), post = w.posts.at(-1)!; assert.notEqual(post.key, key);
  post.reply.done(receipt()); const result = await fresh; assert.equal(result.kind, 'saved');
  if (result.kind === 'saved') assert.equal(result.commit(), true);
});
