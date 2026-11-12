import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as credentialBindingModule from '../lib/dabra/credential-binding';
import { AGENT_PROVIDER_IDS } from '../lib/dabra/agent-capabilities';
import { checkRuntimeCredentialBinding, type CredentialBindingDependencies } from '../lib/dabra/credential-binding';

// Every identity, credential and ledger value below is synthetic. No live configuration is loaded.
const key = 'SYNTHETIC-TEST-CREDENTIAL-NOT-A-REAL-KEY';
const fingerprint = createHash('sha256').update(key).digest('hex');
const sourceSha = '1'.repeat(40);
const runtime = () => ({ environment: 'production', sourceSha, databaseHostname: 'ynupwivgvwcyrsdhtkcc.supabase.co' });
function request(provider = 'deepseek', extra = '', headers: Record<string, string> = { 'sec-fetch-site': 'none' }) {
  return new Request('https://synthetic.example/api/ai2/chat?operation=credential-binding&provider=' + provider + extra, { headers });
}
function fixture(overrides: Partial<CredentialBindingDependencies> = {}) {
  const calls = { auth: 0, rpc: 0, credential: 0 };
  const dependencies: CredentialBindingDependencies = {
    authorize: async () => { calls.auth++; return 'SYNTHETIC-CEO'; },
    readBindings: async () => { calls.rpc++; return { kind: 'ok', data: {
      credentialBindings: Object.fromEntries(AGENT_PROVIDER_IDS.map(p => [p, fingerprint])),
    } }; },
    readCredential: () => { calls.credential++; return key; },
    runtime, ...overrides,
  };
  return { dependencies, calls };
}
async function body(result: Response) {
  const value: unknown = await result.json();
  assert.ok(value !== null && typeof value === 'object');
  return value;
}

test('credential binding: each allowlisted provider is checked once without model or financial authority', async () => {
  for (const provider of AGENT_PROVIDER_IDS) {
    const { dependencies, calls } = fixture();
    const result = await checkRuntimeCredentialBinding(request(provider), dependencies);
    assert.equal(result.status, 200);
    assert.deepEqual(await body(result), { status: 'MATCH', provider, sourceSha });
    assert.deepEqual(calls, { auth: 2, rpc: 1, credential: 1 });
    assert.equal(result.headers.get('cache-control'), 'private, no-store');
    assert.equal(result.headers.get('cross-origin-resource-policy'), 'same-origin');
  }
});

test('credential binding: absent and unequal references are UNBOUND and MISMATCH, never rebound', async () => {
  const missing = fixture({ readBindings: async () => ({ kind: 'ok', data: { credentialBindings: {} } }) });
  assert.deepEqual(await body(await checkRuntimeCredentialBinding(request(), missing.dependencies)),
    { status: 'UNBOUND', provider: 'deepseek', sourceSha });
  assert.equal(missing.calls.credential, 0);
  const inherited = fixture({ readBindings: async () => ({ kind: 'ok', data: {
    credentialBindings: Object.create({ deepseek: fingerprint }),
  } }) });
  assert.deepEqual(await body(await checkRuntimeCredentialBinding(request(), inherited.dependencies)),
    { status: 'UNBOUND', provider: 'deepseek', sourceSha });
  const different = fixture({ readCredential: () => 'SYNTHETIC-OTHER-CREDENTIAL' });
  assert.deepEqual(await body(await checkRuntimeCredentialBinding(request(), different.dependencies)),
    { status: 'MISMATCH', provider: 'deepseek', sourceSha });
});

test('credential binding: client selectors, duplicates, broadcast and oversized requests are rejected before authority', async () => {
  for (const input of [
    request('all'), request('unknown'), request('deepseek', '&provider=openai'),
    request('deepseek', '&keyName=OPENAI_API_KEY'), request('deepseek', '&digest=' + fingerprint),
    request('deepseek', '&url=https://attacker.invalid'), request('deepseek', '&x=' + 'x'.repeat(129)),
    request('deepseek', '', { 'sec-fetch-site': 'none', 'content-length': '1' }),
    new Request('https://synthetic.example/api/ai2/chat?operation=credential-binding&provider=deepseek',
      { method: 'POST', body: 'SYNTHETIC', headers: { 'sec-fetch-site': 'same-origin' } }),
  ]) {
    const { dependencies, calls } = fixture();
    const result = await checkRuntimeCredentialBinding(input, dependencies);
    assert.equal(result.status, 400);
    assert.deepEqual(calls, { auth: 0, rpc: 0, credential: 0 });
  }
});

test('credential binding: cross-site or unverifiable navigation cannot inspect any reference', async () => {
  const headerCases: ReadonlyArray<Record<string, string>> = [
    {}, { 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' },
    { origin: 'https://attacker.invalid', 'sec-fetch-site': 'same-origin' },
  ];
  for (const headers of headerCases) {
    const { dependencies, calls } = fixture();
    assert.equal((await checkRuntimeCredentialBinding(request('deepseek', '', headers), dependencies)).status, 403);
    assert.deepEqual(calls, { auth: 0, rpc: 0, credential: 0 });
  }
  const sameOrigin = fixture();
  assert.equal((await checkRuntimeCredentialBinding(request('deepseek', '', { origin: 'https://synthetic.example' }),
    sameOrigin.dependencies)).status, 200);
});

test('credential binding: Customer, inactive or changed authority cannot obtain a comparison', async () => {
  const absent = fixture({ authorize: async () => null });
  assert.equal((await checkRuntimeCredentialBinding(request(), absent.dependencies)).status, 403);
  assert.equal(absent.calls.rpc, 0); assert.equal(absent.calls.credential, 0);
  for (const nextActor of [null, 'SYNTHETIC-DIFFERENT-ACTOR']) {
    let count = 0;
    const changed = fixture({ authorize: async () => ++count === 1 ? 'SYNTHETIC-CEO' : nextActor });
    assert.equal((await checkRuntimeCredentialBinding(request(), changed.dependencies)).status, 403);
    assert.equal(changed.calls.credential, 0);
  }
});

test('credential binding: database failure, missing forward or malformed data are ERROR, not UNBOUND', async () => {
  for (const data of [null, {}, { credentialBindings: null }, { credentialBindings: { deepseek: 'invalid' } },
    { credentialBindings: { attacker: fingerprint } }, { credentialBindings: {}, proofs: ['SYNTHETIC-FINANCIAL-DATA'] }]) {
    const current = fixture({ readBindings: async () => ({ kind: 'ok', data }) });
    assert.deepEqual(await body(await checkRuntimeCredentialBinding(request(), current.dependencies)), { status: 'ERROR' });
    assert.equal(current.calls.credential, 0);
  }
  const failedReads: CredentialBindingDependencies['readBindings'][] = [
    async () => ({ kind: 'error' }),
    async () => { throw new Error(key + fingerprint); },
  ];
  for (const readBindings of failedReads) {
    const current = fixture({ readBindings });
    const result = await checkRuntimeCredentialBinding(request(), current.dependencies);
    assert.equal(result.status, 503);
    assert.equal(await result.text(), '{"status":"ERROR"}');
  }
});

test('credential binding: actual credential is read after the final awaited authority check', async () => {
  let currentKey = key, authorizations = 0, credentialReads = 0;
  const current = fixture({
    authorize: async () => {
      authorizations++;
      assert.equal(credentialReads, 0);
      if (authorizations === 2) currentKey = 'SYNTHETIC-ROTATED-DURING-AWAIT';
      return 'SYNTHETIC-CEO';
    },
    readCredential: () => { credentialReads++; return currentKey; },
  });
  assert.deepEqual(await body(await checkRuntimeCredentialBinding(request(), current.dependencies)),
    { status: 'MISMATCH', provider: 'deepseek', sourceSha });
  assert.equal(credentialReads, 1);
});

test('credential binding: Production source and Core project must remain genuine and stable', async () => {
  for (const changed of [
    { ...runtime(), environment: 'preview' }, { ...runtime(), sourceSha: undefined },
    { ...runtime(), sourceSha: 'untrusted' }, { ...runtime(), databaseHostname: 'synthetic-uat.supabase.co' },
  ]) {
    const current = fixture({ runtime: () => changed });
    assert.equal((await checkRuntimeCredentialBinding(request(), current.dependencies)).status, 503);
    assert.equal(current.calls.rpc, 0);
  }
  let reads = 0;
  const moved = fixture({ runtime: () => ++reads === 1 ? runtime() : { ...runtime(), sourceSha: '2'.repeat(40) } });
  assert.equal((await checkRuntimeCredentialBinding(request(), moved.dependencies)).status, 503);
  assert.equal(moved.calls.credential, 0);
});

test('credential binding: cancellation and bounded authority/RPC waits produce only closed errors', async () => {
  const keepAlive = setTimeout(() => {}, 10000);
  try {
  for (const phase of ['authority', 'rpc']) {
    const current = fixture(phase === 'authority'
      ? { authorize: () => new Promise(() => {}) }
      : { readBindings: () => new Promise(() => {}) });
    const result = await checkRuntimeCredentialBinding(request(), current.dependencies, 10);
    assert.equal(result.status, 503);
    assert.deepEqual(await body(result), { status: 'ERROR' });
    assert.equal(current.calls.credential, 0);
  }
  const abort = new AbortController(); abort.abort();
  const cancelled = new Request(request(), { signal: abort.signal });
  const current = fixture();
  assert.equal((await checkRuntimeCredentialBinding(cancelled, current.dependencies)).status, 503);
  assert.equal(current.calls.auth, 0);
  } finally { clearTimeout(keepAlive); }
});

test('credential binding: credentials, digests, actors and raw failures never enter the HTTP body', async () => {
  for (const readCredential of [() => key, () => undefined, () => { throw new Error(key + fingerprint); }]) {
    const current = fixture({ readCredential });
    const result = await checkRuntimeCredentialBinding(request(), current.dependencies);
    const text = await result.text();
    for (const privateValue of [key, fingerprint, 'SYNTHETIC-CEO', 'proofs', 'autoReload', 'balance']) {
      assert.ok(!text.includes(privateValue), privateValue);
    }
  }
});

function compileModule(path: string, require: (id: string) => unknown, environment: Record<string, string> = {}) {
  const target: { exports: Record<string, unknown> } = { exports: {} };
  runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { module: target, exports: target.exports, require, Response, Request, URL, AbortSignal,
    process: { env: environment } });
  return target.exports;
}

test('credential binding: shared resolver preserves all dispatch aliases and works without a model', () => {
  const synthetic = {
    OPENAI_API_KEY: 'SYNTHETIC-OPENAI', GOOGLE_GENERATIVE_AI_API_KEY: 'SYNTHETIC-GOOGLE',
    GEMINI_API_KEY: 'SYNTHETIC-GEMINI', ANTHROPIC_API_KEY: 'SYNTHETIC-ANTHROPIC',
    XAI_API_KEY: 'SYNTHETIC-XAI', DEEPSEEK_API_KEY: 'SYNTHETIC-DEEPSEEK',
    QWEN_API_KEY: 'SYNTHETIC-QWEN', DASHSCOPE_API_KEY: 'SYNTHETIC-DASHSCOPE', MISTRAL_API_KEY: 'SYNTHETIC-MISTRAL',
  };
  const loaded = compileModule('../lib/ai2/runtime/agent-provider-dispatch.ts', () => ({}), synthetic);
  const resolver = loaded.internalAgentCredential, configuration = loaded.internalAgentConfiguration;
  assert.equal(typeof resolver, 'function'); assert.equal(typeof configuration, 'function');
  if (typeof resolver !== 'function' || typeof configuration !== 'function') throw new Error('MISSING_EXPORT');
  for (const provider of AGENT_PROVIDER_IDS) {
    assert.equal(typeof resolver(provider), 'string');
    assert.equal(configuration(provider), null);
  }
  assert.equal(resolver('gemini'), synthetic.GOOGLE_GENERATIVE_AI_API_KEY);
  assert.equal(resolver('qwen'), synthetic.QWEN_API_KEY);
  const secondary = compileModule('../lib/ai2/runtime/agent-provider-dispatch.ts', () => ({}), {
    GEMINI_API_KEY: 'SYNTHETIC-SECONDARY-GEMINI', DASHSCOPE_API_KEY: 'SYNTHETIC-SECONDARY-QWEN',
  });
  const fallback = secondary.internalAgentCredential;
  if (typeof fallback !== 'function') throw new Error('MISSING_RESOLVER');
  assert.equal(fallback('gemini'), 'SYNTHETIC-SECONDARY-GEMINI');
  assert.equal(fallback('qwen'), 'SYNTHETIC-SECONDARY-QWEN');
});

test('credential binding: actual GET uses canonical CEO and existing null-subject read RPC only', async () => {
  const ledger = { admissions: 6, heldMicros: 61719 }, originalLedger = JSON.stringify(ledger);
  const rpcCalls: unknown[] = [], authCalls: unknown[] = [];
  const actualRoute = readFileSync(new URL('../app/api/ai2/chat/route.ts', import.meta.url), 'utf8');
  const post = actualRoute.replace(/\r\n/g, '\n').split('\n/** CEO-only, read-only diagnostic;')[0];
  // Pin the complete POST prefix for the Task237 disabled production-policy slice.
  // Only the explicit policy boundary/import was added; the GET suffix is unchanged.
  // Baseline maintenance requires independent review of that full delta; GET assertions remain active.
  assert.equal(createHash('sha256').update(post).digest('hex'), 'e807a03bf0267d31e8fa5000df1aba69b1fb7d27e1090072a3e933178cd271c6');
  const loaded = compileModule('../app/api/ai2/chat/route.ts', id => {
    if (id === '@/lib/dabra/credential-binding') return credentialBindingModule;
    if (id === '@/lib/ai2/runtime/agent-provider-dispatch') return { internalAgentCredential: () => key };
    if (id === '@/lib/auth/team-access') return { isCeoActor: async (...args: unknown[]) => { authCalls.push(args); return true; } };
    if (id === '@/lib/supabase/server') return {
      createSupabaseRequestClient: async () => ({ supabase: {}, user: { id: 'SYNTHETIC-CEO' } }),
      getSupabaseClientHostname: () => runtime().databaseHostname,
      getSupabaseAdminHostname: () => runtime().databaseHostname,
      supabaseAdmin: { rpc: (name: string, params: unknown) => {
        rpcCalls.push({ name, params });
        return { abortSignal: async () => ({ error: null, data: { credentialBindings: { deepseek: fingerprint } } }) };
      } },
    };
    const originalImports = ['next/server', '@/lib/dabra/successful-task-production-policy', '@/lib/dabra/successful-task-chat', '@/lib/dabra/platform-assistant', '@/lib/dabra/chat-response-contract',
      '@/lib/security/document-validation', '@/lib/dabra/locale-contract', '@/lib/currency/service',
      '@/lib/currency/display', '@/lib/dabra/agent-contract', '@/lib/dabra/agent-dialogue',
      '@/lib/dabra/agent-handoff', '@/lib/dabra/continuity-chat', '@/lib/dabra/conversation-renderer'];
    if (originalImports.includes(id)) return {};
    throw new Error('UNEXPECTED_ROUTE_DEPENDENCY');
  }, { VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_SHA: sourceSha });
  const get = loaded.GET;
  if (typeof get !== 'function') throw new Error('MISSING_GET');
  const result: unknown = await get(request());
  assert.ok(result instanceof Response);
  assert.deepEqual(await body(result), { status: 'MATCH', provider: 'deepseek', sourceSha });
  assert.equal(authCalls.length, 2);
  assert.equal(JSON.stringify(rpcCalls), JSON.stringify([{ name: 'get_dabra_dialogue_funding_policy', params: { p_subject_hash: null } }]));
  assert.equal(JSON.stringify(ledger), originalLedger);
});

test('credential binding: forward preserves original financial gate and ACL without a writer, seed or ledger mutation', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261103170449_task217_credential_binding_readonly.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const original = readFileSync(new URL('../supabase/migrations/20261028174710_task217_dialogue_funding_admission.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const start = original.indexOf('  IF p_subject_hash IS NULL OR'), end = original.indexOf('\nEND $$;', start);
  assert.ok(start > 0 && end > start);
  assert.ok(sql.includes(original.slice(start, end)));
  assert.match(original, /REVOKE ALL ON FUNCTION public\.get_dabra_dialogue_funding_policy\(text\) FROM PUBLIC,anon,authenticated,service_role/);
  assert.match(original, /GRANT EXECUTE ON FUNCTION public\.get_dabra_dialogue_funding_policy\(text\) TO service_role/);
  const code = sql.replace(/--[^\n]*/g, '');
  assert.doesNotMatch(code, /\b(INSERT|UPDATE|DELETE|GRANT|REVOKE|DROP)\b/i);
  assert.doesNotMatch(code, /CREATE\s+TABLE|CREATE\s+(?!OR REPLACE FUNCTION public\.get_dabra_dialogue_funding_policy)/i);
  assert.match(code, /SECURITY DEFINER SET search_path=''/);
  const diagnostic = code.slice(code.indexOf('  IF p_subject_hash IS NULL THEN'), code.indexOf('  IF p_subject_hash IS NULL OR'));
  assert.match(diagnostic, /jsonb_build_object\('credentialBindings'/);
  assert.doesNotMatch(diagnostic, /proofs|profiles|enabled|subject_hashes|max_attempt_cost_micros|daily_limits/);
  for (const provider of AGENT_PROVIDER_IDS) assert.ok(code.includes("credential_bindings ? '" + provider + "'"));
  assert.match(sql, /production_apply_authorized=false/);
});

async function bindingGetForProject(projectHostname: string | null | undefined) {
  const calls = { authority: 0, bindingRpc: 0, credential: 0 };
  const actualClient = {};
  const loaded = compileModule('../app/api/ai2/chat/route.ts', id => {
    if (id === '@/lib/dabra/credential-binding') return credentialBindingModule;
    if (id === '@/lib/ai2/runtime/agent-provider-dispatch') return { internalAgentCredential: () => { calls.credential++; return key; } };
    if (id === '@/lib/auth/team-access') return { isCeoActor: async (client: unknown) => {
      assert.equal(client, actualClient); calls.authority++; return true;
    } };
    if (id === '@/lib/supabase/server') return {
      createSupabaseRequestClient: async () => ({ supabase: actualClient, user: { id: 'SYNTHETIC-CEO' } }),
      getSupabaseClientHostname: (client: unknown) => { assert.equal(client, actualClient); return projectHostname; },
      getSupabaseAdminHostname: () => runtime().databaseHostname,
      supabaseAdmin: { rpc: () => { calls.bindingRpc++; return {
        abortSignal: async () => ({ error: null, data: { credentialBindings: { deepseek: fingerprint } } }),
      }; } },
    };
    if (['next/server', '@/lib/dabra/successful-task-production-policy', '@/lib/dabra/successful-task-chat', '@/lib/dabra/platform-assistant', '@/lib/dabra/chat-response-contract',
      '@/lib/security/document-validation', '@/lib/dabra/locale-contract', '@/lib/currency/service',
      '@/lib/currency/display', '@/lib/dabra/agent-contract', '@/lib/dabra/agent-dialogue',
      '@/lib/dabra/agent-handoff', '@/lib/dabra/continuity-chat', '@/lib/dabra/conversation-renderer'].includes(id)) return {};
    throw new Error('UNEXPECTED_ROUTE_DEPENDENCY');
  }, { VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_SHA: sourceSha,
    // This independent value deliberately disagrees with the actual client evidence.
    NEXT_PUBLIC_SUPABASE_URL: projectHostname === runtime().databaseHostname
      ? 'https://other-project.example.invalid' : 'https://' + runtime().databaseHostname });
  const get = loaded.GET;
  if (typeof get !== 'function') throw new Error('MISSING_GET');
  const result: unknown = await get(request());
  assert.ok(result instanceof Response);
  return { result, calls };
}

for (const [label, hostname] of [
  ['mismatched actual Auth/profile project', 'other-project.example.invalid'],
  ['absent actual client project evidence', null],
  ['undefined actual client project evidence', undefined],
] as const) {
  test('T217-BIND-S1 actual GET rejects ' + label + ' before authority, binding RPC or credential read', async () => {
    const { result, calls } = await bindingGetForProject(hostname);
    assert.equal(result.status, 403);
    assert.deepEqual(await body(result), { status: 'DENIED' });
    assert.deepEqual(calls, { authority: 0, bindingRpc: 0, credential: 0 });
  });
}

test('T217-BIND-S1 actual GET retains the proven Core client path despite misleading independent ENV', async () => {
  const { result, calls } = await bindingGetForProject(runtime().databaseHostname);
  assert.equal(result.status, 200);
  assert.deepEqual(await body(result), { status: 'MATCH', provider: 'deepseek', sourceSha });
  assert.deepEqual(calls, { authority: 2, bindingRpc: 1, credential: 1 });
});

test('T217-BIND-S1 client project evidence is captured from the exact cookie and bearer constructors, never later ENV or object fields', async () => {
  for (const configuredHostname of [runtime().databaseHostname, 'other-project.example.invalid']) {
    for (const mode of ['cookie', 'bearer']) {
      const constructedUrls: string[] = [];
      const construct = (url: string) => {
        constructedUrls.push(url);
        return { auth: { getUser: async () => ({ data: { user: { id: 'SYNTHETIC-CEO' } }, error: null }) } };
      };
      const environment = { NEXT_PUBLIC_SUPABASE_URL: 'https://' + configuredHostname,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'SYNTHETIC-PUBLIC-KEY' };
      const loaded = compileModule('../lib/supabase/server.ts', id => {
        if (id === '@supabase/supabase-js') return { createClient: construct };
        if (id === '@supabase/ssr') return { createServerClient: construct };
        if (id === 'next/headers') return { cookies: async () => ({ getAll: () => [], set: () => {} }) };
        throw new Error('UNEXPECTED_SERVER_DEPENDENCY');
      }, environment);
      const create = loaded.createSupabaseRequestClient, read = loaded.getSupabaseClientHostname;
      if (typeof create !== 'function' || typeof read !== 'function') throw new Error('MISSING_PROJECT_EVIDENCE_PORT');
      const auth: unknown = await create(new Request('https://synthetic.example/', {
        headers: mode === 'bearer' ? { Authorization: 'Bearer SYNTHETIC-SESSION' } : {},
      }));
      assert.ok(auth && typeof auth === 'object' && 'supabase' in auth);
      assert.deepEqual(Object.keys(auth).sort(), ['supabase', 'user']);
      assert.equal(constructedUrls.at(-1), 'https://' + configuredHostname);
      assert.equal(read(auth.supabase), configuredHostname);
      environment.NEXT_PUBLIC_SUPABASE_URL = 'https://changed-after-construction.example.invalid';
      assert.equal(read(auth.supabase), configuredHostname);
      assert.equal(read({ supabaseUrl: 'https://' + runtime().databaseHostname }), null);
      assert.equal(read({}), null);
    }
  }
});
