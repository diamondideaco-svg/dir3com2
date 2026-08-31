import assert from 'node:assert/strict';
import test from 'node:test';
import {
  uploadStorageObjectWithRecovery,
} from '../lib/storage/resilient-upload';

test('transient 520 retries the same server-authoritative object path', async () => {
  const attemptedPaths: string[] = [];
  const path = 'owner/product/replacement.png';
  let attempt = 0;

  const result = await uploadStorageObjectWithRecovery({
    path,
    maxAttempts: 3,
    retryDelayMs: 0,
    upload: async (candidatePath) => {
      attemptedPaths.push(candidatePath);
      attempt += 1;
      return attempt === 1
        ? { error: { statusCode: 520, message: 'Web server returned an unknown error' } }
        : { error: null };
    },
    objectExists: async () => ({ exists: false, error: null }),
  });

  assert.deepEqual(attemptedPaths, [path, path]);
  assert.deepEqual(result, { ok: true, attempts: 2, recoveredExistingObject: false });
});

test('ambiguous 520 is reconciled when the exact object already exists', async () => {
  let uploads = 0;
  const result = await uploadStorageObjectWithRecovery({
    path: 'owner/product/replacement.png',
    maxAttempts: 3,
    retryDelayMs: 0,
    upload: async () => {
      uploads += 1;
      return { error: { status: 520, message: 'Cloudflare network error' } };
    },
    objectExists: async (candidatePath) => ({
      exists: candidatePath === 'owner/product/replacement.png',
      error: null,
    }),
  });

  assert.equal(uploads, 1);
  assert.deepEqual(result, { ok: true, attempts: 1, recoveredExistingObject: true });
});

test('permanent upload rejection fails closed without retrying', async () => {
  let uploads = 0;
  const error = { statusCode: 413, message: 'Payload too large' };
  const result = await uploadStorageObjectWithRecovery({
    path: 'owner/product/replacement.png',
    maxAttempts: 3,
    retryDelayMs: 0,
    upload: async () => {
      uploads += 1;
      return { error };
    },
    objectExists: async () => ({ exists: false, error: null }),
  });

  assert.equal(uploads, 1);
  assert.deepEqual(result, { ok: false, attempts: 1, error });
});

test('repeated transient failure remains a failure when no object exists', async () => {
  let uploads = 0;
  const error = { code: '520', message: 'Web server returned an unknown error' };
  const result = await uploadStorageObjectWithRecovery({
    path: 'owner/product/replacement.png',
    maxAttempts: 3,
    retryDelayMs: 0,
    upload: async () => {
      uploads += 1;
      return { error };
    },
    objectExists: async () => ({ exists: false, error: null }),
  });

  assert.equal(uploads, 3);
  assert.deepEqual(result, { ok: false, attempts: 3, error });
});
