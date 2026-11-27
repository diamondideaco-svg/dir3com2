import test from 'node:test';
import { runDabraBoundaryCase } from './fixtures/run-dabra-boundary';

// Execute each exact named case in a child without inherited test-runner context.
// A passing file with no selected case, SKIP or TODO cannot satisfy this guard.
for (const name of [
  'same-account TOKEN_REFRESHED must preserve text, draft and the in-flight answer',
  'private JSON response marks privacy before pinning the trusted calendar day',
  'floating continuity invalidation must undo its saved display currency',
  'a private JSON reply from floating must not enter the full-page persistence path',
  'private replies remain in live history while excluded from storage',
  'late continuity rejection respects newer currency after view unmount',
  'retired storage effect cannot rewrite account A after identity invalidation',
  'controlled same-account internal navigation shares private transcript in both actual views',
  'controlled late reply and request context isolation synthetic-a to synthetic-b',
  'controlled late reply and request context isolation synthetic-b to synthetic-a',
  'actual marketplace cards, comparison and cart respect rejected USD; verified conversion=true',
  'actual marketplace cards, comparison and cart respect rejected USD; verified conversion=false',
  'late full response and automatic marketplace search cannot override newer selector choice',
  'floating sender keeps a newer explicit selector choice across delayed POST and continuity gate',
  'public marketplace rejects non-live or mismatched currency conversion evidence',
  'delayed market response and subsequent tab changes respect the latest selector',
]) test('conversation boundary regression: ' + name, () => { runDabraBoundaryCase(name); });
