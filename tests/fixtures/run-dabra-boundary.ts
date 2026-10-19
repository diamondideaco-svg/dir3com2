import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// Some Node versions report a passing file even when no named case matched.
export function assertBoundaryExecuted(output: string, name: string) {
  const lines = output.split(/\r?\n/);
  assert.ok(lines.includes('# Subtest: ' + name), 'requested subtest was not executed: ' + name);
  assert.ok(lines.some(line => /^ok [0-9]+ - /.test(line) && line.replace(/^ok [0-9]+ - /, '') === name), 'requested subtest did not pass without SKIP/TODO: ' + name);
  assert.ok(lines.includes('# pass 1'), 'expected one actual passing case');
  assert.ok(lines.includes('# fail 0'), 'expected zero failures');
}

export function runDabraBoundaryCase(name: string) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const metacharacters = '\\^$.*+?()[]{}|';
  const escaped = Array.from(name, char => metacharacters.includes(char) ? '\\' + char : char).join('');
  const output = execFileSync(process.execPath, ['--test', '--test-reporter=tap', '--test-name-pattern=^' + escaped + '$', 'tests/fixtures/dabra-conversation-boundaries.mjs'], {
    env, encoding: 'utf8', timeout: 30_000, maxBuffer: 2 * 1024 * 1024,
  });
  assertBoundaryExecuted(output, name);
  return output;
}
