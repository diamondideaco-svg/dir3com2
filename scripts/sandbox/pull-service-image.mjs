import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Platform manifests independently compared byte-for-byte with their official
// alternatives. Keep the already accepted GoTrue prerequisite separate/unchanged.
const images = Object.freeze({
  postgrest: Object.freeze({
    primary: 'public.ecr.aws/supabase/postgrest:v16.1',
    alternative: 'docker.io/postgrest/postgrest:v16.1',
    digest: 'sha256:73e76c305027cb1119bc7c6ab82449d9e1a50a9e8697f4ebac5443dc63590c90',
    config: 'sha256:eb4951a2f9ac02288100937995af3cb7fb64c296b1228405de5d77ca4dd3410d',
    // https://docs.postgrest.org/en/stable/explanations/install.html#docker
  }),
  storage: Object.freeze({
    primary: 'public.ecr.aws/supabase/storage-api:v1.70.7',
    alternative: 'docker.io/supabase/storage-api:v1.70.7',
    digest: 'sha256:9bf0dbb911f9c28d6d6808efeaa06a91a37dbbedaf2397f5c2a228266ee09b75',
    config: 'sha256:939915265e08b6f4dce62180e98143285772c8d8ffc691f1670b5b715cd34d83',
    // https://github.com/supabase/storage/blob/v1.70.7/.github/workflows/mirror.yml
  }),
});
const docker = (args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 30000, maxBuffer: 32768, stdio: ['ignore', 'pipe', 'pipe'] });
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const quota = (error) => error instanceof Error && 'status' in error && Number.isInteger(error.status) && error.status > 0
  && 'stderr' in error && typeof error.stderr === 'string'
  && /^(?:Error response from daemon:\s*)?toomanyrequests: Data limit exceeded\s*$/i.test(error.stderr.trim());
const repository = (image) => image.slice(0, image.lastIndexOf(':'));

export function ensureSandboxServiceImage(name, { run = docker, pause = sleep, report = (receipt) => console.log('SANDBOX_IMAGE_RECEIPT=' + JSON.stringify(receipt)) } = {}) {
  if (typeof name !== 'string' || !Object.hasOwn(images, name)) throw Error('SANDBOX_IMAGE_UNKNOWN_SERVICE');
  const image = images[name];
  const platform = run(['version', '--format', '{{.Server.Os}}/{{.Server.Arch}}']).trim();
  const pinned = platform === 'linux/amd64';
  // Canonical repository@digest avoids tag/index negotiation ambiguity.
  const ref = (source) => pinned ? repository(source) + '@' + image.digest : source;
  const cache = () => {
    try {
      const entries = JSON.parse(run(['image', 'inspect', image.primary]));
      if (!Array.isArray(entries) || entries.length !== 1) return false;
      const entry = entries[0];
      const sources = [repository(image.primary), repository(image.alternative), repository(image.alternative).replace(/^docker\.io\//, '')];
      return pinned && entry?.Os === 'linux' && entry.Architecture === 'amd64' && entry.Id === image.config
        && Array.isArray(entry.RepoDigests) && entry.RepoDigests.some((value) => sources.some((source) => value === source + '@' + image.digest));
    } catch { return false; }
  };
  const receipt = (mode) => report({ status: 'PASS', image: name, mode, platform, digest: pinned ? image.digest : null });
  if (cache()) { receipt('verified-cache'); return image.primary; }
  const pull = (source, delays) => {
    for (const delay of delays) {
      pause(delay * 1000);
      try { run(['pull', ...(pinned ? ['--platform=linux/amd64'] : []), ref(source)]); return true; }
      catch (error) { if (!quota(error)) throw Error('SANDBOX_IMAGE_PULL_FAILED_WITHOUT_QUOTA'); }
    }
    return false;
  };
  let source = image.primary;
  if (!pull(source, [2, 5, 15, 30])) {
    if (!pinned) throw Error('SANDBOX_IMAGE_NO_VERIFIED_ALTERNATIVE_FOR_PLATFORM');
    source = image.alternative;
    if (!pull(source, [2, 5])) throw Error('SANDBOX_IMAGE_QUOTA_RETRIES_EXHAUSTED');
  }
  if (pinned) {
    run(['tag', ref(source), image.primary]);
    if (!cache()) throw Error('SANDBOX_IMAGE_DIGEST_VERIFICATION_FAILED');
  }
  receipt(source === image.primary ? 'primary' : 'quota-fallback');
  return image.primary;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw Error('SANDBOX_IMAGE_EXPECTED_ONE_SERVICE');
    ensureSandboxServiceImage(process.argv[2]);
  } catch (error) {
    console.error(error instanceof Error && error.message.startsWith('SANDBOX_IMAGE_') ? error.message : 'SANDBOX_IMAGE_PREPARATION_FAILED');
    process.exitCode = 1;
  }
}
