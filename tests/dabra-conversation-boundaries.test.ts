import test from 'node:test';
import { runDabraBoundaryCase } from './fixtures/run-dabra-boundary';

// Execute each exact named case in a child without inherited test-runner context.
// A passing file with no selected case, SKIP or TODO cannot satisfy this guard.
for (const name of [
  'same-account TOKEN_REFRESHED must preserve text, draft and the in-flight answer',
  'floating continuity invalidation must undo its saved display currency',
  'a private JSON reply from floating must not enter the full-page persistence path',
  'private replies remain in live history while excluded from storage',
  'late continuity rejection respects newer currency after view unmount',
  'retired storage effect cannot rewrite account A after identity invalidation',
  'controlled same-account internal navigation shares private transcript in both actual views',
  'controlled late reply and request context isolation synthetic-a to synthetic-b',
  'controlled late reply and request context isolation synthetic-b to synthetic-a',
]) test('conversation boundary regression: ' + name, () => { runDabraBoundaryCase(name); });
