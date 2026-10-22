import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { PostgrestClient } from '@supabase/postgrest-js';
import ts from 'typescript';
import type { TeamAccessGrant } from '../lib/auth/team-access';

type VNode = { type: unknown; props: Record<string, unknown> };
function nodes(value: unknown): VNode[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object' || !('type' in value) || !('props' in value)
    || !value.props || typeof value.props !== 'object') return [];
  const node = value as VNode;
  return [node, ...nodes(node.props.children)];
}

const require = createRequire(import.meta.url);
function load<T>(file: string, dependencies: Record<string, unknown>): T {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const exports = {};
  const modules: Record<string, unknown> = { 'react/jsx-runtime': require('react/jsx-runtime'), ...dependencies };
  runInNewContext(compiled, { exports, require(id: string) {
    assert.ok(Object.hasOwn(modules, id), `Uncontrolled dependency: ${id}`);
    return modules[id];
  } }, { filename: file });
  return exports as T;
}

const identity = load<typeof import('../lib/auth/identity')>('lib/auth/identity.ts', { 'server-only': {} });
const team = load<typeof import('../lib/auth/team-access')>('lib/auth/team-access.ts', {
  'server-only': {}, '@/lib/auth/identity': identity,
});
const actorId = '22222222-2222-4222-8222-222222222222';
function enquiry(status: 'received' | 'in_progress' | 'closed' = 'received') {
  return { id: '44444444-4444-4444-8444-444444444444', name: 'Synthetic contact',
    email: 'contact@example.invalid', phone: '', subject: 'Synthetic follow-up', message: 'No delivery',
    country: 'EG', status, created_at: '2026-10-22T00:00:00Z', contact_enquiry_events: [
      { id: 'event-a', status: 'received', internal_note: '', created_at: '2026-10-22T00:00:00Z' },
      { id: 'event-b', status, internal_note: 'Synthetic note', created_at: '2026-10-22T00:00:00Z' },
    ] };
}

function fixture(options: {
  authenticated?: boolean; authError?: boolean; role?: string; profileStatus?: string;
  grant?: Partial<TeamAccessGrant> | null; rows?: ReturnType<typeof enquiry>[];
} = {}) {
  const grant: TeamAccessGrant | null = options.grant === null ? null : {
    id: 'synthetic-grant', email: 'staff@example.invalid', job_title: 'Synthetic Operations',
    invited_user_id: actorId, access_level: 'scoped_staff', country_scope: ['EG'],
    permissions: ['operations:read'], status: 'active', ...options.grant,
  };
  const profile = { id: actorId, role: options.role ?? 'staff', status: options.profileStatus ?? 'active',
    deleted_at: null, full_name: 'Synthetic staff' };
  const authorityReads: string[] = [];
  let verifiedUserReads = 0;
  const identityClient = {
    auth: { getUser: async () => {
      verifiedUserReads++;
      return { data: { user: options.authenticated === false ? null : { id: actorId,
        user_metadata: { role: 'admin', permissions: ['admin:full'], country_scope: ['SA'] } } },
      error: options.authError ? { message: 'Synthetic auth failure' } : null };
    } },
    from(table: string) {
      assert.ok(['profiles', 'team_access_grants'].includes(table), table);
      authorityReads.push(table);
      const predicates: Array<[string, unknown]> = [];
      const builder = {
        select: () => builder,
        eq: (key: string, value: unknown) => { predicates.push([key, value]); return builder; },
        is: (key: string, value: unknown) => { predicates.push([key, value]); return builder; },
        async maybeSingle() {
          const row = table === 'profiles' ? profile : grant;
          const matches = row && predicates.every(([key, value]) => Reflect.get(row, key) === value);
          return { data: matches ? row : null, error: null };
        },
      };
      return builder;
    },
  };
  const requests: URL[] = [];
  // Real PostgREST serialization; only transport is synthetic. No key, SQL or network.
  const client = new PostgrestClient('https://contact.test.invalid/rest/v1', {
    fetch: async (input) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      assert.equal(url.host, 'contact.test.invalid');
      assert.equal(url.pathname, '/rest/v1/contact_enquiries');
      requests.push(url);
      return new Response(JSON.stringify(options.rows ?? [enquiry()]), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    },
  });
  const admin = load<typeof import('../lib/auth/admin')>('lib/auth/admin.ts', {
    'server-only': {}, '@/lib/auth/identity': identity, '@/lib/auth/team-access': team,
    '@/lib/supabase/server': { createSupabaseServerClient: async () => identityClient, supabaseAdmin: client },
    'next/navigation': {
      notFound() { throw new Error('NOT_FOUND'); },
      redirect(destination: string) { throw new Error(`REDIRECT:${destination}`); },
    },
  });
  const Submit = () => null;
  const action = () => { throw new Error('No live action may execute in this test'); };
  const page = load<{ default: () => Promise<unknown> }>('app/admin/operations/contact/page.tsx', {
    '@/lib/auth/admin': admin, '@/lib/auth/team-access': team,
    '@/lib/actions/contact-actions': { progressContact: action },
    '@/components/admin/AdminLocale': { AdminSubmitButton: Submit, AdminText: () => null },
  });
  return { page: page.default, admin, requests, authorityReads, Submit, action,
    verifiedUserReads: () => verifiedUserReads };
}

const deniedCases: Array<[string, Parameters<typeof fixture>[0], RegExp]> = [
  ['anonymous', { authenticated: false }, /REDIRECT:\/login\?redirect=%2Fadmin%2Foperations%2Fcontact/],
  ['auth error', { authError: true }, /REDIRECT:/],
  ['customer with forged admin metadata', { role: 'customer' }, /NOT_FOUND/],
  ['inactive canonical profile', { profileStatus: 'inactive' }, /NOT_FOUND/],
  ['missing grant', { grant: null }, /NOT_FOUND/],
  ['inactive grant', { grant: { status: 'inactive' } }, /NOT_FOUND/],
  ['another actor grant', { grant: { invited_user_id: 'different-actor' } }, /NOT_FOUND/],
  ['write permission without read', { grant: { permissions: ['operations:write'] } }, /NOT_FOUND/],
  ['empty country scope', { grant: { country_scope: [] } }, /NOT_FOUND/],
];
for (const [name, options, expected] of deniedCases) {
  test(`Contact page denies ${name} before privileged enquiry transport`, async () => {
    const f = fixture(options);
    await assert.rejects(f.page(), expected);
    assert.equal(f.verifiedUserReads(), 1);
    assert.equal(f.requests.length, 0);
  });
}

test('Contact read scope is encoded before retrieval; nested ordering is stable and independent of parent order', async () => {
  const f = fixture();
  const tree = nodes(await f.page());
  assert.equal(f.verifiedUserReads(), 1);
  assert.ok(f.authorityReads.includes('profiles') && f.authorityReads.includes('team_access_grants'));
  assert.equal(f.requests.length, 1);
  const params = f.requests[0].searchParams;
  assert.equal(params.get('order'), 'created_at.desc');
  assert.equal(params.get('contact_enquiry_events.order'), 'created_at.asc,id.asc');
  assert.equal(params.get('limit'), '100');
  const countries = params.get('country') ?? '';
  assert.match(countries, /^in\.\(/);
  for (const value of ['EG', 'Egypt', 'مصر']) assert.ok(countries.includes(value), countries);
  assert.doesNotMatch(countries, /OTHER|SA|السعودية/);
  assert.equal(tree.filter(node => node.type === 'form').length, 0, 'read-only actor cannot render mutation form');
  assert.equal(tree.filter(node => node.type === 'li').length, 2, 'history is retained');
});

test('global scope does not add a country filter; empty country helper fails before transport', async () => {
  const f = fixture({ role: 'admin', grant: { access_level: 'global_admin', country_scope: [] } });
  await f.page();
  assert.equal(f.requests[0].searchParams.has('country'), false);
  assert.throws(() => f.admin.scopeCountryQuery({}, { mode: 'country', countries: [], grant: null }),
    /COUNTRY_SCOPE_FORBIDDEN/);
  assert.equal(f.requests.length, 1);
});

test('closed enquiry has history and no transition form even for an Operations writer', async () => {
  const f = fixture({ grant: { permissions: ['operations:read', 'operations:write'] }, rows: [enquiry('closed')] });
  const tree = nodes(await f.page());
  assert.equal(tree.filter(node => node.type === 'form').length, 0);
  assert.equal(tree.filter(node => node.type === 'li').length, 2);
});

// Execute the actual shared component handlers. Hook scheduling, native form
// validation and server-action pending are controlled boundaries, not browser QA.
function buttonHarness(language: 'ar' | 'en') {
  const slots: unknown[] = [];
  let index = 0;
  let pending = false;
  let effects: Array<() => void> = [];
  const component = load<{ AdminSubmitButton: (props: Record<string, unknown>) => unknown }>(
    'components/admin/AdminLocale.tsx', {
      react: {
        useState(initial: unknown) { const i = index++; if (!(i in slots)) slots[i] = initial;
          return [slots[i], (value: unknown) => { slots[i] = value; }]; },
        useRef(initial: unknown) { const i = index++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
        useId: () => 'contact-confirmation',
        useEffect(effect: () => void, deps: unknown[]) {
          const i = index++, previous = slots[i] as unknown[] | undefined;
          if (!previous || deps.some((value, j) => value !== previous[j])) effects.push(effect);
          slots[i] = deps;
        },
      },
      'react-dom': { useFormStatus: () => ({ pending }) }, 'next/navigation': {},
      '@/components/i18n/LanguageProvider': { useLanguage: () => ({ language }) },
    });
  return {
    setPending(value: boolean) { pending = value; },
    render(props: Record<string, unknown>) {
      index = 0;
      const tree = nodes(component.AdminSubmitButton(props));
      const queued = effects; effects = []; queued.forEach(effect => effect());
      return tree;
    },
  };
}
function click(node: VNode, form?: unknown) {
  assert.equal(typeof node.props.onClick, 'function');
  let prevented = false;
  (node.props.onClick as (event: unknown) => void)({
    currentTarget: { form }, preventDefault() { prevented = true; },
  });
  return prevented;
}
function button(tree: VNode[], label?: string) {
  const node = tree.find(item => item.type === 'button' && (!label || item.props.children === label));
  assert.ok(node, `missing button ${label ?? 'submit'}`);
  return node;
}
for (const language of ['ar', 'en'] as const) for (const status of ['received', 'in_progress'] as const) {
  test(`Contact ${status} ${language}: localized confirmation, cancellation, pending and duplicate protection`, async () => {
    const f = fixture({ grant: { permissions: ['operations:read', 'operations:write'] }, rows: [enquiry(status)] });
    const tree = nodes(await f.page());
    const formNode = tree.find(node => node.type === 'form');
    assert.ok(formNode);
    assert.equal(formNode.props.action, f.action);
    const fields = nodes(formNode).filter(node => node.type === 'input');
    const field = (name: string) => fields.find(node => node.props.name === name)?.props.value;
    assert.equal(field('id'), enquiry().id);
    assert.equal(field('expected'), status);
    assert.equal(field('status'), status === 'received' ? 'in_progress' : 'closed');
    assert.equal(tree.find(node => node.type === 'textarea')?.props.maxLength, 2000);
    const control = tree.find(node => node.type === f.Submit);
    assert.ok(control, 'page must use the shared audited submit control');
    assert.equal(tree.some(node => node.type === 'button'), false, 'no raw bypass submit button');
    const label = language === 'ar'
      ? (status === 'received' ? 'بدء المتابعة' : 'إغلاق المتابعة')
      : (status === 'received' ? 'Start follow-up' : 'Close follow-up');
    const confirmation = language === 'ar' ? control.props.confirmAr : control.props.confirmEn;
    assert.ok(typeof confirmation === 'string' && confirmation.length > 0);
    const h = buttonHarness(language), render = () => h.render(control.props);
    let submissions = 0;
    const form = { reportValidity: () => true, requestSubmit() { submissions++; } };
    assert.equal(button(render()).props.children, label);
    assert.equal(click(button(render()), form), true);
    assert.equal(submissions, 0, 'opening confirmation does not submit');
    const dialog = render();
    assert.equal(dialog.find(node => node.type === 'section')?.props.dir, language === 'ar' ? 'rtl' : 'ltr');
    assert.equal(dialog.find(node => node.type === 'h2')?.props.children, confirmation);
    click(button(dialog, language === 'ar' ? 'إلغاء' : 'Cancel'));
    assert.equal(render().some(node => node.type === 'dialog'), false);
    assert.equal(submissions, 0);
    click(button(render()), form);
    click(button(render(), language === 'ar' ? 'تأكيد' : 'Confirm'));
    assert.equal(submissions, 1);
    assert.equal(click(button(render()), form), true, 'same-tick second submit is blocked');
    assert.equal(submissions, 1);
    h.setPending(true);
    assert.equal(button(render()).props.disabled, true);
    assert.equal(button(render()).props.children, language === 'ar' ? 'جارٍ التنفيذ…' : 'Working…');
    assert.equal(click(button(render()), form), true);
    h.setPending(false);
    assert.equal(button(render()).props.disabled, false);
  });
}
