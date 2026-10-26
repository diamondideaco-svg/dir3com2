import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureGoTrueImage, sanitizeGoTruePullStderr, GOTRUE_PRIMARY, GOTRUE_ALTERNATIVE, GOTRUE_AMD64_DIGEST } from '../scripts/sandbox/pull-gotrue-image.mjs';
import { verifiedImageIdentity } from '../scripts/sandbox/verified-image-identity.mjs';
import { ensureSandboxServiceImage } from '../scripts/sandbox/pull-service-image.mjs';

const config = 'sha256:7a35ead3d6be1049c2bb37f28420a05d20550e128c2144c3a27b81ea40842873';
const repository = (image) => image.slice(0, image.lastIndexOf(':'));
const pinned = (image) => repository(image) + '@' + GOTRUE_AMD64_DIGEST;
const failed = (stderr, status = 1) => Object.assign(new Error('synthetic Docker failure'), { stderr, status });
const quota = () => failed('Error response from daemon: toomanyrequests: Data limit exceeded\n');

function fixture({ platform = 'linux/amd64', cached = false, rejectPull = () => null, badCache = false, modern = false, probeError = null } = {}) {
  const calls = [], pauses = [], receipts = [], failures = [], quotaEvidence = [];
  let source = GOTRUE_PRIMARY;
  const run = (args) => {
    calls.push(args);
    if (args[0] === 'version') return platform;
    if (args[0] === 'image') {
      if (!cached) throw failed('No such image');
      return JSON.stringify([{ Os: 'linux', Architecture: 'amd64', Id: badCache ? 'wrong-config' : modern ? GOTRUE_AMD64_DIGEST : config,
        ...(modern ? { Descriptor: { digest: GOTRUE_AMD64_DIGEST, mediaType: 'application/vnd.oci.image.manifest.v1+json' } } : {}),
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
    if (args[0] === 'manifest') { if (probeError) throw probeError; return '{}'; }
    throw new Error('Unexpected Docker command');
  };
  return { calls, pauses, receipts, failures, quotaEvidence, run: () => ensureGoTrueImage({ run, pause: (ms) => pauses.push(ms), report: (value) => receipts.push(value), reportFailure: (value) => failures.push(value), reportVerificationFailure: (value) => failures.push(value), reportQuotaEvidence: (value) => quotaEvidence.push(value) }) };
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
  assert.equal(f.failures[0].checks.configId, false);
  assert.equal(f.failures[0].checks.manifestId, false);
  assert.ok(Object.values(f.failures[0].checks).every((value) => typeof value === 'boolean'));
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

test('containerd manifest identity verifies after a real-command-shaped pull/tag', () => {
  const f = fixture({ modern: true });
  assert.equal(f.run(), GOTRUE_PRIMARY);
  assert.equal(f.receipts[0].identity, 'manifest-digest');
});

const approved = { manifestDigest: GOTRUE_AMD64_DIGEST, configDigest: config, repositories: [repository(GOTRUE_PRIMARY)] };
const modernEntry = () => ({ Os: 'linux', Architecture: 'amd64', Id: GOTRUE_AMD64_DIGEST,
  RepoDigests: [pinned(GOTRUE_PRIMARY)], Descriptor: { digest: GOTRUE_AMD64_DIGEST, mediaType: 'application/vnd.oci.image.manifest.v1+json' } });

for (const [name, change] of [
  ['wrong image Id', (entry) => { entry.Id = 'sha256:unapproved'; }],
  ['wrong descriptor digest', (entry) => { entry.Descriptor.digest = 'sha256:unapproved'; }],
  ['missing descriptor', (entry) => { delete entry.Descriptor; }],
  ['index instead of pinned single-platform manifest', (entry) => { entry.Descriptor.mediaType = 'application/vnd.oci.image.index.v1+json'; }],
  ['unapproved repository', (entry) => { entry.RepoDigests = ['unapproved/gotrue@' + GOTRUE_AMD64_DIGEST]; }],
  ['wrong manifest digest', (entry) => { entry.RepoDigests = [repository(GOTRUE_PRIMARY) + '@sha256:unapproved']; }],
  ['wrong architecture', (entry) => { entry.Architecture = 'arm64'; }],
  ['wrong OS', (entry) => { entry.Os = 'windows'; }],
]) {
  test('modern image verification rejects ' + name, () => {
    const entry = modernEntry(); change(entry);
    assert.equal(verifiedImageIdentity(entry, approved), null);
  });
}

test('both exact legacy config and exact modern manifest identities stay accepted', () => {
  assert.equal(verifiedImageIdentity(modernEntry(), approved), 'manifest-digest');
  assert.equal(verifiedImageIdentity({ ...modernEntry(), Id: config, Descriptor: undefined }, approved), 'config-digest');
});

for (const [name, primary, digest] of [
  ['postgrest', 'public.ecr.aws/supabase/postgrest:v16.1', 'sha256:73e76c305027cb1119bc7c6ab82449d9e1a50a9e8697f4ebac5443dc63590c90'],
  ['storage', 'public.ecr.aws/supabase/storage-api:v1.70.7', 'sha256:9bf0dbb911f9c28d6d6808efeaa06a91a37dbbedaf2397f5c2a228266ee09b75'],
]) {
  test(name + ' uses the same strict containerd identity check without pulling a verified cache', () => {
    const receipts = [];
    const run = (args) => {
      if (args[0] === 'version') return 'linux/amd64';
      assert.equal(args[0], 'image');
      return JSON.stringify([{ Os: 'linux', Architecture: 'amd64', Id: digest,
        RepoDigests: [repository(primary) + '@' + digest], Descriptor: { digest, mediaType: 'application/vnd.oci.image.manifest.v1+json' } }]);
    };
    assert.equal(ensureSandboxServiceImage(name, { run, pause: () => assert.fail('cached image must not pause/pull'), report: (value) => receipts.push(value) }), primary);
    assert.equal(receipts[0].identity, 'manifest-digest');
  });
}

const newQuotaRenderer = () => failed('error from registry: Data limit exceeded\n');

test('quota corroboration requires native OCI code from the same original pinned manifest', () => {
  const f = fixture({ rejectPull: (ref) => ref === pinned(GOTRUE_PRIMARY) ? newQuotaRenderer() : null, probeError: quota(), modern: true });
  assert.equal(f.run(), GOTRUE_PRIMARY);
  assert.deepEqual(f.calls.filter((args) => args[0] === 'manifest'), Array(4).fill(['manifest', 'inspect', pinned(GOTRUE_PRIMARY)]));
  assert.deepEqual(f.calls.filter((args) => args[0] === 'pull').map((args) => args.at(-1)), [...Array(4).fill(pinned(GOTRUE_PRIMARY)), pinned(GOTRUE_ALTERNATIVE)]);
  assert.deepEqual(f.pauses, [2000, 5000, 15000, 30000, 2000]);
  assert.ok(f.quotaEvidence.every((value) => value.confirmed === true));
  assert.equal(f.receipts[0].identity, 'manifest-digest');
});

for (const [name, probeError] of [
  ['successful manifest read', null],
  ['unauthorized manifest read', failed('unauthorized: authentication required')],
  ['TLS failure', failed('x509: certificate signed by unknown authority')],
  ['network timeout', Object.assign(new Error('synthetic timeout'), { status: null, code: 'ETIMEDOUT', signal: 'SIGTERM', stderr: '' })],
  ['mixed quota and denied', failed('toomanyrequests: Data limit exceeded\ndenied')],
  ['ambiguous new renderer again', newQuotaRenderer()],
]) {
  test('quota corroboration fails closed after ' + name, () => {
    const f = fixture({ rejectPull: newQuotaRenderer, probeError });
    assert.throws(f.run, /GOTRUE_IMAGE_PULL_FAILED_WITHOUT_QUOTA/);
    assert.equal(f.calls.filter((args) => args[0] === 'pull').length, 1);
    assert.equal(f.calls.filter((args) => args[0] === 'manifest').length, 1);
    assert.equal(f.quotaEvidence[0].confirmed, false);
    assert.equal(f.receipts.length, 0);
  });
}

test('quota corroboration never probes a signalled timeout or extra/mixed error text', () => {
  for (const error of [Object.assign(newQuotaRenderer(), { code: 'ETIMEDOUT', signal: 'SIGTERM' }),
    failed('error from registry: Data limit exceeded\nunauthorized')]) {
    const f = fixture({ rejectPull: () => error, probeError: quota() });
    assert.throws(f.run, /GOTRUE_IMAGE_PULL_FAILED_WITHOUT_QUOTA/);
    assert.equal(f.calls.filter((args) => args[0] === 'manifest').length, 0);
  }
});

test('quota corroboration is not reused for an ambiguous alternative-registry failure', () => {
  const f = fixture({ rejectPull: (ref) => ref === pinned(GOTRUE_PRIMARY) ? quota() : newQuotaRenderer(), probeError: quota() });
  assert.throws(f.run, /GOTRUE_IMAGE_PULL_FAILED_WITHOUT_QUOTA/);
  assert.equal(f.calls.filter((args) => args[0] === 'pull').length, 5);
  assert.equal(f.calls.filter((args) => args[0] === 'manifest').length, 0);
});

test('quota corroboration diagnostics redact credentials in an unsuccessful probe', () => {
  const f = fixture({ rejectPull: newQuotaRenderer, probeError: failed('Authorization: Bearer synthetic-probe-secret\nhttps://synthetic-user:synthetic-pass@public.ecr.aws/token?token=synthetic-query') });
  assert.throws(f.run, /GOTRUE_IMAGE_PULL_FAILED_WITHOUT_QUOTA/);
  const diagnostic = JSON.stringify(f.quotaEvidence[0]);
  for (const secret of ['synthetic-probe-secret', 'synthetic-user', 'synthetic-pass', 'synthetic-query']) assert.equal(diagnostic.includes(secret), false);
  assert.equal(f.quotaEvidence[0].confirmed, false);
});
