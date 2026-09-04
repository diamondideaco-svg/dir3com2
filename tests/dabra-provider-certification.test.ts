import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { Worker } from 'node:worker_threads';

import {
  appendPrivateManifest,
  assertHardeningEvidence,
  buildProbePlan,
  CERTIFICATION_PROVIDERS,
  createIsolatedCanonicalProbe,
  HARDENING_MIGRATION_IDENTITY,
  invokeWithProbeBounds,
  LIVE_CONFIRMATION,
  main,
  MAX_HTTP_CALLS_PER_PROBE,
  MAX_LOGICAL_PROBES,
  parseCertificationArgs,
  runLiveCertification,
  sanitizeCertificationError,
  validateLiveExecution,
  validatePrivateManifestPath,
  type CertificationDependencies,
  type CertificationProvider,
  type ManifestRecord,
  type ProbeExecution,
} from '@/scripts/dabra-provider-certification';

const repositoryRoot = resolve(new URL('..', import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1)));

const validHardeningEvidence = {
  target_table: 'public.dabra_provider_attempts',
  migration_identity: HARDENING_MIGRATION_IDENTITY,
  migration_applied: true,
  service_role_select: true,
  service_role_insert: true,
  service_role_update: false,
  service_role_delete: false,
  service_role_truncate: false,
  service_role_references: false,
  service_role_trigger: false,
  service_role_maintain: false,
  service_role_column_mutation_absent: true,
  service_role_set_role_safe: true,
  service_role_role_membership_safe: true,
  anonymous_authenticated_set_role_safe: true,
  anonymous_authenticated_role_membership_safe: true,
  table_acl_exact: true,
  column_acl_absent: true,
  rls_enabled: true,
  force_rls_enabled: true,
} as const;

function completedProbe(result: Awaited<ProbeExecution['result']>, httpCalls = 1): ProbeExecution {
  return {
    result: Promise.resolve(result),
    terminate: async () => undefined,
    httpCalls: () => httpCalls,
  };
}

function successfulDependencies(overrides: Partial<CertificationDependencies> = {}) {
  const manifests: ManifestRecord[] = [];
  let lastPersisted: Record<string, unknown> | null = null;
  const dependencies: CertificationDependencies = {
    readHardeningEvidence: async () => validHardeningEvidence,
    startProbe: () => completedProbe({ ok: true, model: 'canonical-test-model', inputTokens: 2, outputTokens: 1 }),
    persistAttempt: async (input) => {
      lastPersisted = {
        attempt_id: `attempt-${String(input.requestId)}`,
        request_id: input.requestId,
        provider: input.provider,
        model: input.model ?? null,
        intent_class: input.intentClass,
        language: input.language,
        route: input.route,
        success: input.success,
        error_category: input.errorCategory ?? null,
        fallback_from: null,
        fallback_reason: null,
        fallback_hop: input.fallbackHop,
        input_tokens: input.inputTokens ?? null,
        output_tokens: input.outputTokens ?? null,
        grounding_status: input.groundingStatus,
      };
      return lastPersisted;
    },
    readBack: async () => lastPersisted ? [lastPersisted] : [],
    appendManifest: (_path, record) => { manifests.push(record); },
    now: (() => { let value = Date.parse('2026-09-04T21:00:00.000Z'); return () => value += 10; })(),
    uuid: (() => { let value = 0; return () => `00000000-0000-4000-8000-${String(++value).padStart(12, '0')}`; })(),
    sleep: async () => undefined,
    classifyError: (error, status) => status === 503 ? 'upstream_503' : (error === 'timeout' ? 'timeout' : 'provider_error'),
    ...overrides,
  };
  return { dependencies, manifests, getLastPersisted: () => lastPersisted };
}

test('default CLI mode is a zero-call, zero-write dry run', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const originalWrite = process.stdout.write;
  let fetchCalls = 0;
  let output = '';
  globalThis.fetch = (async () => { fetchCalls += 1; return new Response(); }) as typeof fetch;
  process.stdout.write = ((chunk: string | Uint8Array) => { output += String(chunk); return true; }) as typeof process.stdout.write;
  try {
    assert.equal(await main([]), 0);
  } finally {
    globalThis.fetch = originalFetch;
    process.stdout.write = originalWrite;
  }
  assert.equal(fetchCalls, 0);
  assert.deepEqual(JSON.parse(output), {
    mode: 'DRY_RUN', provider: 'all', logicalProbes: 28,
    providerCalls: 0, databaseWrites: 0, certificationCredit: false,
  });
});

test('live execution fails closed unless explicit intent and exact target all agree', () => {
  const base = parseCertificationArgs([
    '--live', '--provider=openai', '--target-project-ref=expectedref',
    `--confirm-live=${LIVE_CONFIRMATION}`, '--manifest=C:\\private\\evidence.jsonl',
  ]);
  assert.throws(() => validateLiveExecution(base, {
    DABRA_PROVIDER_CERTIFICATION_LIVE: LIVE_CONFIRMATION,
    SUPABASE_URL: 'https://differentref.supabase.co',
    SUPABASE_PROJECT_REF: 'expectedref',
    SUPABASE_SERVICE_ROLE_KEY: 'present-not-printed',
  }, repositoryRoot), /target_project_ref_mismatch/);
  assert.throws(() => validateLiveExecution({ ...base, confirmation: null }, {
    SUPABASE_URL: 'https://expectedref.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'present-not-printed',
  }, repositoryRoot), /live_confirmation_missing/);
});

test('all-provider plan is exactly four direct probes per provider, two per language', () => {
  const plan = buildProbePlan('all');
  assert.equal(plan.length, MAX_LOGICAL_PROBES);
  for (const provider of CERTIFICATION_PROVIDERS) {
    const selected = plan.filter((probe) => probe.provider === provider);
    assert.equal(selected.length, 4);
    assert.equal(selected.filter((probe) => probe.language === 'ar').length, 2);
    assert.equal(selected.filter((probe) => probe.language === 'en').length, 2);
  }
});

test('live runner invokes each selected adapter once and proves one exact telemetry row', async () => {
  const calls = new Map<CertificationProvider, number>();
  const fixture = successfulDependencies({
    startProbe: (provider) => {
      calls.set(provider, (calls.get(provider) ?? 0) + 1);
      return completedProbe({ ok: true, model: `${provider}-actual`, inputTokens: 2, outputTokens: 1 });
    },
  });
  const result = await runLiveCertification(parseCertificationArgs(['--live']), fixture.dependencies, 'private.jsonl');
  assert.equal(result.passed, true);
  assert.equal(result.probes.length, 28);
  assert.equal(new Set(result.probes.map((probe) => probe.request_id)).size, 28);
  assert.ok(result.probes.every((probe) => probe.classification === 'DIRECT' && probe.persistence_confirmed));
  for (const provider of CERTIFICATION_PROVIDERS) assert.equal(calls.get(provider), 4);
});

test('read-back retries do not rerun providers, and missing or mismatched rows fail', async () => {
  let providerCalls = 0;
  let reads = 0;
  const fixture = successfulDependencies({
    startProbe: () => {
      providerCalls += 1;
      return completedProbe({ ok: true, model: 'model' });
    },
    readBack: async () => {
      reads += 1;
      return reads % 3 === 0 && fixture.getLastPersisted() ? [fixture.getLastPersisted()!] : [];
    },
  });
  const retried = await runLiveCertification(parseCertificationArgs(['--live', '--provider=openai']), fixture.dependencies, 'private.jsonl');
  assert.equal(retried.passed, true);
  assert.equal(providerCalls, 4);
  assert.equal(reads, 12);

  const mismatch = successfulDependencies({
    readBack: async () => [{ ...(mismatch.getLastPersisted() ?? {}), provider: 'gemini' }],
  });
  const failed = await runLiveCertification(parseCertificationArgs(['--live', '--provider=openai']), mismatch.dependencies, 'private.jsonl');
  assert.equal(failed.passed, false);
  assert.ok(failed.probes.every((probe) => !probe.persistence_confirmed && probe.observability_row_id === null));
});

test('per-probe watchdog terminates work and freezes retry-capable call count', async () => {
  let httpCalls = 0;
  let terminated = false;
  const worker = new Worker(`
    const { parentPort } = require('node:worker_threads');
    setInterval(() => parentPort.postMessage('http_call'), 1);
  `, { eval: true });
  const firstCall = new Promise<void>((resolveFirst) => {
    worker.on('message', () => {
      httpCalls += 1;
      resolveFirst();
    });
  });
  await firstCall;
  const execution: ProbeExecution = {
    result: new Promise(() => undefined),
    terminate: async () => {
      terminated = true;
      await worker.terminate();
    },
    httpCalls: () => httpCalls,
  };
  await assert.rejects(invokeWithProbeBounds(execution, 5), /probe_watchdog_timeout/);
  assert.equal(terminated, true);
  const callsAfterTeardown = httpCalls;
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 15));
  assert.equal(httpCalls, callsAfterTeardown, 'no retry may start after watchdog teardown completes');

  const overBudget: ProbeExecution = {
    result: Promise.reject(new Error('provider_http_call_limit_exceeded')),
    terminate: async () => undefined,
    httpCalls: () => MAX_HTTP_CALLS_PER_PROBE,
  };
  await assert.rejects(invokeWithProbeBounds(overBudget), /provider_http_call_limit_exceeded/);
});

test('canonical probe worker starts and terminates without provider IO when credentials are absent', async () => {
  const original = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const bounded = await invokeWithProbeBounds(
      createIsolatedCanonicalProbe('openai', 'en', 'Offline worker boundary check.'),
      5_000,
    );
    assert.equal(bounded.result.ok, false);
    assert.equal(bounded.result.errorCategory, 'missing_key');
    assert.equal(bounded.httpCalls, 0);
  } finally {
    if (original === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = original;
  }
});

test('target-derived hardening evidence fails closed before probes or telemetry writes', async () => {
  let starts = 0;
  let writes = 0;
  const invalid = successfulDependencies({
    readHardeningEvidence: async () => ({ ...validHardeningEvidence, migration_applied: false }),
    startProbe: () => { starts += 1; return completedProbe({ ok: true }); },
    persistAttempt: async () => { writes += 1; return {}; },
  });
  await assert.rejects(
    runLiveCertification(parseCertificationArgs(['--live', '--provider=openai']), invalid.dependencies, 'private.jsonl'),
    /production_hardening_evidence_invalid/,
  );
  assert.equal(starts, 0);
  assert.equal(writes, 0);

  assert.throws(
    () => assertHardeningEvidence({ ...validHardeningEvidence, target_table: 'public.other_table' }),
    /production_hardening_evidence_invalid/,
  );
  assert.doesNotThrow(() => assertHardeningEvidence(validHardeningEvidence));
});

test('read-back exception leaves one allowlisted failure record without rerunning provider', async () => {
  let providerCalls = 0;
  const fixture = successfulDependencies({
    startProbe: () => {
      providerCalls += 1;
      return completedProbe({ ok: true, model: 'known-model' });
    },
    readBack: async () => { throw new Error('credential=https://secret.invalid?token=raw'); },
  });
  await assert.rejects(
    runLiveCertification(parseCertificationArgs(['--live', '--provider=openai']), fixture.dependencies, 'private.jsonl'),
    /persistence_verification_failed/,
  );
  assert.equal(providerCalls, 1);
  assert.equal(fixture.manifests.length, 1);
  assert.deepEqual(fixture.manifests[0], {
    provider: 'openai',
    request_id: '00000000-0000-4000-8000-000000000001',
    language: 'ar',
    timestamp: '2026-09-04T21:00:00.040Z',
    actual_model: 'known-model',
    http_invocation_confirmed: true,
    status_category: 'persistence_verification_failed',
    latency_ms: 10,
    persistence_confirmed: false,
    observability_row_id: null,
    classification: 'DIRECT',
  });
  assert.equal(JSON.stringify(fixture.manifests).includes('secret.invalid'), false);
});

test('terminal error sanitizer exposes only stable certification codes', () => {
  assert.equal(sanitizeCertificationError(new Error('probe_watchdog_timeout')), 'probe_watchdog_timeout');
  assert.equal(sanitizeCertificationError(new Error('provider_configuration_missing:gemini')), 'provider_configuration_missing:gemini');
  assert.equal(
    sanitizeCertificationError(new Error('401 https://provider.invalid?api_key=secret raw-response-body')),
    'certification_failed',
  );
});

test('private JSONL manifest is append-only and contains only the approved allowlist', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dabra-certification-'));
  const path = join(directory, 'evidence.jsonl');
  try {
    const validated = validatePrivateManifestPath(path, repositoryRoot);
    const record: ManifestRecord = {
      provider: 'openai', request_id: '00000000-0000-4000-8000-000000000001', language: 'en',
      timestamp: '2026-09-04T21:00:00.000Z', actual_model: null, http_invocation_confirmed: true,
      status_category: 'success', latency_ms: 10, persistence_confirmed: true,
      observability_row_id: '00000000-0000-4000-8000-000000000002', classification: 'DIRECT',
    };
    appendPrivateManifest(validated, record);
    appendPrivateManifest(validated, { ...record, provider: 'gemini' });
    const lines = readFileSync(path, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(lines.length, 2);
    assert.deepEqual(Object.keys(lines[0]).sort(), [
      'provider', 'request_id', 'language', 'timestamp', 'actual_model', 'http_invocation_confirmed',
      'status_category', 'latency_ms', 'persistence_confirmed', 'observability_row_id', 'classification',
    ].sort());
    assert.equal(JSON.stringify(lines).includes('prompt'), false);
    assert.equal(JSON.stringify(lines).includes('answer'), false);
    assert.throws(() => validatePrivateManifestPath(resolve('public/evidence.jsonl'), repositoryRoot), /outside_repository/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('harness source uses canonical adapters and does not import or mutate the customer router', () => {
  const source = readFileSync(new URL('../scripts/dabra-provider-certification.ts', import.meta.url), 'utf8');
  for (const name of [
    'callOpenAIResponsesWebSearch', 'callGeminiGoogleSearch', 'callAnthropicMessagesWeb',
    'callXAIWebSearch', 'callDeepSeekWebSearch', 'callQwenWebSearch', 'callMistralWebSearch',
  ]) assert.match(source, new RegExp(name));
  assert.match(source, /new Worker\(`/);
  assert.match(source, /tsx\/esm\/api/);
  assert.match(source, /worker\.terminate\(\)/);
  assert.match(source, /get_dabra_provider_observability_hardening_status/);
  assert.doesNotMatch(source, /runtime\/chat|buildAI2ChatResponse/);
  assert.doesNotMatch(source, /process\.env\.(?:DABRA_AI_PROVIDER|DABRA_PROVIDER_FALLBACK_ENABLED|DABRA_GLOBAL_WEB_TIMEOUT_MS)\s*=/);
});
