import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const GOTRUE_PRIMARY = 'public.ecr.aws/supabase/gotrue:v2.195.0';
export const GOTRUE_ALTERNATIVE = 'docker.io/supabase/gotrue:v2.195.0';
// Supabase's v2.195.0 publisher lists both registries. Original and alternative
// linux/amd64 Raw manifest bytes independently SHA256-verified equal on 2026-10-17.
// https://github.com/supabase/auth/blob/v2.195.0/.github/workflows/publish.yml
export const GOTRUE_AMD64_DIGEST = 'sha256:0dda7536205217ca6f207e7bd6ba36e281b0da46074cef5d55ae1de6ee0733f2';
const configDigest = 'sha256:7a35ead3d6be1049c2bb37f28420a05d20550e128c2144c3a27b81ea40842873';
const docker = (args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 30000, maxBuffer: 32768, stdio: ['ignore', 'pipe', 'pipe'] });
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const isQuota = (error) => error instanceof Error && 'status' in error && Number.isInteger(error.status) && error.status > 0
  && 'stderr' in error && typeof error.stderr === 'string'
  && /^(?:Error response from daemon:\s*)?toomanyrequests: Data limit exceeded\s*$/i.test(error.stderr.trim())
  && !/unauthorized|denied|authentication required|x509|certificate|manifest unknown|not found|digest mismatch/i.test(error.stderr);

export function sanitizeGoTruePullStderr(stderr) {
  if (typeof stderr !== 'string') return '';
  const safe = stderr
    .replace(/\bauthorization\s*[:=][^\r\n]*/gi, 'Authorization: [REDACTED]')
    .replace(/\b(bearer|basic)\s+[^\s]+/gi, '$1 [REDACTED]')
    .replace(/\b(password|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret)\s*[:=]\s*[^\s]+/gi, '$1=[REDACTED]')
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/gi, (value) => {
      try {
        const url = new URL(value);
        url.username = ''; url.password = ''; url.search = ''; url.hash = '';
        return url.href;
      } catch { return '[REDACTED_URL]'; }
    })
    .replace(/[?#][^\s"'<>]*/g, '[REDACTED_URL_SUFFIX]');
  // Redact before truncation so a cut credential cannot evade a later match.
  return Buffer.from(safe).subarray(0, 4096).toString('utf8').replace(/\uFFFD$/, '');
}

const safeCodes = new Set(['EACCES', 'EPERM', 'ENOENT', 'ETIMEDOUT', 'ENOBUFS', 'ECONNRESET', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'EPIPE']);
const safeSignals = new Set(['SIGTERM', 'SIGKILL', 'SIGINT']);

/** Shared prerequisite only. Never alters fixture assertions, credentials or service settings. */
export function ensureGoTrueImage({ run = docker, pause = sleep, report = (receipt) => console.log('GOTRUE_IMAGE_RECEIPT=' + JSON.stringify(receipt)), reportFailure = (failure) => console.error('GOTRUE_IMAGE_PULL_FAILURE=' + JSON.stringify(failure)) } = {}) {
  const platform = run(['version', '--format', '{{.Server.Os}}/{{.Server.Arch}}']).trim();
  const pinned = platform === 'linux/amd64';
  // Resolve the immutable manifest directly. The primary registry rejects the
  // compound tag@digest reference even though repository@digest verifies.
  const ref = (image) => pinned ? image.slice(0, image.lastIndexOf(':')) + '@' + GOTRUE_AMD64_DIGEST : image;
  const verifiedCache = () => {
    try {
      const entries = JSON.parse(run(['image', 'inspect', GOTRUE_PRIMARY]));
      if (!Array.isArray(entries) || entries.length !== 1) return false;
      const entry = entries[0];
      return pinned && entry?.Os === 'linux' && entry.Architecture === 'amd64'
        && entry.Id === configDigest && Array.isArray(entry.RepoDigests)
        && entry.RepoDigests.some((digest) => [GOTRUE_PRIMARY, GOTRUE_ALTERNATIVE, 'supabase/gotrue:v2.195.0']
          .some((image) => digest === image.slice(0, image.lastIndexOf(':')) + '@' + GOTRUE_AMD64_DIGEST));
    } catch { return false; }
  };
  // Reuse only the exact verified image prepared by the workflow. This also
  // avoids another registry pull when the standalone fixture starts next.
  if (verifiedCache()) { report({ status: 'PASS', mode: 'verified-cache', platform, digest: GOTRUE_AMD64_DIGEST }); return GOTRUE_PRIMARY; }
  const pull = (image, delays) => {
    for (const [index, delay] of delays.entries()) {
      pause(delay * 1000);
      try { run(['pull', ...pinned ? ['--platform=linux/amd64'] : [], ref(image)]); return true; }
      catch (error) {
        reportFailure({
          image, platform, attempt: index + 1,
          status: Number.isInteger(error?.status) && error.status >= 0 && error.status <= 255 ? error.status : null,
          code: safeCodes.has(error?.code) ? error.code : null,
          signal: safeSignals.has(error?.signal) ? error.signal : null,
          stderr: sanitizeGoTruePullStderr(error?.stderr),
        });
        // A denied/auth/TLS/missing/damaged image is never a quota fallback.
        if (!isQuota(error)) throw Error('GOTRUE_IMAGE_PULL_FAILED_WITHOUT_QUOTA');
      }
    }
    return false;
  };
  let selected = GOTRUE_PRIMARY;
  if (!pull(selected, [2, 5, 15, 30])) {
    if (!pinned) throw Error('GOTRUE_QUOTA_NO_VERIFIED_ALTERNATIVE_FOR_PLATFORM');
    selected = GOTRUE_ALTERNATIVE;
    if (!pull(selected, [2, 5])) throw Error('GOTRUE_IMAGE_QUOTA_RETRIES_EXHAUSTED');
  }
  if (pinned) {
    run(['tag', ref(selected), GOTRUE_PRIMARY]);
    if (!verifiedCache()) throw Error('GOTRUE_IMAGE_DIGEST_VERIFICATION_FAILED');
  }
  report({ status: 'PASS', mode: selected === GOTRUE_PRIMARY ? 'primary' : 'quota-fallback', platform, digest: pinned ? GOTRUE_AMD64_DIGEST : null });
  return GOTRUE_PRIMARY;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log('GOTRUE_IMAGE_READY=' + ensureGoTrueImage()); }
  catch (error) { console.error(error instanceof Error ? error.message : 'GOTRUE_IMAGE_PREPARATION_FAILED'); process.exitCode = 1; }
}
