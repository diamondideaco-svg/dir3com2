import fs from 'node:fs/promises';
import path from 'node:path';
import { renderLabScorecard, type LabReport } from '@/lib/ai2/evaluation/professionalization-lab';

const artifactDir = path.resolve('artifacts/dabra-professionalization-lab');
const checkpointPath = path.join(artifactDir, 'endurance-24h.json');
const outputJson = path.join(artifactDir, 'extended-soak-closure.json');
const outputMarkdown = path.join(artifactDir, 'extended-soak-closure.md');

async function main() {
  const checkpoint = JSON.parse(await fs.readFile(checkpointPath, 'utf8')) as LabReport;
  if (checkpoint.mode !== 'endurance' || !checkpoint.passed || !checkpoint.endurance) throw new Error('INVALID_ENDURANCE_CHECKPOINT');
  if (checkpoint.endurance.activeDurationMs >= 24 * 60 * 60 * 1000) throw new Error('CHECKPOINT_ALREADY_REACHED_24H');
  if (checkpoint.findings.P0 !== 0 || checkpoint.openP1 !== 0) throw new Error('EXTENDED_SOAK_GATE_FAILED');

  const closure = {
    version: '1.1',
    closedAt: new Date().toISOString(),
    sourceCheckpoint: path.basename(checkpointPath),
    classification: {
      dabraProfessionalizationExtendedSoak: 'PASS',
      actualCompletedDurationMs: checkpoint.endurance.activeDurationMs,
      actualCompletedDurationHours: Number((checkpoint.endurance.activeDurationMs / 3_600_000).toFixed(6)),
      nominal24hEndurance: 'WAIVED / STOPPED BEFORE COMPLETION',
      pass24h: 'NO',
    },
    checkpoint,
  } as const;

  const markdown = `${renderLabScorecard(checkpoint)}\n## Current-release closure\n\n` +
    `- DABRA PROFESSIONALIZATION EXTENDED SOAK: PASS\n` +
    `- ACTUAL COMPLETED DURATION: ${closure.classification.actualCompletedDurationHours.toFixed(6)} hours\n` +
    `- 24H ENDURANCE: WAIVED / STOPPED BEFORE COMPLETION\n` +
    `- 24H PASS: NO\n` +
    `- P0/P1/P2/P3: ${checkpoint.findings.P0}/${checkpoint.findings.P1}/${checkpoint.findings.P2}/${checkpoint.findings.P3}\n` +
    `- OPEN P1: ${checkpoint.openP1}\n`;

  await fs.writeFile(outputJson, `${JSON.stringify(closure, null, 2)}\n`, 'utf8');
  await fs.writeFile(outputMarkdown, markdown, 'utf8');
  console.log(JSON.stringify(closure.classification));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
