import fs from 'node:fs/promises';
import path from 'node:path';
import { renderLabScorecard, runProfessionalizationLab, type LabReport } from '@/lib/ai2/evaluation/professionalization-lab';

function numberArg(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isFinite(value)) throw new Error(`INVALID_${name.toUpperCase().replaceAll('-', '_')}`);
  return value;
}

const count = numberArg('count', 250);
const seed = numberArg('seed', 20260826);
const durationHours = numberArg('duration-hours', 0);
const intervalMs = numberArg('interval-ms', 1000);
const resume = process.argv.includes('--resume');
const outputName = process.argv[process.argv.indexOf('--output') + 1] || (durationHours ? `endurance-${durationHours}h` : `deterministic-${count}`);
const outputDir = path.resolve('artifacts/dabra-professionalization-lab');

async function write(report: LabReport) {
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, `${outputName}.json`), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(outputDir, `${outputName}.md`), renderLabScorecard(report), 'utf8');
}

async function acquireEnduranceLock(): Promise<() => Promise<void>> {
  await fs.mkdir(outputDir, { recursive: true });
  const lockPath = path.join(outputDir, `${outputName}.lock`);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await fs.open(lockPath, 'wx');
      await handle.writeFile(`${process.pid}\n`, 'utf8');
      await handle.close();
      return async () => { await fs.rm(lockPath, { force: true }); };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const existingPid = Number((await fs.readFile(lockPath, 'utf8')).trim());
      try {
        process.kill(existingPid, 0);
        throw new Error(`ENDURANCE_ALREADY_RUNNING_PID_${existingPid}`);
      } catch (probeError) {
        if (probeError instanceof Error && probeError.message.startsWith('ENDURANCE_ALREADY_RUNNING')) throw probeError;
        await fs.rm(lockPath, { force: true });
      }
    }
  }
  throw new Error('ENDURANCE_LOCK_UNAVAILABLE');
}

async function main() {
  if (durationHours <= 0) {
    const report = await runProfessionalizationLab({ count, seed, failureRate: 0.25 });
    await write(report);
    console.log(JSON.stringify({ outputName, totalScenarios: report.totalScenarios, passRate: report.passRate, overallScore: report.overallScore, findings: report.findings, passed: report.passed }));
    if (!report.passed) process.exitCode = 1;
    return;
  }

  const releaseLock = await acquireEnduranceLock();
  try {

  const reportPath = path.join(outputDir, `${outputName}.json`);
  let prior: LabReport | null = null;
  if (resume) {
    try { prior = JSON.parse(await fs.readFile(reportPath, 'utf8')) as LabReport; } catch { throw new Error('ENDURANCE_RESUME_CHECKPOINT_MISSING'); }
    if (prior.mode !== 'endurance' || !prior.passed) throw new Error('ENDURANCE_RESUME_CHECKPOINT_INVALID');
  }
  const priorActiveMs = prior?.endurance?.activeDurationMs ?? (prior ? new Date(prior.completedAt).getTime() - new Date(prior.startedAt).getTime() : 0);
  const targetDurationMs = durationHours * 60 * 60 * 1000;
  if (prior && priorActiveMs >= targetDurationMs) {
    const normalized = { ...prior, seed, endurance: { activeDurationMs: targetDurationMs, cycles: prior.endurance?.cycles ?? Math.floor(prior.totalScenarios / count), resumeCount: prior.endurance?.resumeCount ?? 0 } };
    await write(normalized);
    console.log(JSON.stringify({ outputName, durationHours, cycles: normalized.endurance.cycles, totalScenarios: normalized.totalScenarios, passed: normalized.passed, alreadyComplete: true }));
    return;
  }
  const invocationStartedAt = new Date();
  const startedAt = prior ? new Date(prior.startedAt) : invocationStartedAt;
  const deadline = invocationStartedAt.getTime() + (targetDurationMs - priorActiveMs);
  let cycle = prior?.endurance?.cycles ?? (prior ? Math.floor(prior.totalScenarios / count) : 0);
  let totalScenarios = prior?.totalScenarios ?? 0;
  let passedScenarios = prior?.passedScenarios ?? 0;
  let weightedScore = (prior?.overallScore ?? 0) * totalScenarios;
  const categoryScoreSums: Record<string, number> = {};
  if (prior) for (const [category, score] of Object.entries(prior.categoryScores)) categoryScoreSums[category] = score * cycle;
  const findingTotals = { P0: prior?.findings.P0 ?? 0, P1: prior?.findings.P1 ?? 0, P2: prior?.findings.P2 ?? 0, P3: prior?.findings.P3 ?? 0 };
  let openP1 = prior?.openP1 ?? 0;
  let allPassed = prior?.passed ?? true;
  const resumeCount = (prior?.endurance?.resumeCount ?? (prior ? 0 : -1)) + 1;
  while (Date.now() < deadline) {
    const report = await runProfessionalizationLab({ count, seed: seed + cycle, failureRate: 0.35, mode: 'endurance', startedAt: invocationStartedAt });
    totalScenarios += report.totalScenarios;
    passedScenarios += report.passedScenarios;
    weightedScore += report.overallScore * report.totalScenarios;
    for (const [category, score] of Object.entries(report.categoryScores)) categoryScoreSums[category] = (categoryScoreSums[category] ?? 0) + score;
    for (const severity of ['P0', 'P1', 'P2', 'P3'] as const) findingTotals[severity] += report.findings[severity];
    openP1 += report.openP1;
    allPassed &&= report.passed;
    cycle += 1;
    const aggregate: LabReport = {
      ...report,
      seed,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      totalScenarios,
      passedScenarios,
      passRate: Number(((passedScenarios / totalScenarios) * 100).toFixed(2)),
      overallScore: Number((weightedScore / totalScenarios).toFixed(2)),
      categoryScores: Object.fromEntries(Object.keys(report.categoryScores).map((category) => [category, Number((categoryScoreSums[category] / cycle).toFixed(2))])) as LabReport['categoryScores'],
      findings: { ...findingTotals },
      openP1,
      passed: allPassed,
      results: report.results,
      endurance: { activeDurationMs: priorActiveMs + (Date.now() - invocationStartedAt.getTime()), cycles: cycle, resumeCount },
    };
    await write(aggregate);
    if (!aggregate.passed) throw new Error('ENDURANCE_GATE_FAILED');
    const remaining = deadline - Date.now();
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, remaining)));
  }
  console.log(JSON.stringify({ outputName, durationHours, cycles: cycle, totalScenarios, passed: true }));
  } finally {
    await releaseLock();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
