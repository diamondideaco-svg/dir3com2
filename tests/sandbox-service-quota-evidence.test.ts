import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureSandboxServiceImage } from '../scripts/sandbox/pull-service-image.mjs';

// Only injected command results; no Docker, registry, credentials or real network.
const digest = 'sha256:73e76c305027cb1119bc7c6ab82449d9e1a50a9e8697f4ebac5443dc63590c90';
const config = 'sha256:eb4951a2f9ac02288100937995af3cb7fb64c296b1228405de5d77ca4dd3410d';
const primary = 'public.ecr.aws/supabase/postgrest@' + digest;
const alternative = 'docker.io/postgrest/postgrest@' + digest;
const failed = (stderr: unknown, extra: Record<string, unknown> = {}) => Object.assign(new Error('synthetic Docker failure'), { status: 1, stderr, ...extra });
const translated = () => failed('error from registry: Data limit exceeded\n');
const quota = () => failed('Error response from daemon: toomanyrequests: Data limit exceeded\n');
type Scenario = {
  platform?: string; service?: 'postgrest' | 'storage'; primaryFailure?: Error;
  probeFailure?: Error | null; alternativeFailure?: Error; badIdentity?: boolean;
  onEvidence?: (value: Record<string, unknown>) => void;
};
function fixture({ platform = 'linux/amd64', service = 'postgrest', primaryFailure = translated(), probeFailure = quota(), alternativeFailure, badIdentity = false, onEvidence }: Scenario = {}) {
  const calls: string[][] = [], pauses: number[] = [], receipts: Record<string, unknown>[] = [], evidence: Record<string, unknown>[] = [], failures: Record<string, unknown>[] = [];
  let cached = false, pulled = primary;
  return { calls, pauses, receipts, evidence, failures, execute() {
    return ensureSandboxServiceImage(service, {
      run(args: string[]) {
        calls.push([...args]);
        if (args[0] === 'version') return platform;
        if (args[0] === 'image') {
          if (!cached) throw Error('synthetic uncached image');
          return JSON.stringify([{ Os: 'linux', Architecture: 'amd64', Id: badIdentity ? 'sha256:unapproved' : config, RepoDigests: [pulled] }]);
        }
        if (args[0] === 'manifest') {
          assert.deepEqual(args, ['manifest', 'inspect', primary], 'proof must concern this exact primary manifest, never GoTrue/tag/alternative');
          if (probeFailure) throw probeFailure;
          return '{}';
        }
        if (args[0] === 'pull') {
          if (!args.at(-1)?.startsWith('docker.io/')) throw primaryFailure;
          assert.deepEqual(args, ['pull', '--platform=linux/amd64', alternative]);
          if (alternativeFailure) throw alternativeFailure;
          pulled = alternative; return '';
        }
        if (args[0] === 'tag') {
          assert.deepEqual(args, ['tag', alternative, 'public.ecr.aws/supabase/postgrest:v16.1']);
          cached = true; return '';
        }
        throw Error('unexpected synthetic command');
      },
      pause(ms: number) { pauses.push(ms); return 'timed-out' as const; },
      report(value: Record<string, unknown>) { receipts.push(value); },
      reportFailure(value: Record<string, unknown>) { failures.push(value); },
      reportQuotaEvidence(value: Record<string, unknown>) { evidence.push(value); onEvidence?.(value); },
    });
  } };
}
test('service quota proof: same pinned manifest evidence enables only the existing bounded fallback', () => {
  const f = fixture();
  assert.equal(f.execute(), 'public.ecr.aws/supabase/postgrest:v16.1');
  assert.deepEqual(f.calls.filter(a => a[0] === 'manifest'), Array(4).fill(['manifest', 'inspect', primary]));
  assert.deepEqual(f.calls.filter(a => a[0] === 'pull').map(a => a.at(-1)), [...Array(4).fill(primary), alternative]);
  assert.deepEqual(f.pauses, [2000, 5000, 15000, 30000, 2000]);
  assert.equal(f.evidence.length, 4); assert.ok(f.evidence.every(e => e.confirmed === true && e.image === primary && e.platform === 'linux/amd64' && e.service === 'postgrest'));
  assert.equal(f.receipts[0].mode, 'quota-fallback'); assert.equal(f.receipts[0].digest, digest); assert.equal(f.receipts[0].identity, 'config-digest');
});
for (const [name, probeFailure] of [
  ['manifest success', null],
  ['unknown message', failed('error from registry: Data limit exceeded')],
  ['authentication', failed('unauthorized: authentication required')],
  ['authorization', failed('denied: requested access is denied')],
  ['TLS', failed('x509: certificate signed by unknown authority')],
  ['missing manifest', failed('manifest unknown: not found')],
  ['digest mismatch', failed('digest mismatch')],
  ['mixed proof with another manifest', failed('toomanyrequests: Data limit exceeded\nsupabase/gotrue@sha256:other')],
  ['JSON code alone', failed('{"errors":[{"code":"TOOMANYREQUESTS","message":"Data limit exceeded"}]}')],
  ['zero status', failed('toomanyrequests: Data limit exceeded', { status: 0 })],
  ['negative status', failed('toomanyrequests: Data limit exceeded', { status: -1 })],
  ['noninteger status', failed('toomanyrequests: Data limit exceeded', { status: 1.5 })],
  ['timeout code', failed('toomanyrequests: Data limit exceeded', { code: 'ETIMEDOUT' })],
  ['signal', failed('toomanyrequests: Data limit exceeded', { signal: 'SIGTERM' })],
  ['unknown code', failed('toomanyrequests: Data limit exceeded', { code: 'SYNTHETIC-UNKNOWN' })],
  ['nonstring stderr', failed({ code: 'TOOMANYREQUESTS' })],
] as const) {
  test('service quota proof: ' + name + ' cannot enable retry or fallback', () => {
    const f = fixture({ probeFailure });
    assert.throws(() => f.execute(), /SANDBOX_IMAGE_PULL_FAILED_WITHOUT_QUOTA/);
    assert.deepEqual(f.calls.filter(a => a[0] === 'pull'), [['pull', '--platform=linux/amd64', primary]]);
    assert.deepEqual(f.calls.filter(a => a[0] === 'manifest'), [['manifest', 'inspect', primary]]);
    assert.equal(f.receipts.length, 0); assert.equal(f.evidence[0].confirmed, false);
  });
}
for (const [name, primaryFailure] of [
  ['mixed translated message', failed('error from registry: Data limit exceeded\nunauthorized')],
  ['primary auth', failed('unauthorized: authentication required')],
  ['primary TLS', failed('x509: certificate signed by unknown authority')],
  ['primary missing', failed('manifest unknown: not found')],
  ['primary zero status', failed('error from registry: Data limit exceeded', { status: 0 })],
  ['primary timeout', failed('error from registry: Data limit exceeded', { code: 'ETIMEDOUT' })],
  ['primary signal', failed('error from registry: Data limit exceeded', { signal: 'SIGTERM' })],
] as const) {
  test('service quota proof: ' + name + ' never borrows an available proof', () => {
    const f = fixture({ primaryFailure });
    assert.throws(() => f.execute(), /SANDBOX_IMAGE_PULL_FAILED_WITHOUT_QUOTA/);
    assert.equal(f.calls.filter(a => a[0] === 'manifest').length, 0);
    assert.equal(f.calls.filter(a => a[0] === 'pull').length, 1); assert.equal(f.receipts.length, 0);
  });
}
test('service quota proof: non-amd64 translated failure never probes or switches source', () => {
  const f = fixture({ platform: 'linux/arm64' });
  assert.throws(() => f.execute(), /SANDBOX_IMAGE_PULL_FAILED_WITHOUT_QUOTA/);
  assert.deepEqual(f.calls.filter(a => a[0] === 'pull'), [['pull', 'public.ecr.aws/supabase/postgrest:v16.1']]);
  assert.equal(f.calls.filter(a => a[0] === 'manifest').length, 0);
});
test('service quota proof: storage remains outside this narrowly authorized evidence extension', () => {
  const f = fixture({ service: 'storage' });
  assert.throws(() => f.execute(), /SANDBOX_IMAGE_PULL_FAILED_WITHOUT_QUOTA/);
  assert.equal(f.calls.filter(a => a[0] === 'manifest').length, 0);
  assert.equal(f.calls.filter(a => a[0] === 'pull').length, 1);
});
test('service quota proof: alternative failure cannot borrow primary evidence', () => {
  const f = fixture({ primaryFailure: quota(), alternativeFailure: translated() });
  assert.throws(() => f.execute(), /SANDBOX_IMAGE_PULL_FAILED_WITHOUT_QUOTA/);
  assert.equal(f.calls.filter(a => a[0] === 'manifest').length, 0);
  assert.deepEqual(f.calls.filter(a => a[0] === 'pull').map(a => a.at(-1)), [...Array(4).fill(primary), alternative]);
  assert.equal(f.receipts.length, 0);
});
test('service quota proof: confirmed quota retains the six-pull ceiling and all delays', () => {
  const f = fixture({ alternativeFailure: quota() });
  assert.throws(() => f.execute(), /SANDBOX_IMAGE_QUOTA_RETRIES_EXHAUSTED/);
  assert.equal(f.calls.filter(a => a[0] === 'pull').length, 6);
  assert.equal(f.calls.filter(a => a[0] === 'manifest').length, 4);
  assert.deepEqual(f.pauses, [2000, 5000, 15000, 30000, 2000, 5000]); assert.equal(f.receipts.length, 0);
});
test('service quota proof: successful corroboration never bypasses exact image identity', () => {
  const f = fixture({ badIdentity: true });
  assert.throws(() => f.execute(), /SANDBOX_IMAGE_DIGEST_VERIFICATION_FAILED/);
  assert.equal(f.receipts.length, 0);
});
test('service quota proof: unsuccessful corroboration diagnostics redact secrets and exclude stdout/env', () => {
  const f = fixture({ probeFailure: failed('Authorization: Bearer SYNTHETIC-PROBE-SECRET\nhttps://SYNTHETIC-USER:SYNTHETIC-PASS@public.ecr.aws/token?token=SYNTHETIC-QUERY', { stdout: 'SYNTHETIC-STDOUT', env: { secret: 'SYNTHETIC-ENV' } }) });
  assert.throws(() => f.execute(), /SANDBOX_IMAGE_PULL_FAILED_WITHOUT_QUOTA/);
  const logged = JSON.stringify(f.evidence);
  for (const secret of ['SYNTHETIC-PROBE-SECRET', 'SYNTHETIC-USER', 'SYNTHETIC-PASS', 'SYNTHETIC-QUERY', 'SYNTHETIC-STDOUT', 'SYNTHETIC-ENV']) assert.equal(logged.includes(secret), false);
  assert.equal(f.evidence[0].confirmed, false);
});
test('service quota proof: a failed evidence logger cannot change eligibility or pull limits', () => {
  const f = fixture({ onEvidence: () => { throw Error('synthetic log failure'); } });
  assert.equal(f.execute(), 'public.ecr.aws/supabase/postgrest:v16.1');
  assert.equal(f.calls.filter(a => a[0] === 'pull').length, 5); assert.equal(f.evidence.length, 4);
});
