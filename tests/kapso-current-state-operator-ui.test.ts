import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { createElement, isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

type Element = ReactElement<Record<string, unknown>>;
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<Record<string, unknown>>(node) ? [node, ...elements(node.props.children)] : [];
}
function load<T>(path: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const compiled = ts.transpileModule(readFileSync(new URL('../' + path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  const require = createRequire(import.meta.url);
  runInNewContext(compiled, { exports, require: (id: string) => id in dependencies ? dependencies[id] : require(id), ...globals }, { filename: path });
  return exports as T;
}
const target = {
  requestId: '10000000-0000-4000-8000-000000000001',
  outboxId: '10000000-0000-4000-8000-000000000002',
  recipientUserId: '10000000-0000-4000-8000-000000000003',
  category: 'customer.current_state', language: 'ar',
};
function response(code: string, status = 200) { return new Response(JSON.stringify({ code }), { status }); }

function fixture(send: (options: RequestInit) => Promise<Response> = async () => response('ACCEPTED_NOT_DELIVERED')) {
  const slots: unknown[] = [], refs: { current: unknown }[] = [], calls: { url: string; options: RequestInit }[] = [];
  const timers = new Map<number, () => void>(), dependencies: unknown[][] = [];
  let slot = 0, ref = 0, effect = 0, timer = 0, focuses = 0, language: 'ar' | 'en' = 'ar';
  let effects: (() => void)[] = [];
  const componentModule = load<{ default: () => ReactElement }>('components/admin/DriveCurrentStateOperator.tsx', {
    react: {
      useId: () => 'operator',
      useState: (initial: unknown) => {
        const index = slot++;
        if (!(index in slots)) slots[index] = initial;
        return [slots[index], (update: unknown) => { slots[index] = typeof update === 'function' ? update(slots[index]) : update; }];
      },
      useRef: (initial: unknown) => refs[ref++] ?? (refs[ref - 1] = { current: initial }),
      useEffect: (fn: () => void, next: unknown[]) => {
        const index = effect++;
        if (!dependencies[index] || next.some((value, i) => !Object.is(value, dependencies[index][i]))) effects.push(fn);
        dependencies[index] = next;
      },
    },
    '@/components/i18n/LanguageProvider': { useLanguage: () => ({ language }) },
  }, {
    AbortController,
    setTimeout: (fn: () => void) => { timers.set(++timer, fn); return timer; },
    clearTimeout: (id: number) => timers.delete(id),
    fetch: async (url: string, options: RequestInit) => { calls.push({ url, options }); return send(options); },
  });
  function render() {
    slot = 0; ref = 0; effect = 0; effects = [];
    const tree = componentModule.default();
    for (const node of elements(tree)) {
      if (node.type === 'p' && node.props.ref && typeof node.props.ref === 'object' && 'current' in node.props.ref) {
        node.props.ref.current = { focus: () => { focuses++; } };
      }
    }
    for (const fn of effects) fn();
    return tree;
  }
  function control(name: string) {
    const node = elements(render()).find(item => item.props.name === name); assert.ok(node, name); return node;
  }
  function change(name: string, value: string) {
    const handler = control(name).props.onChange; assert.equal(typeof handler, 'function');
    if (typeof handler === 'function') handler({ target: { value } });
  }
  function fill() { for (const [name, value] of Object.entries(target)) change(name, value); }
  async function submit() {
    const handler = elements(render()).find(node => node.type === 'form')?.props.onSubmit;
    assert.equal(typeof handler, 'function');
    if (typeof handler === 'function') await handler({ preventDefault() {} });
  }
  return { render, control, change, fill, submit, calls, timers, focuses: () => focuses, locale: (next: 'ar' | 'en') => { language = next; }, html: () => renderToStaticMarkup(render()) };
}

test('real page uses verified user and fresh CEO predicate; denied roles never receive the form', async () => {
  for (const role of ['anonymous', 'customer', 'partner', 'scoped_staff', 'nonCEO_admin', 'inactive_CEO', 'deleted_CEO', 'CEO']) {
    const user = role === 'anonymous' ? null : { id: role };
    let checked: unknown = null, verified = 0;
    const client = { auth: { getUser: async () => { verified++; return { data: { user }, error: null }; } } };
    const page = load<{ default: () => Promise<ReactElement> }>('app/admin/drive-whatsapp/current-state/page.tsx', {
      'next/navigation': { notFound: () => { throw new Error('NOT_FOUND'); } },
      '@/lib/supabase/server': { createSupabaseServerClient: async () => client },
      '@/lib/auth/team-access': { isCeoActor: async (passedClient: unknown, actor: unknown) => { assert.equal(passedClient, client); checked = actor; return role === 'CEO'; } },
      '@/components/admin/DriveCurrentStateOperator': { default: () => createElement('form', { id: 'operator' }) },
    });
    if (role === 'CEO') assert.match(renderToStaticMarkup(await page.default()), /id="operator"/);
    else await assert.rejects(page.default(), /NOT_FOUND/);
    assert.equal(verified, 1); assert.equal(checked, user);
  }
});

test('auth error fails closed before the CEO predicate or operator render', async () => {
  const page = load<{ default: () => Promise<ReactElement> }>('app/admin/drive-whatsapp/current-state/page.tsx', {
    'next/navigation': { notFound: () => { throw new Error('NOT_FOUND'); } },
    '@/lib/supabase/server': { createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'actor' } }, error: { message: 'private auth detail' } }) } }) },
    '@/lib/auth/team-access': { isCeoActor: () => assert.fail('must not authorize failed auth') },
    '@/components/admin/DriveCurrentStateOperator': { default: () => assert.fail('must not render operator') },
  });
  await assert.rejects(page.default(), /NOT_FOUND/);
});

test('actual controls render AR/EN without dispatch, real IDs or notification-language autofill', () => {
  const f = fixture();
  for (const locale of ['ar', 'en'] as const) {
    f.locale(locale); const html = f.html();
    assert.match(html, locale === 'ar' ? /dir="rtl"/ : /dir="ltr"/);
    assert.equal(f.control('requestId').props.value, '');
    assert.equal(f.control('outboxId').props.value, '');
    assert.equal(f.control('recipientUserId').props.value, '');
    assert.equal(f.control('language').props.value, 'ar');
    assert.equal(f.control('requestId').props.autoComplete, 'off');
    assert.equal(f.calls.length, 0);
    assert.doesNotMatch(html, /<script|API_KEY|WORKER_SECRET|Authorization|REQ-/);
  }
  assert.equal(fixture().calls.length, 0, 'a fresh mount never submits');
});

test('invalid actual form selectors cause no HTTP and repeated errors receive focus', async () => {
  const f = fixture(); await f.submit(); f.render(); const first = f.focuses();
  await f.submit(); f.render(); assert.equal(f.focuses(), first + 1); assert.equal(f.calls.length, 0);
  assert.match(f.html(), /role="alert"/);
});

test('actual submit sends exactly the five selectors once with same-origin transport', async () => {
  const f = fixture(); f.fill(); await f.submit();
  assert.equal(f.calls.length, 1);
  const call = f.calls[0]; assert.equal(call.url, '/api/admin/drive-whatsapp/current-state');
  assert.equal(call.options.method, 'POST'); assert.equal(call.options.credentials, 'same-origin');
  assert.equal(call.options.redirect, 'error'); assert.equal(call.options.cache, 'no-store');
  assert.deepEqual(JSON.parse(String(call.options.body)), target);
  assert.deepEqual([...new Headers(call.options.headers).keys()], ['content-type']);
  assert.equal(new Headers(call.options.headers).get('content-type'), 'application/json');
  assert.equal(new Headers(call.options.headers).get('authorization'), null);
  assert.match(f.html(), /لم يثبت وصوله/);
  await f.submit(); assert.equal(f.calls.length, 1);
});

test('synchronous double-submit lock survives pending, terminal, field edits and locale changes', async () => {
  let finish: ((value: Response) => void) | undefined;
  const f = fixture(() => new Promise<Response>(resolve => { finish = resolve; }));
  f.fill(); const first = f.submit(); await f.submit(); assert.equal(f.calls.length, 1);
  assert.equal(elements(f.render()).find(node => node.type === 'fieldset')?.props.disabled, true);
  assert.ok(finish); finish(response('UNKNOWN_DO_NOT_RETRY')); await first;
  f.change('outboxId', '10000000-0000-4000-8000-000000000004'); f.locale('en'); await f.submit();
  assert.equal(f.calls.length, 1); assert.match(f.html(), /outcome is unknown/);
  assert.equal(elements(f.render()).find(node => node.type === 'button')?.props.disabled, true);
});

test('all safe success outcomes remain terminal and never claim delivery', async () => {
  for (const code of ['ACCEPTED_NOT_DELIVERED', 'IDLE_NO_RESEND', 'NOT_SENT', 'UNKNOWN_DO_NOT_RETRY', 'FAILED_NO_RETRY']) {
    const f = fixture(async () => response(code)); f.locale('en'); f.fill(); await f.submit(); await f.submit();
    const html = f.html(); assert.equal(f.calls.length, 1); assert.doesNotMatch(html, /Successfully delivered|Delivery confirmed|تم التسليم/);
    assert.equal(elements(f.render()).find(node => node.type === 'fieldset')?.props.disabled, true);
  }
});

test('guard rejection including revocation after page load never retries or exposes raw errors', async () => {
  for (const [code, status] of [['FORBIDDEN', 403], ['ORIGIN_REJECTED', 403], ['INVALID_TARGET', 400], ['CURRENT_STATE_MODE_REQUIRED', 409], ['METHOD_NOT_ALLOWED', 405]] as const) {
    const f = fixture(async () => response(code, status)); f.fill(); await f.submit(); await f.submit();
    assert.equal(f.calls.length, 1); assert.equal(elements(f.render()).find(node => node.type === 'fieldset')?.props.disabled, true);
  }
});

test('non-OK accepted, malformed JSON, extra data and lost responses are unconfirmed without retry', async () => {
  const scenarios = [
    async () => response('ACCEPTED_NOT_DELIVERED', 500),
    async () => new Response('private provider detail'),
    async () => new Response(JSON.stringify({ code: 'ACCEPTED_NOT_DELIVERED', secret: 'private provider detail' })),
    async () => response('UNRECOGNIZED_PROVIDER_STATUS'),
    async () => { throw new Error('private provider detail'); },
  ];
  for (const send of scenarios) {
    const f = fixture(send); f.locale('en'); f.fill(); await f.submit(); await f.submit();
    assert.equal(f.calls.length, 1); assert.match(f.html(), /could not be confirmed/);
    assert.doesNotMatch(f.html(), /private provider detail|UNRECOGNIZED_PROVIDER_STATUS/);
  }
});

test('browser timeout is ambiguous, not cancellation proof, and never retries', async () => {
  const f = fixture(options => new Promise<Response>((_resolve, reject) => {
    options.signal?.addEventListener('abort', () => reject(new Error('aborted')));
  }));
  f.locale('en'); f.fill(); const pending = f.submit();
  const timeout = [...f.timers.values()][0]; assert.ok(timeout); timeout(); await pending; await f.submit();
  assert.equal(f.calls.length, 1); assert.match(f.html(), /may have started/); assert.equal(f.timers.size, 0);
});
