import assert from 'node:assert/strict';
import test from 'node:test';
import { LAB_CATEGORIES, renderLabScorecard, runProfessionalizationLab } from '@/lib/ai2/evaluation/professionalization-lab';

test('professionalization lab is deterministic by seed and covers every required category', async () => {
  const first = await runProfessionalizationLab({ count: 250, seed: 20260826, failureRate: 0.35 });
  const second = await runProfessionalizationLab({ count: 250, seed: 20260826, failureRate: 0.35 });
  assert.deepEqual(first.results.map(({ seed, category, passed, score }) => ({ seed, category, passed, score })), second.results.map(({ seed, category, passed, score }) => ({ seed, category, passed, score })));
  assert.deepEqual([...new Set(first.results.map((entry) => entry.category))], [...LAB_CATEGORIES]);
  assert.equal(first.totalScenarios, 250);
});

test('professionalization lab meets quality, severity, and category gates', async () => {
  const report = await runProfessionalizationLab({ count: 250, seed: 20260826, failureRate: 0.35 });
  assert.equal(report.passed, true);
  assert.ok(report.overallScore >= 90);
  assert.ok(Object.values(report.categoryScores).every((score) => score >= 85));
  assert.equal(report.findings.P0, 0);
  assert.equal(report.openP1, 0);
  assert.match(renderLabScorecard(report), /Decision: PASS/);
});

test('professionalization lab rejects unsafe run sizes and seeds', async () => {
  await assert.rejects(() => runProfessionalizationLab({ count: 0, seed: 1 }), /INVALID_LAB_COUNT/);
  await assert.rejects(() => runProfessionalizationLab({ count: 1, seed: Number.NaN }), /INVALID_LAB_SEED/);
});
