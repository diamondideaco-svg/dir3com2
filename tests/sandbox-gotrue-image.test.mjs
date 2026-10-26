import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureGoTrueImage, sanitizeGoTruePullStderr, GOTRUE_PRIMARY, GOTRUE_ALTERNATIVE, GOTRUE_AMD64_DIGEST } from '../scripts/sandbox/pull-gotrue-image.mjs';

const config = 'sha256:7a35ead3d6be1049c2bb37f28420a05d20550e128c2144c3a27b81ea40842873';
const repository = (image) => image.slice(0, image.lastIndexOf(':'));
const pinned = (image) => repository(image) + '@' + GOTRUE_AMD64_DIGEST;
const failed = (stderr, status = 1) => Object.assign(new Error('synthetic Docker failure'), { stderr, status });
const quota = () => failed('Error response from daemon: toomanyrequests: Data limit exceeded\n');

function fixture({ platform = 'linux/amd64', cached = false, rejectPull = () => null, badCache = false } = {}) {
  const calls = [], pauses = [], receipts = [], failures = [];
  let source = GOTRUE_PRIMARY;
  const run = (args) => {
    calls.push(args);
    if (args[0] === 'version') return platform;
    if (args[0] === 'image') {
      if (!cached) throw failed('No such image');
      return JSON.stringify([{ Os: 'linux', Architecture: 'amd64', Id: badCache ? 'wrong-config' : config,
        RepoDigests: [pinned(source)] }]);
    }
    if (args[0] === 'pull') {
      const ref = args.at(-1);
      // Reproduce the observed primary-registry failure without network I/O.
      if (ref.includes(':v2.195.0@')) throw failed('manifest verification failed for digest ' + GOTRUE_AMD64_DIGEST);
      const error = rejectPull(ref);
      if (error) throw error;
      source = ref.startsWith(repository(GOTRUE_ALTERNATIVE)) ? GOTRUE_ALTERNATIVE : GOTRUE_PRIMARY;
      return '';
    }
    if (args[0] === 'tag') { cached = true; return ''; }
    throw new Error('Unexpected Docker command');
  };
  return { calls, pauses, receipts, failures, run: () => ensureGoTrueImage({ run, pause: (ms) => pauses.push(ms), report: (value) => receipts.push(value), reportFailure: (value) => failures.push(value) }) };
}

test('primary pull and local tag use the exact canonical repository@digest', () => {
  const f = fixture();
  assert.equal(f.run(), GOTRUE_PRIMARY);
  assert.deepEqual(f.calls.filter((args) => args[0] === 'pull'), [['pull', '--platform=linux/amd64', pinned(GOTRUE_PRIMARY)]]);
  assert.deepEqual(f.calls.find((args) => args[0] === 'tag'), ['tag', pinned(GOTRUE_PRIMARY), GOTRUE_PRIMARY]);
  assert.equal(f.receipts[0].mode, 'primary');
  assert.equal(f.receipts[0].digest, GOTRUE_AMD64_DIGEST);
});

test('verified exact-config and exact-digest cache performs no pull', () => {
  const f = fixture({ cached: true });
  assert.equal(f.run(), GOTRUE_PRIMARY);
  assert.equal(f.calls.some((args) => args[0] === 'pull'), false);
  assert.equal(f.receipts[0].mode, 'verified-cache');
});

test('only strict quota exhaustion enables the already approved pinned alternative', () => {
  const f = fixture({ rejectPull: (ref) => ref.startsWith(repository(GOTRUE_PRIMARY)) ? quota() : null });
  assert.equal(f.run(), GOTRUE_PRIMARY);
  const pulls = f.calls.filter((args) => args[0] === 'pull');
  assert.deepEqual(pulls.map((args) => args.at(-1)), [...Array(4).fill(pinned(GOTRUE_PRIMARY)), pinned(GOTRUE_ALTERNATIVE)]);
  assert.deepEqual(f.pauses, [2000, 5000, 15000, 30000, 2000]);
  assert.equal(f.receipts[0].mode, 'quota-fallback');
});

test('quota remains bounded and fails after both existing retry limits', () => {
  const f = fixture({ rejectPull: quota });
  assert.throws(f.run, /GOTRUE_IMAGE_QUOTA_RETRIES_EXHAUSTED/);
  assert.equal(f.calls.filter((args) => args[0] === 'pull').length, 6);
  assert.equal(f.receipts.length, 0);
});

for (const [name, error] of [
  ['authorization', failed('unauthorized: authentication required')],
  ['denied', failed('denied: requested access to the resource is denied')],
  ['TLS', failed('x509: certificate signed by unknown authority')],
  ['missing manifest', failed('manifest unknown: not found')],
  ['manifest integrity', failed('manifest verification failed for digest ' + GOTRUE_AMD64_DIGEST)],
  ['digest integrity', failed('digest mismatch')],
  ['network', failed('connection reset by peer')],
  ['timeout', Object.assign(new Error('synthetic timeout'), { code: 'ETIMEDOUT', status: null, stderr: '' })],
  ['mixed quota and denial', failed('toomanyrequests: Data limit exceeded\nunauthorized')],
  ['zero-status quota text', failed('toomanyrequests: Data limit exceeded', 0)],
]) {
  test(name + ' failure never retries, changes registry, or reports PASS', () => {
    const f = fixture({ rejectPull: () => error });
    assert.throws(f.run, /GOTRUE_IMAGE_PULL_FAILED_WITHOUT_QUOTA/);
    assert.equal(f.calls.filter((args) => args[0] === 'pull').length, 1);
    assert.equal(f.calls.some((args) => args[0] === 'tag'), false);
    assert.equal(f.receipts.length, 0);
    assert.equal(f.failures.length, 1);
    assert.equal(f.failures[0].image, GOTRUE_PRIMARY);
    assert.equal(f.failures[0].attempt, 1);
    assert.equal(f.failures[0].stderr, error.stderr ?? '');
  });
}

test('incorrect config cannot satisfy cache or post-pull verification', () => {
  const f = fixture({ cached: true, badCache: true });
  assert.throws(f.run, /GOTRUE_IMAGE_DIGEST_VERIFICATION_FAILED/);
  assert.equal(f.calls.filter((args) => args[0] === 'pull').length, 1);
  assert.equal(f.receipts.length, 0);
});

test('unsupported platform cannot use the amd64 alternative after quota', () => {
  const f = fixture({ platform: 'linux/arm64', rejectPull: quota });
  assert.throws(f.run, /GOTRUE_QUOTA_NO_VERIFIED_ALTERNATIVE_FOR_PLATFORM/);
  assert.deepEqual(f.calls.filter((args) => args[0] === 'pull').map((args) => args.at(-1)), Array(4).fill(GOTRUE_PRIMARY));
  assert.equal(f.receipts.length, 0);
});

test('failure diagnostic redacts auth headers, standalone credentials and URL credentials/suffixes', () => {
  const raw = 'Authorization: Bearer synthetic-header-secret\nBasic synthetic-basic-secret\nBearer synthetic-bearer-secret\n'
    + 'https://synthetic-user:synthetic-pass@public.ecr.aws/v2/token?token=synthetic-query#synthetic-fragment\n'
    + '/v2/token?secret=synthetic-relative-query#synthetic-relative-fragment\napi_key=synthetic-key\n';
  const safe = sanitizeGoTruePullStderr(raw);
  for (const secret of ['synthetic-header-secret', 'synthetic-basic-secret', 'synthetic-bearer-secret', 'synthetic-user', 'synthetic-pass',
    'synthetic-query', 'synthetic-fragment', 'synthetic-relative-query', 'synthetic-relative-fragment', 'synthetic-key']) assert.equal(safe.includes(secret), false);
  assert.ok(safe.includes('https://public.ecr.aws/v2/token'));
});

test('redaction precedes the 4 KiB UTF-8 cap and non-string stderr is not stringified', () => {
  const safe = sanitizeGoTruePullStderr('Bearer ' + 'synthetic-secret-'.repeat(1000) + '\n' + 'ع'.repeat(5000));
  assert.equal(safe.includes('synthetic-secret-'), false);
  assert.ok(Buffer.byteLength(safe) <= 4096);
  assert.equal(sanitizeGoTruePullStderr({ toString: () => 'private-object' }), '');
});

test('failure is a single-line JSON-safe receipt, with no stdout, env or whole-error fields', () => {
  const error = Object.assign(failed('manifest verification failed\n::error::synthetic-injection\u001b[31m'),
    { code: 'ETIMEDOUT', signal: 'SIGTERM', stdout: 'synthetic-private-output', env: { PRIVATE: 'synthetic-private-env' } });
  const f = fixture({ rejectPull: () => error });
  assert.throws(f.run, /GOTRUE_IMAGE_PULL_FAILED_WITHOUT_QUOTA/);
  const receipt = f.failures[0];
  assert.deepEqual(Object.keys(receipt), ['image', 'platform', 'attempt', 'status', 'code', 'signal', 'stderr']);
  assert.equal(receipt.status, 1);
  assert.equal(receipt.code, 'ETIMEDOUT');
  assert.equal(receipt.signal, 'SIGTERM');
  const line = JSON.stringify(receipt);
  assert.equal(line.includes('\n'), false);
  assert.equal(line.includes('\u001b'), false);
  assert.equal(line.includes('synthetic-private-'), false);
  assert.equal(JSON.parse(line).stderr, error.stderr);
});
