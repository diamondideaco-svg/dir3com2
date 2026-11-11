import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SUCCESSFUL_TASK_POLICY as policy, parseSuccessfulTaskAllowance, successfulTaskAllowance, successfulTaskAllowanceText } from '../lib/dabra/successful-task-contract';
import { PUBLIC_DIALOGUE_POLICY } from '../lib/dabra/public-dialogue-policy';

test('successful quota, attempt cap and account funding are separate; retention remains development-only', () => {
  assert.equal(policy.accountDailySuccesses, 10); assert.equal(policy.accountMonthlySuccesses, 50);
  assert.equal(policy.accountMonthlyCostMicros, 500_000); assert.equal(policy.attemptCostMicros, 250_000);
  assert.equal(policy.monthlyCostMicros, PUBLIC_DIALOGUE_POLICY.monthlyCostMicros);
  assert.equal(policy.maxAttempts, 1); assert.equal(policy.runtimeEnabled, false);
  assert.equal(policy.replayRetentionMs, 24 * 60 * 60 * 1000);
  assert.equal(policy.retentionBasis, 'development-assumption-synthetic-only');
});
test('pending capacity is separate from consumed success and failed costs remain visible', () => {
  const value = successfulTaskAllowance({ dailySucceeded: 7, monthlySucceeded: 40, dailyPending: 2, monthlyPending: 3, accountHeldCostMicros: 500_000, totalHeldCostMicros: 1_000_000 });
  assert.ok(value); assert.equal(value.dailyRemaining, 1); assert.equal(value.monthlyRemaining, 7);
  assert.equal(value.dailyPending, 2); assert.equal(value.costAvailable, false);
  assert.match(successfulTaskAllowanceText(value, 'en'), /Failed attempts still retain their cost/);
  assert.match(successfulTaskAllowanceText(value, 'ar'), /رحلاتك المحفوظة متاحة/);
  assert.equal(successfulTaskAllowance({dailySucceeded: NaN,monthlySucceeded:0,dailyPending:0,monthlyPending:0,accountHeldCostMicros:0,totalHeldCostMicros:0}), null);
});

test('allowance exposes only account figures while global usage still gates cost availability', () => {
  const usage = { dailySucceeded: 7, monthlySucceeded: 40, dailyPending: 2, monthlyPending: 3,
    accountHeldCostMicros: 123_456, totalHeldCostMicros: policy.monthlyCostMicros - 1 };
  const available = successfulTaskAllowance(usage);
  const expected = { dailyRemaining: 1, monthlyRemaining: 7, dailyPending: 2, monthlyPending: 3,
    accountHeldCostMicros: usage.accountHeldCostMicros, costAvailable: true };
  assert.deepEqual(available, expected);
  for (const totalHeldCostMicros of [policy.monthlyCostMicros, policy.monthlyCostMicros + 1]) {
    const exhausted = successfulTaskAllowance({ ...usage, totalHeldCostMicros });
    assert.deepEqual(exhausted, { ...expected, costAvailable: false });
    const serialized = JSON.stringify(exhausted);
    assert.ok(!serialized.includes('totalHeldCostMicros'));
    assert.ok(!serialized.includes(String(totalHeldCostMicros)));
  }
  for (const totalHeldCostMicros of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(successfulTaskAllowance({ ...usage, totalHeldCostMicros }), null);
  }
});

test('allowance parser accepts only the bounded account-only contract and rejects the old aggregate field', () => {
  const value = { dailyRemaining: 9, monthlyRemaining: 49, dailyPending: 0, monthlyPending: 0,
    accountHeldCostMicros: 922, costAvailable: true };
  const raw = JSON.stringify(value);
  assert.ok(raw.length <= 1024);
  assert.ok([...raw].every(char => char.charCodeAt(0) <= 0x7f));
  assert.equal(parseSuccessfulTaskAllowance(JSON.stringify({ ...value, totalHeldCostMicros: 12_345_678 })), null);
  assert.deepEqual(parseSuccessfulTaskAllowance(raw), value);
  for (const invalid of [
    { ...value, extra: 0 }, { ...value, accountHeldCostMicros: undefined },
    { ...value, accountHeldCostMicros: -1 }, { ...value, accountHeldCostMicros: 0.5 },
    { ...value, dailyRemaining: 11 }, { ...value, monthlyRemaining: 51 },
    { ...value, dailyPending: 11 }, { ...value, monthlyPending: 51 },
    { ...value, costAvailable: 'true' }, null, [],
  ]) assert.equal(parseSuccessfulTaskAllowance(JSON.stringify(invalid)), null);
  assert.equal(parseSuccessfulTaskAllowance(raw.padEnd(1025, ' ')), null);
  assert.equal(parseSuccessfulTaskAllowance('{invalid'), null);
  assert.equal(parseSuccessfulTaskAllowance(null), null);
});

test('both chat surfaces use shared transport retry identity and bilingual quota display', () => {
  for (const file of ['components/dabra/DabraChatCommerce.tsx', 'components/layout/FloatingDibrah.tsx']) {
    const source=readFileSync(file,'utf8');
    assert.match(source,/conversation.transport\(job/);assert.match(source,/'X-DABRA-Request-Id': transport.id/);
    assert.match(source,/body: transport.body/);assert.match(source,/conversation.acceptAllowance\(job, response.headers\)/);
    assert.match(source,/successfulTaskAllowanceText\(conversationState.allowance/);
  }
});
