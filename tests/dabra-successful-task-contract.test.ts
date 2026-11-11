import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SUCCESSFUL_TASK_POLICY as policy, successfulTaskAllowance, successfulTaskAllowanceText } from '../lib/dabra/successful-task-contract';
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

test('both chat surfaces use shared transport retry identity and bilingual quota display', () => {
  for (const file of ['components/dabra/DabraChatCommerce.tsx', 'components/layout/FloatingDibrah.tsx']) {
    const source=readFileSync(file,'utf8');
    assert.match(source,/conversation.transport\(job/);assert.match(source,/'X-DABRA-Request-Id': transport.id/);
    assert.match(source,/body: transport.body/);assert.match(source,/conversation.acceptAllowance\(job, response.headers\)/);
    assert.match(source,/successfulTaskAllowanceText\(conversationState.allowance/);
  }
});
