import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureSandboxServiceImage } from '../scripts/sandbox/pull-service-image.mjs';

const primary = 'public.ecr.aws/supabase/postgrest@sha256:73e76c305027cb1119bc7c6ab82449d9e1a50a9e8697f4ebac5443dc63590c90';
const failed = (stderr, extra = {}) => Object.assign(new Error('not part of diagnostic'), { status: 1, stderr, ...extra });
function fixture(error, onFailure) {
  const calls = [], failures = [], receipts = [], pauses = [];
  return { calls, failures, receipts, pauses, execute() {
    return ensureSandboxServiceImage('postgrest', {
      run(args) {
        calls.push(args);
        if (args[0] === 'version') return 'linux/amd64';
        if (args[0] === 'image') throw Error('synthetic uncached image');
        assert.equal(args[0], 'pull', 'no unexpected Docker operation');
        throw error;
      },
      pause(ms) { pauses.push(ms); },
      report(value) { receipts.push(value); },
      reportFailure(value) { failures.push(value); onFailure?.(value); },
    });
  } };
}

for (const stderr of [
  'unauthorized: authentication required',
  'denied: requested access to the resource is denied',
  'x509: certificate signed by unknown authority',
  'manifest unknown: manifest unknown',
  'toomanyrequests: Data limit exceeded\ndenied',
  'error from registry: Data limit exceeded\n',
]) {
  test('service diagnostic preserves rejection and no fallback: ' + stderr.trim(), () => {
    const f = fixture(failed(stderr));
    assert.throws(() => f.execute(), /SANDBOX_IMAGE_PULL_FAILED_WITHOUT_QUOTA/);
    assert.deepEqual(f.calls.filter(args => args[0] === 'pull'), [['pull', '--platform=linux/amd64', primary]]);
    assert.equal(f.failures.length, 1);
    assert.deepEqual(f.failures[0], { service: 'postgrest', image: primary,
      platform: 'linux/amd64', status: 1, code: null, signal: null, stderr });
    assert.equal(f.receipts.length, 0);
  });
}

test('service diagnostic reuses redaction before logging and excludes error/stdout/env', () => {
  const f = fixture(failed('failed {"password":"synthetic password with spaces","access_token":"synthetic-access"} Authorization: Bearer synthetic-auth\nhttps://synthetic-user:synthetic-pass@example.invalid/manifest?api_key=synthetic-query#synthetic-fragment',
    { stdout: 'synthetic-private-stdout', env: { secret: 'synthetic-private-env' }, code: 'synthetic-private-code', signal: 'synthetic-private-signal' }));
  assert.throws(() => f.execute(), /SANDBOX_IMAGE_PULL_FAILED_WITHOUT_QUOTA/);
  const logged = JSON.stringify(f.failures);
  for (const privateValue of ['synthetic password', 'synthetic-access', 'synthetic-auth', 'synthetic-user', 'synthetic-pass', 'synthetic-query', 'synthetic-fragment', 'synthetic-private-stdout', 'synthetic-private-env', 'synthetic-private-code', 'synthetic-private-signal', 'not part of diagnostic']) {
    assert.equal(logged.includes(privateValue), false, privateValue);
  }
  assert.deepEqual(Object.keys(f.failures[0]).sort(), ['code', 'image', 'platform', 'service', 'signal', 'status', 'stderr']);
  assert.match(logged, /REDACTED/);
});

test('service diagnostic caps redacted stderr to 4KiB of valid UTF8', () => {
  const f = fixture(failed('password="synthetic-long-secret"\n' + 'م'.repeat(5000)));
  assert.throws(() => f.execute(), /SANDBOX_IMAGE_PULL_FAILED_WITHOUT_QUOTA/);
  assert.ok(Buffer.byteLength(f.failures[0].stderr) <= 4096);
  assert.equal(f.failures[0].stderr.includes('synthetic-long-secret'), false);
  assert.equal(f.failures[0].stderr.includes('\uFFFD'), false);
});

test('service diagnostic never stringifies non-string stderr', () => {
  const f = fixture(failed({ toString() { throw Error('must not stringify'); } }));
  assert.throws(() => f.execute(), /SANDBOX_IMAGE_PULL_FAILED_WITHOUT_QUOTA/);
  assert.equal(f.failures[0].stderr, '');
  assert.equal(f.failures.length, 1);
});

test('service diagnostic retains bounded timeout fields without granting quota fallback', () => {
  const f = fixture(failed('', { status: null, code: 'ETIMEDOUT', signal: 'SIGTERM' }));
  assert.throws(() => f.execute(), /SANDBOX_IMAGE_PULL_FAILED_WITHOUT_QUOTA/);
  assert.equal(f.failures[0].code, 'ETIMEDOUT');
  assert.equal(f.failures[0].signal, 'SIGTERM');
  assert.equal(f.failures[0].status, null);
  assert.equal(f.calls.filter(args => args[0] === 'pull').length, 1);
});

test('service diagnostic failure cannot alter original fail-closed rejection', () => {
  const f = fixture(failed('denied'), () => { throw Error('synthetic log failure'); });
  assert.throws(() => f.execute(), /SANDBOX_IMAGE_PULL_FAILED_WITHOUT_QUOTA/);
  assert.equal(f.calls.filter(args => args[0] === 'pull').length, 1);
  assert.equal(f.receipts.length, 0);
});

test('service diagnostic leaves existing strict-quota retry limits and pinned fallback unchanged', () => {
  const f = fixture(failed('toomanyrequests: Data limit exceeded\n'));
  assert.throws(() => f.execute(), /SANDBOX_IMAGE_QUOTA_RETRIES_EXHAUSTED/);
  const pulls = f.calls.filter(args => args[0] === 'pull');
  assert.equal(pulls.length, 6);
  assert.deepEqual(pulls.slice(0, 4).map(args => args.at(-1)), Array(4).fill(primary));
  assert.deepEqual(pulls.slice(4).map(args => args.at(-1)), Array(2).fill(primary.replace('public.ecr.aws/supabase/postgrest', 'docker.io/postgrest/postgrest')));
  assert.deepEqual(f.pauses, [2000, 5000, 15000, 30000, 2000, 5000]);
  assert.equal(f.failures.length, 6);
  assert.equal(f.receipts.length, 0);
});
