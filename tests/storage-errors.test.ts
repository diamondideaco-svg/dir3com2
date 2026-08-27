import assert from 'node:assert/strict';
import test from 'node:test';
import { isMissingStorageObject } from '../lib/storage/errors';

test('missing storage objects are recognized across provider error shapes', () => {
  assert.equal(isMissingStorageObject(new Error('Object not found')), true);
  assert.equal(isMissingStorageObject({ statusCode: 404, message: 'missing' }), true);
  assert.equal(isMissingStorageObject({ status: 404 }), true);
  assert.equal(isMissingStorageObject({ error: 'not_found' }), true);
});

test('real storage failures are not misclassified as missing objects', () => {
  assert.equal(isMissingStorageObject(new Error('connection timeout')), false);
  assert.equal(isMissingStorageObject({ statusCode: 503, message: 'service unavailable' }), false);
  assert.equal(isMissingStorageObject(null), false);
});
