import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { imageIdentityChecks, verifiedImageIdentity } from './verified-image-identity.mjs';

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

const credentialKeys = new Set(['authorization', 'password', 'apikey', 'accesstoken', 'refreshtoken', 'clientsecret']);
const isCredentialKey = (key) => credentialKeys.has(key.replace(/[_-]/g, '').toLowerCase());
const credentialAssignments = () => new RegExp(String.raw`(["']?)\b[_-]*(${[...credentialKeys].map((key) => [...key].join('[_-]*')).join('|')})[_-]*\1\s*[:=]\s*`, 'gi');

function redactAssignedValues(text, assignments) {
  let safe = '', cursor = 0, match;
  while ((match = assignments.exec(text)) !== null) {
    safe += text.slice(cursor, match.index) + match[0] + '"[REDACTED]"';
    let end = assignments.lastIndex;
    const quote = text[end];
    if (quote === '[' || quote === '{' || /^\\+["']/.test(text.slice(end))) {
      // A structured or partially serialized secret cannot be split on spaces.
      // Fail closed for the remainder instead of exposing an ambiguous tail.
      end = text.length;
    } else if (quote === '"' || quote === "'") {
      end += 1;
      while (end < text.length) {
        const character = text[end++];
        if (character === '\\' && end < text.length) { end += 1; continue; }
        if (character === quote) break;
      }
    } else {
      while (end < text.length && !/[\s,;}\]]/.test(text[end])) end += 1;
    }
    cursor = end;
    assignments.lastIndex = end;
  }
  return safe + text.slice(cursor);
}

function redactJson(value, depth) {
  if (depth > 16) return '[REDACTED_NESTED_DIAGNOSTIC]';
  if (typeof value === 'string') return redactDiagnosticText(value, depth + 1);
  if (Array.isArray(value)) return value.map((item) => redactJson(item, depth + 1));
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) value[key] = isCredentialKey(key) ? '[REDACTED]' : redactJson(value[key], depth + 1);
  }
  return value;
}

function redactDiagnosticText(text, depth = 0) {
  if (depth > 16) return '[REDACTED_NESTED_DIAGNOSTIC]';
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { /* Mixed Docker text is not necessarily a JSON document. */ }
  if (parsed !== undefined) return JSON.stringify(redactJson(parsed, depth + 1));
  let safe = redactAssignedValues(text.replace(/\\\//g, '/'), credentialAssignments());
  // Error renderers can serialize JSON without the enclosing string quotes.
  // Redact literal assignments first so an escaped quote inside their value
  // cannot become a premature closing delimiter during normalization.
  if (/\\["']/.test(safe)) return redactDiagnosticText(safe.replace(/\\(["'\\])/g, '$1'), depth + 1);
  // Decode serialized JSON strings before redacting their inner diagnostics.
  safe = safe.replace(/"(?:\\[\s\S]|[^"\\])*"/g, (quoted) => {
    try { return JSON.stringify(redactDiagnosticText(JSON.parse(quoted), depth + 1)); }
    catch { return '[REDACTED_QUOTED_DIAGNOSTIC]'; }
  });
  // Decoding can expose an escaped JSON key in an otherwise plain-text error.
  safe = redactAssignedValues(safe, credentialAssignments())
    .replace(/\bauthorization\s*[:=][^\r\n]*/gi, 'Authorization: [REDACTED]');
  return redactAssignedValues(safe, /\b(?:bearer|basic)\s+/gi)
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/gi, (value) => {
      try {
        const url = new URL(value);
        url.username = ''; url.password = ''; url.search = ''; url.hash = '';
        return url.href;
      } catch { return '[REDACTED_URL]'; }
    })
    .replace(/[?#][^\s"'<>]*/g, '[REDACTED_URL_SUFFIX]');
}

export function sanitizeGoTruePullStderr(stderr) {
  if (typeof stderr !== 'string') return '';
  const safe = redactDiagnosticText(stderr);
  // Redact before truncation so a cut credential cannot evade a later match.
  return Buffer.from(safe).subarray(0, 4096).toString('utf8').replace(/\uFFFD$/, '');
}

const safeCodes = new Set(['EACCES', 'EPERM', 'ENOENT', 'ETIMEDOUT', 'ENOBUFS', 'ECONNRESET', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'EPIPE']);
const safeSignals = new Set(['SIGTERM', 'SIGKILL', 'SIGINT']);

/** Shared prerequisite only. Never alters fixture assertions, credentials or service settings. */
export function ensureGoTrueImage({ run = docker, pause = sleep, report = (receipt) => console.log('GOTRUE_IMAGE_RECEIPT=' + JSON.stringify(receipt)), reportFailure = (failure) => console.error('GOTRUE_IMAGE_PULL_FAILURE=' + JSON.stringify(failure)), reportVerificationFailure = (failure) => console.error('GOTRUE_IMAGE_VERIFICATION_FAILURE=' + JSON.stringify(failure)), reportQuotaEvidence = (evidence) => console.error('GOTRUE_IMAGE_QUOTA_EVIDENCE=' + JSON.stringify(evidence)) } = {}) {
  const platform = run(['version', '--format', '{{.Server.Os}}/{{.Server.Arch}}']).trim();
  const pinned = platform === 'linux/amd64';
  // Resolve the immutable manifest directly, without tag/index negotiation.
  const ref = (image) => pinned ? image.slice(0, image.lastIndexOf(':')) + '@' + GOTRUE_AMD64_DIGEST : image;
  let identity = null;
  let verification = null;
  const verifiedCache = () => {
    identity = null;
    verification = null;
    try {
      const entries = JSON.parse(run(['image', 'inspect', GOTRUE_PRIMARY]));
      if (!Array.isArray(entries) || entries.length !== 1) return false;
      const entry = entries[0];
      const approved = { manifestDigest: GOTRUE_AMD64_DIGEST, configDigest,
        repositories: [GOTRUE_PRIMARY, GOTRUE_ALTERNATIVE, 'supabase/gotrue:v2.195.0'].map((image) => image.slice(0, image.lastIndexOf(':'))) };
      verification = imageIdentityChecks(entry, approved);
      identity = pinned ? verifiedImageIdentity(entry, approved) : null;
      return identity !== null;
    } catch { return false; }
  };
  // Reuse only the exact verified image prepared by the workflow. This also
  // avoids another registry pull when the standalone fixture starts next.
  if (verifiedCache()) { report({ status: 'PASS', mode: 'verified-cache', platform, digest: GOTRUE_AMD64_DIGEST, identity }); return GOTRUE_PRIMARY; }
  const confirmedQuota = (error, image, attempt) => {
    if (isQuota(error)) return true;
    // Docker's containerd translator can omit the OCI code. Never infer quota
    // from that message alone. Ask the native CLI for the SAME pinned manifest;
    // it retains the OCI code. No new source, identity, credential or layer pull.
    // https://github.com/moby/moby/blob/464cd50/daemon/containerd/registry_errors.go
    if (!pinned || image !== GOTRUE_PRIMARY || !(error instanceof Error)
      || !Number.isInteger(error.status) || error.status <= 0 || error.code != null || error.signal != null
      || typeof error.stderr !== 'string'
      || !/^(?:Error response from daemon:\s*)?error from registry: Data limit exceeded\s*$/i.test(error.stderr.trim())) return false;
    try {
      run(['manifest', 'inspect', ref(image)]);
      reportQuotaEvidence({ image, platform, attempt, confirmed: false, reason: 'manifest-read-succeeded' });
      return false;
    } catch (probe) {
      const confirmed = isQuota(probe) && probe.code == null && probe.signal == null;
      reportQuotaEvidence({ image, platform, attempt, confirmed,
        status: Number.isInteger(probe?.status) && probe.status >= 0 && probe.status <= 255 ? probe.status : null,
        code: safeCodes.has(probe?.code) ? probe.code : null,
        signal: safeSignals.has(probe?.signal) ? probe.signal : null,
        stderr: sanitizeGoTruePullStderr(probe?.stderr) });
      return confirmed;
    }
  };
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
        if (!confirmedQuota(error, image, index + 1)) throw Error('GOTRUE_IMAGE_PULL_FAILED_WITHOUT_QUOTA');
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
    if (!verifiedCache()) {
      reportVerificationFailure({ image: selected, platform, checks: verification });
      throw Error('GOTRUE_IMAGE_DIGEST_VERIFICATION_FAILED');
    }
  }
  report({ status: 'PASS', mode: selected === GOTRUE_PRIMARY ? 'primary' : 'quota-fallback', platform, digest: pinned ? GOTRUE_AMD64_DIGEST : null, identity });
  return GOTRUE_PRIMARY;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log('GOTRUE_IMAGE_READY=' + ensureGoTrueImage()); }
  catch (error) { console.error(error instanceof Error ? error.message : 'GOTRUE_IMAGE_PREPARATION_FAILED'); process.exitCode = 1; }
}
