import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// Each case runs the actual view/provider and persistence effect in an isolated
// process with controlled hooks and synthetic network/storage. No real auth/AI.
for (const pattern of ['same-account TOKEN_REFRESHED', 'floating continuity invalidation', 'a private JSON reply', 'private replies remain', 'late continuity rejection', 'retired storage effect']) {
  test('conversation boundary regression: ' + pattern, () => {
    const result = spawnSync(process.execPath, ['--test', '--test-name-pattern=' + pattern, 'tests/fixtures/dabra-conversation-boundaries.mjs'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 30_000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });
}
