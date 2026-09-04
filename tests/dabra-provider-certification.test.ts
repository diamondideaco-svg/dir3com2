import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  appendPrivateManifest,
  buildProbePlan,
  CERTIFICATION_PROVIDERS,
  invokeWithProbeBounds,
  LIVE_CONFIRMATION,
  main,
  MAX_HTTP_CALLS_PER_PROBE,
  MAX_LOGICAL_PROBES,
  parseCertificationArgs,
  runLiveCertification,
  validateLiveExecution,
  validatePrivateManifestPath,
  type CertificationDependencies,
  type CertificationProvider,
  type ManifestRecord,
} from '@/scripts/dabra-provider-certification';

const repositoryRoot = resolve(new URL('..', import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1)));

function successfulDependencies(overrides: Partial<CertificationDependencies> = {}) {
  const manifests: ManifestRecord[] = [];
  let lastPersisted: Record<string, unknown> | null = null;
  const dependencies: CertificationDependencies = {
    invokeAdapter: async () => {
      await fetch('https://certification.invalid/probe');
      return { ok: true, model: 'canonical-test-model', inputTokens: 2, outputTokens: 1 };
    },
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

test('live runner invokes each selected adapter once and proves one exact telemetry row', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('{}', { status: 200 })) as typeof fetch;
  const calls = new Map<CertificationProvider, number>();
  const fixture = successfulDependencies({
    invokeAdapter: async (provider) => {
      calls.set(provider, (calls.get(provider) ?? 0) + 1);
      await fetch('https://certification.invalid/probe');
      return { ok: true, model: `${provider}-actual`, inputTokens: 2, outputTokens: 1 };
    },
  });
  try {
    const result = await runLiveCertification(parseCertificationArgs(['--live']), fixture.dependencies, 'private.jsonl');
    assert.equal(result.passed, true);
    assert.equal(result.probes.length, 28);
    assert.equal(new Set(result.probes.map((probe) => probe.request_id)).size, 28);
    assert.ok(result.probes.every((probe) => probe.classification === 'DIRECT' && probe.persistence_confirmed));
    for (const provider of CERTIFICATION_PROVIDERS) assert.equal(calls.get(provider), 4);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('read-back retries do not rerun providers, and missing or mismatched rows fail', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('{}', { status: 200 })) as typeof fetch;
  let providerCalls = 0;
  let reads = 0;
  const fixture = successfulDependencies({
    invokeAdapter: async () => {
      providerCalls += 1;
      await fetch('https://certification.invalid/probe');
      return { ok: true, model: 'model' };
    },
    readBack: async () => {
      reads += 1;
      return reads % 3 === 0 && fixture.getLastPersisted() ? [fixture.getLastPersisted()!] : [];
    },
  });
  try {
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
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('per-probe watchdog and eight-call HTTP budget fail bounded execution', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('{}', { status: 200 })) as typeof fetch;
  try {
    await assert.rejects(invokeWithProbeBounds(async () => {
      for (let index = 0; index <= MAX_HTTP_CALLS_PER_PROBE; index += 1) await fetch('https://certification.invalid/probe');
      return { ok: true };
    }), /provider_http_call_limit_exceeded/);
    await assert.rejects(invokeWithProbeBounds(() => new Promise(() => undefined), 5), /probe_watchdog_timeout/);
  } finally {
    globalThis.fetch = originalFetch;
  }
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
  assert.doesNotMatch(source, /runtime\/chat|buildAI2ChatResponse/);
  assert.doesNotMatch(source, /process\.env\.(?:DABRA_AI_PROVIDER|DABRA_PROVIDER_FALLBACK_ENABLED|DABRA_GLOBAL_WEB_TIMEOUT_MS)\s*=/);
});
