import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { AGENT_PROVIDER_IDS, type AgentCapabilityProfile } from '../lib/dabra/agent-capabilities';
import { dialogueCostCeilingMicros, type DialogueFundingProof } from '../lib/dabra/dialogue-funding';

// These rates, approvals and models are synthetic VM fixtures, never live approval or prices.
const now = Date.parse('2026-10-31T12:00:00Z');
type FixtureEvidence = Readonly<{
  schema: string; provider: string; model: string; serviceTier: string; currency: string;
  inputMicrosPerMillion: number; outputMicrosPerMillion: number;
  observedAtMs: number; validFromMs: number; expiresAtMs: number; sourceUrl: string; sha256: string;
}>;
function fixtureEvidence(overrides: Partial<FixtureEvidence> = {}): FixtureEvidence {
  const fields = {
    schema: 'reviewed-standard-pricing-v1', provider: 'openai', model: 'SYNTHETIC-PRICING-MODEL',
    serviceTier: 'standard', currency: 'USD', inputMicrosPerMillion: 1000000, outputMicrosPerMillion: 2000000,
    observedAtMs: now - 2000, validFromMs: now - 1000, expiresAtMs: now + 600000,
    sourceUrl: 'https://developers.openai.com/api/docs/pricing', ...overrides,
  };
  const sha256 = createHash('sha256').update(JSON.stringify([
    fields.schema, fields.provider, fields.model, fields.serviceTier, fields.currency,
    fields.inputMicrosPerMillion, fields.outputMicrosPerMillion,
    fields.observedAtMs, fields.validFromMs, fields.expiresAtMs, fields.sourceUrl,
  ])).digest('hex');
  return Object.freeze({ ...fields, sha256 });
}
function profile(overrides: Partial<AgentCapabilityProfile['measurement']> = {}, provider: 'openai' | 'anthropic' = 'openai'): AgentCapabilityProfile {
  return { provider, measurement: {
    capability: 'discover', language: 'en', model: 'SYNTHETIC-PRICING-MODEL', environment: 'synthetic',
    caseSetSha: 'a'.repeat(64), sourceSha: 'b'.repeat(40), cases: 1, passed: 1,
    measuredAtMs: now - 1, expiresAtMs: now + 600000, latencyMs: 1,
    inputTokenCeiling: 4096, outputTokenCeiling: 256, costCeilingUsd: 0.03, ...overrides,
  } };
}
type CreditProof = Extract<DialogueFundingProof, { mode: 'existing-credit' }>;
function proof(overrides: Record<string, unknown> = {}): CreditProof {
  const base: CreditProof = {
    grantId: '11111111-1111-4111-8111-111111111111', provider: 'openai',
    model: 'SYNTHETIC-PRICING-MODEL', environment: 'synthetic',
    accountId: 'SYNTHETIC-account', projectId: 'SYNTHETIC-project',
    evidenceSha256: 'c'.repeat(64), credentialSha256: 'd'.repeat(64),
    verifiedAtMs: now - 1, expiresAtMs: now + 600000, quotaWindowStartMs: now - 3600000, quotaWindowEndMs: now + 3600000,
    remainingRequests: 1000, remainingInputTokens: 1000000, remainingOutputTokens: 1000000,
    autoReload: 'off', postpaid: 'blocked', overdraft: 'blocked', concurrentAccountUsage: 'bounded',
    mode: 'existing-credit', currency: 'USD', authorizedCreditMicros: 30000, remainingCreditMicros: 30000,
    pricing: 'standard-2026-10-28', serviceTier: 'standard',
  };
  return { ...base, ...overrides };
}
function quoteWithServerApprovals(approvals: readonly unknown[]) {
  const fixtureModule = { exports: {} }, require = createRequire(import.meta.url);
  const code = ts.transpileModule(readFileSync(new URL('../lib/dabra/dialogue-funding.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  runInNewContext(code, {
    module: fixtureModule, exports: fixtureModule.exports,
    require: (id: string) => {
      if (id === 'server-only') return {};
      if (id === './agent-capabilities') return { AGENT_PROVIDER_IDS };
      if (id === './dialogue-pricing-approvals') return { APPROVED_DIALOGUE_STANDARD_PRICING: Object.freeze([...approvals]) };
      if (id === 'node:crypto') return require(id);
      throw new Error('Unexpected quote dependency: ' + id);
    },
    URL,
  });
  return (fixtureModule.exports as { dialogueCostCeilingMicros: typeof dialogueCostCeilingMicros }).dialogueCostCeilingMicros;
}

test('pricing evidence: expired 28 October reference stays rejected on 31 October', () => {
  assert.equal(dialogueCostCeilingMicros(proof({ model: 'gpt-5' }), profile({ model: 'gpt-5' }), now), null);
});
test('pricing evidence: fresh server-approved synthetic evidence works after the old window', () => {
  const record = fixtureEvidence();
  assert.equal(quoteWithServerApprovals([record])(proof({ pricingEvidenceSha256: record.sha256 }), profile(), now), 4608);
});
test('pricing evidence: public URL, caller JSON and a digest alone never grant approval', () => {
  const record = fixtureEvidence(), candidate = proof({ pricingEvidenceSha256: record.sha256, pricingEvidence: record, approved: true });
  assert.equal(dialogueCostCeilingMicros(candidate, profile(), now), null); // Real compiled registry, empty by default.
  assert.equal(quoteWithServerApprovals([])(candidate, profile(), now), null);
  assert.equal(quoteWithServerApprovals([record])(proof({ pricingEvidenceSha256: 'e'.repeat(64) }), profile(), now), null);
});
test('pricing evidence: exact provider, model, Standard tier, USD and schema are required', () => {
  for (const mutation of [
    { provider: 'anthropic' }, { model: 'SYNTHETIC-OTHER-MODEL' }, { serviceTier: 'priority' }, { currency: 'SAR' }, { schema: 'unreviewed' },
  ]) {
    const record = fixtureEvidence(mutation);
    assert.equal(quoteWithServerApprovals([record])(proof({ pricingEvidenceSha256: record.sha256 }), profile(), now), null, JSON.stringify(mutation));
  }
});
test('pricing evidence: an independently bound synthetic Anthropic record works', () => {
  const record = fixtureEvidence({ provider: 'anthropic', sourceUrl: 'https://platform.claude.com/docs/en/about-claude/pricing' });
  assert.equal(quoteWithServerApprovals([record])(proof({ provider: 'anthropic', pricingEvidenceSha256: record.sha256 }), profile({}, 'anthropic'), now), 4608);
});
test('pricing evidence: future, expired, reversed and overlong windows fail closed', () => {
  for (const mutation of [
    { observedAtMs: now + 1 }, { validFromMs: now + 1 }, { expiresAtMs: now },
    { observedAtMs: now - 1, validFromMs: now - 2 }, { expiresAtMs: now - 3000 },
    { observedAtMs: now - 3600001, validFromMs: now - 3600000, expiresAtMs: now + 1 },
    { validFromMs: Number.NaN }, { expiresAtMs: Number.POSITIVE_INFINITY },
    { observedAtMs: Number.MAX_SAFE_INTEGER + 1 }, { expiresAtMs: now + 0.5 },
  ]) {
    const record = fixtureEvidence(mutation);
    assert.equal(quoteWithServerApprovals([record])(proof({ pricingEvidenceSha256: record.sha256 }), profile(), now), null);
  }
});
test('pricing evidence: valid-from is inclusive and expiration is exclusive', () => {
  const record = fixtureEvidence({ validFromMs: now, expiresAtMs: now + 1 }), quote = quoteWithServerApprovals([record]);
  assert.equal(quote(proof({ pricingEvidenceSha256: record.sha256 }), profile(), now), 4608);
  assert.equal(quote(proof({ pricingEvidenceSha256: record.sha256 }), profile(), now + 1), null);
});
test('pricing evidence: invalid or zero-total rates cannot become a quote', () => {
  for (const rate of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    for (const mutation of [{ inputMicrosPerMillion: rate }, { outputMicrosPerMillion: rate }]) {
      const record = fixtureEvidence(mutation);
      assert.equal(quoteWithServerApprovals([record])(proof({ pricingEvidenceSha256: record.sha256 }), profile(), now), null);
    }
  }
  const zero = fixtureEvidence({ inputMicrosPerMillion: 0, outputMicrosPerMillion: 0 });
  assert.equal(quoteWithServerApprovals([zero])(proof({ pricingEvidenceSha256: zero.sha256 }), profile(), now), null);
});
test('pricing evidence: every semantic field is protected against stale-fingerprint tampering', () => {
  const original = fixtureEvidence();
  for (const mutation of [
    { schema: 'other' }, { provider: 'anthropic' }, { model: 'other' }, { currency: 'EUR' }, { serviceTier: 'flex' },
    { inputMicrosPerMillion: 1 }, { outputMicrosPerMillion: 1 }, { observedAtMs: now - 3000 },
    { validFromMs: now - 500 }, { expiresAtMs: now + 1200000 }, { sourceUrl: 'https://developers.openai.com/api/docs/models' },
  ]) {
    assert.equal(quoteWithServerApprovals([{ ...original, ...mutation }])(proof({ pricingEvidenceSha256: original.sha256 }), profile(), now), null);
  }
});
test('pricing evidence: unofficial sources and URL credentials are rejected even in a candidate registry', () => {
  for (const sourceUrl of [
    'http://developers.openai.com/api/docs/pricing', 'https://developers.openai.com.attacker.invalid/pricing',
    'https://attacker.invalid/pricing', 'https://user:password@developers.openai.com/api/docs/pricing',
    'https://developers.openai.com:444/api/docs/pricing', 'https://developers.openai.com/api/docs/pricing?key=SYNTHETIC',
    'https://developers.openai.com/api/docs/pricing#unreviewed', 'not-a-url', 'https://platform.claude.com/docs/en/about-claude/pricing',
  ]) {
    const record = fixtureEvidence({ sourceUrl });
    assert.equal(quoteWithServerApprovals([record])(proof({ pricingEvidenceSha256: record.sha256 }), profile(), now), null);
  }
});
test('pricing evidence: malformed references cannot fall back to the historical tariff', () => {
  const oldNow = Date.parse('2026-10-28T12:00:00Z');
  const historical = proof({ model: 'gpt-5', verifiedAtMs: oldNow - 1, expiresAtMs: oldNow + 600000, quotaWindowStartMs: oldNow - 3600000, quotaWindowEndMs: oldNow + 3600000 });
  assert.equal(dialogueCostCeilingMicros(historical, profile({ model: 'gpt-5' }), oldNow), 7680);
  for (const pricingEvidenceSha256 of [undefined, null, '', 'f'.repeat(63), 'F'.repeat(64), {}, [], 42]) {
    assert.equal(quoteWithServerApprovals([])({ ...historical, pricingEvidenceSha256 }, profile({ model: 'gpt-5' }), oldNow), null);
  }
});
test('pricing evidence: reviewed quotes still enforce credit and profile ceilings', () => {
  const record = fixtureEvidence(), quote = quoteWithServerApprovals([record]), reference = { pricingEvidenceSha256: record.sha256 };
  assert.equal(quote(proof({ ...reference, authorizedCreditMicros: 4607 }), profile(), now), null);
  assert.equal(quote(proof({ ...reference, remainingCreditMicros: 4607 }), profile(), now), null);
  assert.equal(quote(proof(reference), profile({ costCeilingUsd: 0.004607 }), now), null);
  assert.equal(quote(proof(reference), profile({ inputTokenCeiling: 1, outputTokenCeiling: 1 }), now), 3);
});
test('pricing evidence: integer arithmetic rejects an unsafe resulting quote', () => {
  const record = fixtureEvidence({ inputMicrosPerMillion: Number.MAX_SAFE_INTEGER, outputMicrosPerMillion: Number.MAX_SAFE_INTEGER });
  assert.equal(quoteWithServerApprovals([record])(proof({
    pricingEvidenceSha256: record.sha256, authorizedCreditMicros: Number.MAX_SAFE_INTEGER, remainingCreditMicros: Number.MAX_SAFE_INTEGER,
    remainingInputTokens: Number.MAX_SAFE_INTEGER, remainingOutputTokens: Number.MAX_SAFE_INTEGER,
  }), profile({ inputTokenCeiling: Number.MAX_SAFE_INTEGER, outputTokenCeiling: Number.MAX_SAFE_INTEGER, costCeilingUsd: Number.MAX_SAFE_INTEGER }), now), null);
});
test('pricing evidence: existing synthetic-only quote behavior is preserved', () => {
  assert.equal(dialogueCostCeilingMicros(proof({ model: 'test-model', pricing: 'synthetic' }), profile({ model: 'test-model' }), now), 4608);
});


// Source approval is immutable semantic data. Runtime observations are separate,
// synthetic, server-stored proof fixtures; these helpers create no live authority.
function fixtureSnapshot(overrides: Record<string, unknown> = {}) {
  const fields = {
    schema: 'reviewed-standard-pricing-v2', provider: 'openai', model: 'SYNTHETIC-PRICING-MODEL',
    serviceTier: 'standard', currency: 'USD', inputMicrosPerMillion: 1000000, outputMicrosPerMillion: 2000000,
    sourceUrl: 'https://developers.openai.com/api/docs/pricing', ...overrides,
  };
  const sha256 = createHash('sha256').update(JSON.stringify([
    fields.schema, fields.provider, fields.model, fields.serviceTier, fields.currency,
    fields.inputMicrosPerMillion, fields.outputMicrosPerMillion, fields.sourceUrl,
  ])).digest('hex');
  return Object.freeze({ ...fields, sha256 });
}
function runtimeVerification(snapshot = fixtureSnapshot(), overrides: Record<string, unknown> = {}) {
  return {
    schema: 'standard-pricing-verification-v1', snapshotSha256: snapshot.sha256,
    sourceUrl: snapshot.sourceUrl, inputMicrosPerMillion: snapshot.inputMicrosPerMillion,
    outputMicrosPerMillion: snapshot.outputMicrosPerMillion,
    observedAtMs: now - 1000, evidenceSha256: '9'.repeat(64), ...overrides,
  };
}
test('pricing snapshot: release taking more than one hour permits a genuinely fresh matching runtime verification', () => {
  const snapshot = fixtureSnapshot(), quote = quoteWithServerApprovals([snapshot]);
  const publishedAt = now + 85 * 60000 + 20000;
  const fresh = proof({
    pricingEvidenceSha256: snapshot.sha256,
    pricingVerification: runtimeVerification(snapshot, { observedAtMs: publishedAt - 1000 }),
    verifiedAtMs: publishedAt - 1, expiresAtMs: publishedAt + 600000,
    quotaWindowStartMs: publishedAt - 1000, quotaWindowEndMs: publishedAt + 3600000,
  });
  assert.equal(quote(fresh, profile({ expiresAtMs: publishedAt + 600000 }), publishedAt), 4608);
});

test('pricing snapshot: missing runtime evidence, caller JSON and a public URL cannot approve a tariff', () => {
  const snapshot = fixtureSnapshot(), quote = quoteWithServerApprovals([snapshot]);
  for (const pricingVerification of [undefined, null, {}, [], true, 'verified', { observedAtMs: now - 1 }]) {
    assert.equal(quote(proof({ pricingEvidenceSha256: snapshot.sha256, pricingVerification }), profile(), now), null);
  }
  const candidate = proof({ pricingEvidenceSha256: snapshot.sha256, pricingVerification: runtimeVerification(snapshot), pricingEvidence: snapshot, approved: true });
  assert.equal(quoteWithServerApprovals([])(candidate, profile(), now), null);
  assert.equal(dialogueCostCeilingMicros(candidate, profile(), now), null); // No synthetic model in the real registry.
  assert.equal(quoteWithServerApprovals([snapshot, snapshot])(candidate, profile(), now), null);
});
test('pricing snapshot: runtime receipt must match the snapshot source, exact rates and evidence identity', () => {
  const snapshot = fixtureSnapshot(), quote = quoteWithServerApprovals([snapshot]);
  for (const mutation of [
    { schema: 'unreviewed' }, { snapshotSha256: 'e'.repeat(64) },
    { sourceUrl: 'https://developers.openai.com/api/docs/models' },
    { inputMicrosPerMillion: 1 }, { outputMicrosPerMillion: 1 },
    { evidenceSha256: undefined }, { evidenceSha256: '' }, { evidenceSha256: 'A'.repeat(64) },
    { evidenceSha256: snapshot.sha256 }, { extra: true },
  ]) {
    assert.equal(quote(proof({ pricingEvidenceSha256: snapshot.sha256, pricingVerification: runtimeVerification(snapshot, mutation) }), profile(), now), null, JSON.stringify(mutation));
  }
});
test('pricing snapshot: old, future, fractional and financial-clock-only refreshes fail closed', () => {
  const snapshot = fixtureSnapshot(), quote = quoteWithServerApprovals([snapshot]);
  for (const observedAtMs of [now + 1, now, now - 3600001, now - 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(quote(proof({ pricingEvidenceSha256: snapshot.sha256,
      pricingVerification: runtimeVerification(snapshot, { observedAtMs }),
    }), profile(), now), null, String(observedAtMs));
  }
  // Fresh financial timestamps do not re-observe an old price receipt.
  assert.equal(quote(proof({ pricingEvidenceSha256: snapshot.sha256, verifiedAtMs: now,
    expiresAtMs: now + 1, pricingVerification: runtimeVerification(snapshot, { observedAtMs: now - 3600000 }),
  }), profile(), now), null);
});
test('pricing snapshot: one-hour runtime window is inclusive in duration and exclusive at expiry', () => {
  const snapshot = fixtureSnapshot(), quote = quoteWithServerApprovals([snapshot]);
  const candidate = proof({ pricingEvidenceSha256: snapshot.sha256, expiresAtMs: now + 1,
    pricingVerification: runtimeVerification(snapshot, { observedAtMs: now - 3599999 }),
  });
  assert.equal(quote(candidate, profile(), now), 4608);
  assert.equal(quote(candidate, profile(), now + 1), null);
});
test('pricing snapshot: immutable semantic fields cannot be changed under the approved digest', () => {
  const snapshot = fixtureSnapshot(), candidate = proof({
    pricingEvidenceSha256: snapshot.sha256, pricingVerification: runtimeVerification(snapshot),
  });
  for (const mutation of [
    { schema: 'other' }, { provider: 'anthropic' }, { model: 'other' }, { currency: 'EUR' }, { serviceTier: 'flex' },
    { inputMicrosPerMillion: 1 }, { outputMicrosPerMillion: 1 },
    { sourceUrl: 'https://developers.openai.com/api/docs/models' }, { observedAtMs: now },
  ]) {
    assert.equal(quoteWithServerApprovals([{ ...snapshot, ...mutation }])(candidate, profile(), now), null);
  }
});
test('pricing snapshot: stored credit of USD1 cannot be enlarged by a valid snapshot or runtime receipt', () => {
  const snapshot = fixtureSnapshot({ inputMicrosPerMillion: 0, outputMicrosPerMillion: 1000000000 });
  const quote = quoteWithServerApprovals([snapshot]);
  let remainingCreditMicros = 1000000, held = 0, admittedQuotes = 0;
  for (let i = 0; i < 6; i++) {
    const cost = quote(proof({ pricingEvidenceSha256: snapshot.sha256,
      pricingVerification: runtimeVerification(snapshot), authorizedCreditMicros: 1000000, remainingCreditMicros,
    }), profile({ costCeilingUsd: 1 }), now);
    if (cost === null) break;
    remainingCreditMicros -= cost; held += cost; admittedQuotes++;
  }
  assert.equal(admittedQuotes, 3); assert.equal(held, 768000); assert.equal(remainingCreditMicros, 232000);
  assert.ok(held <= 1000000);
  assert.equal(quote(proof({ pricingEvidenceSha256: snapshot.sha256,
    pricingVerification: runtimeVerification(snapshot), authorizedCreditMicros: 1000000, remainingCreditMicros,
  }), profile({ costCeilingUsd: 1 }), now), null);
});
test('pricing snapshot: live-source Anthropic snapshot alone grants no quote, credit or qualification', () => {
  const snapshot = fixtureSnapshot({ provider: 'anthropic', model: 'claude-sonnet-5-5',
    inputMicrosPerMillion: 2000000, outputMicrosPerMillion: 10000000,
    sourceUrl: 'https://platform.claude.com/docs/en/models/sonnet-5-5/overview' });
  assert.equal(snapshot.sha256, '97078a9f0fe05c81aafc8909295b404348606f4d572983bf2364201ca1737cb4');
  const candidate = proof({ provider: 'anthropic', model: snapshot.model, environment: 'provider-benchmark',
    pricingEvidenceSha256: snapshot.sha256, authorizedCreditMicros: 1000000, remainingCreditMicros: 1000000 });
  const measured = profile({ model: snapshot.model, environment: 'provider-benchmark' }, 'anthropic');
  assert.equal(dialogueCostCeilingMicros(candidate, measured, now), null);
  assert.equal(dialogueCostCeilingMicros({ ...candidate, pricingVerification: runtimeVerification(snapshot) }, measured, now), 10752);
  assert.equal(dialogueCostCeilingMicros({ ...candidate, pricingVerification: runtimeVerification(snapshot), remainingCreditMicros: 10751 }, measured, now), null);
  assert.equal(dialogueCostCeilingMicros({ ...candidate, pricingVerification: runtimeVerification(snapshot) }, { ...measured, measurement: { ...measured.measurement, costCeilingUsd: 0.010751 } }, now), null);
});

test('pricing snapshot: exact non-reasoning Grok tariff quotes through the real registry without relaxing funding guards', () => {
  const snapshot = fixtureSnapshot({ provider: 'xai', model: 'grok-4.20-0309-non-reasoning',
    inputMicrosPerMillion: 1250000, outputMicrosPerMillion: 2500000,
    sourceUrl: 'https://docs.x.ai/developers/models/grok-4.20-0309-non-reasoning' });
  assert.equal(snapshot.sha256, 'fa66b834021e2d30ab2f62e32518c39fd7e93243ba476e9faf4c495e8a7904eb');
  // Authority and fee receipts below are synthetic fixtures, not live eligibility or an all-in price claim.
  const allInChargeBound = { schema: 'all-in-charge-bound-v1', currency: 'USD', coverage: 'all-applicable-api-charges',
    maxAdditionalMicros: 0, observedAtMs: now - 1000, evidenceSha256: '8'.repeat(64) };
  const candidate = proof({ provider: 'xai', model: snapshot.model, environment: 'provider-benchmark',
    pricingEvidenceSha256: snapshot.sha256, pricingVerification: runtimeVerification(snapshot), allInChargeBound,
    limitedOperation: { schema: 'task217-limited-operation-v1', authorizationId: '22222222-2222-4222-8222-222222222222',
      taskId: 'task217-text-pilot-2026-11-01', maxCostMicros: 1000000, maxAttempts: 28,
      dataScope: 'redacted-travel-or-server-units', providerRisk: 'overdraft-unknown',
      authorizedAtMs: now - 1, expiresAtMs: now + 600000 } });
  const measured: AgentCapabilityProfile = { provider: 'xai', measurement: {
    ...profile({ model: snapshot.model, environment: 'provider-benchmark', outputTokenCeiling: 1024 }).measurement,
  } };
  assert.equal(dialogueCostCeilingMicros(candidate, measured, now), 7680);
  assert.equal(dialogueCostCeilingMicros({ ...candidate, allInChargeBound: { ...allInChargeBound, maxAdditionalMicros: 37 } }, measured, now), 7717);
  for (const mutation of [
    { pricingVerification: undefined }, { allInChargeBound: undefined }, { limitedOperation: undefined },
    { remainingCreditMicros: 7679 }, { pricingEvidenceSha256: '0'.repeat(64) },
    { pricingVerification: runtimeVerification(snapshot, { observedAtMs: now - 3600001 }) },
  ]) {
    assert.equal(dialogueCostCeilingMicros({ ...candidate, ...mutation }, measured, now), null);
  }
  for (const model of ['grok-4.20-0309-reasoning', 'grok-4.20-non-reasoning-latest']) {
    assert.equal(dialogueCostCeilingMicros({ ...candidate, model },
      { ...measured, measurement: { ...measured.measurement, model } }, now), null);
  }
  assert.equal(dialogueCostCeilingMicros(candidate,
    { ...measured, measurement: { ...measured.measurement, outputTokenCeiling: 1025 } }, now), null);
});
