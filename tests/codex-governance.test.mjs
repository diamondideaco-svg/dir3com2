import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

// Execute the actual Actions inline validator with in-memory GitHub responses.
// No copied validator, credentials, network request or external action is used.
const workflow = readFileSync('.github/workflows/codex-governance.yml', 'utf8').replace(/\r\n/g, '\n');
const block = workflow.split('          script: |\n')[1];
assert.ok(block, 'the workflow validator must exist');
const source = block.split('\n').map(line => line.replace(/^ {12}/, '')).join('\n');
const sha = 'a'.repeat(40);
const branch = 'feat/governance-fixture';
const workMode = 'Codex — ChatGPT Work Mode';
const loadValidator = createRequire(new URL('../package.json', import.meta.url));

function records(owner = workMode, reviewer = 'Codex Desktop') {
  return {
    pr: { number: 168, head: { ref: branch, sha }, body: [
      '## Control Tower Record', '- Task: #167', `- Implementation owner: ${owner}`,
      `- Independent reviewer: ${reviewer}`, `- Branch: ${branch}`, `- Target SHA: ${sha}`,
      `- Base SHA: ${'b'.repeat(40)}`, '- Worktree: /tmp/governance-fixture',
      '- Last verified result: focused checks pass', '- Next action: reviewer checks exact SHA', '- Verdict: REVIEW',
    ].join('\n') },
    issue: { title: '[Codex Task] Isolated governance fixture', body: [
      '## Implementation owner', owner, '## Independent reviewer', reviewer,
      '## Branch', branch, '## Current target SHA', sha, '## Pull request', '#168',
      '## Base SHA', 'b'.repeat(40), '## Worktree', '/tmp/governance-fixture',
      '## Last verified result', 'focused checks pass', '## Next action', 'reviewer checks exact SHA', '## Current verdict', 'REVIEW',
    ].join('\n') },
  };
}

async function validate(input = records(), unavailable = false) {
  const failures = []; const queries = []; const summaries = [];
  await runInNewContext(`(async () => {\n${source}\n})()`, {
    require(path) {
      assert.equal(path, './.github/scripts/codex-governance.cjs');
      return loadValidator('./.github/scripts/codex-governance.cjs');
    },
    context: { payload: { pull_request: input.pr }, repo: { owner: 'fixture-owner', repo: 'fixture-repo' } },
    github: { rest: { issues: { async get(query) {
      queries.push({ ...query });
      if (unavailable) throw new Error('fixture unavailable');
      return { data: input.issue };
    }, async getComment() { if (!input.receipt) throw new Error('missing receipt'); return { data: input.receipt }; } } } },
    core: {
      summary: { addRaw(value) { summaries.push(value); return { async write() {} }; } },
      setFailed(message) { failures.push(message); },
    },
  }, { timeout: 1000 });
  return { failures, queries, summaries };
}

for (const [owner, reviewer] of [
  ['Codex Desktop', 'VS Code Codex'], ['VS Code Codex', 'Codex Desktop'],
  [workMode, 'Codex Desktop'], [workMode, 'VS Code Codex'], [workMode, 'Codex Security'],
]) {
  test(`governance accepts assigned owner ${owner} with reviewer ${reviewer}`, async () => {
    const result = await validate(records(owner, reviewer));
    assert.deepEqual(result.failures, []);
    assert.deepEqual(result.queries, [{ owner: 'fixture-owner', repo: 'fixture-repo', issue_number: 167 }]);
    assert.match(result.summaries[0], /This gate validates metadata only/);
  });
}

const denied = [
  ['unknown owner', value => { value.pr.body = value.pr.body.replace(workMode, 'Other Agent'); }, /Implementation owner must be/],
  ['owner suffix impersonation', value => { value.pr.body = value.pr.body.replace(workMode, 'Codex Desktop — ChatGPT Work Mode'); }, /Implementation owner must be/],
  ['same Desktop owner and reviewer', value => Object.assign(value, records('Codex Desktop', 'Codex Desktop')), /must be different/],
  ['Work Mode reviewer without session assignment remains denied', value => Object.assign(value, records('VS Code Codex', workMode)), /Independent reviewer must be/],
  ['unknown reviewer', value => { value.pr.body = value.pr.body.replace('- Independent reviewer: Codex Desktop', '- Independent reviewer: Other Agent'); }, /Independent reviewer must be/],
  ['missing Task', value => { value.pr.body = value.pr.body.replace('- Task: #167', ''); }, /Task must reference exactly one/],
  ['PR used as Task', value => { value.issue.pull_request = {}; }, /issue, not a pull request/],
  ['ordinary issue title', value => { value.issue.title = 'Unassigned work'; }, /title must start/],
  ['mismatched Task owner', value => { value.issue.body = value.issue.body.replace(workMode, 'Codex Desktop'); }, /Task Implementation owner must match/],
  ['mismatched Task reviewer', value => { value.issue.body = value.issue.body.replace('Codex Desktop', 'VS Code Codex'); }, /Task Independent reviewer must match/],
  ['mismatched Task PR', value => { value.issue.body = value.issue.body.replace('#168', '#169'); }, /Task Pull request must match/],
  ['mismatched Task branch', value => { value.issue.body = value.issue.body.replace(branch, 'different-branch'); }, /Task Branch must match/],
  ['mismatched PR branch', value => { value.pr.body = value.pr.body.replace(branch, 'different-branch'); }, /Declared Branch must equal/],
  ['stale Task SHA', value => { value.issue.body = value.issue.body.replace(sha, 'b'.repeat(40)); }, /Task Target SHA must match/],
  ['stale PR SHA', value => { value.pr.body = value.pr.body.replace(sha, 'b'.repeat(40)); }, /Target SHA must equal/],
  ['short SHA', value => { value.pr.body = value.pr.body.replace(sha, 'aaaaaaa'); }, /full 40-character/],
  ['invalid verdict', value => { value.pr.body = value.pr.body.replace('REVIEW', 'APPROVED_WITHOUT_REVIEW'); }, /Verdict must be/],
];
for (const [name, mutate, reason] of denied) {
  test(`governance still denies ${name}`, async () => {
    const input = records(); mutate(input);
    assert.match((await validate(input)).failures.join('\n'), reason);
  });
}

test('unavailable Task remains fail-closed', async () => {
  assert.match((await validate(records(), true)).failures.join('\n'), /Task issue could not be verified/);
});

test('untrusted PR body stays data, not executable script', async () => {
  const input = records();
  input.pr.body += '\nNarrative: ${throw new Error("must not run")} $(exit 0)';
  assert.deepEqual((await validate(input)).failures, []);
});

test('forms document conditional Work Mode review and workflow permissions remain read-only', () => {
  const form = readFileSync('.github/ISSUE_TEMPLATE/codex-task.yml', 'utf8').replace(/\r\n/g, '\n');
  const ownerField = form.split('    id: owner\n')[1].split('  - type:')[0];
  const reviewerField = form.split('    id: reviewer\n')[1].split('  - type:')[0];
  assert.ok(ownerField.includes(workMode));
  assert.equal(reviewerField.includes(workMode), true);
  const template = readFileSync('.github/pull_request_template.md', 'utf8').replace(/\r\n/g, '\n');
  assert.ok(template.split('\n').find(line => line.startsWith('- Implementation owner:')).includes(workMode));
  assert.equal(template.split('\n').find(line => line.startsWith('- Independent reviewer:')).includes(workMode), true);
  const permissions = workflow.split('permissions:\n')[1].split('\nconcurrency:')[0];
  assert.match(permissions, /contents: read/);
  assert.match(permissions, /issues: read/);
  assert.match(permissions, /pull-requests: read/);
  assert.doesNotMatch(permissions, /write/);
});

const ownerSession = '11111111-1111-4111-8111-111111111111';
const reviewSession = '22222222-2222-4222-8222-222222222222';
function workModeReview(name = workMode) {
  const value = records(workMode, name);
  const fields = { 'Implementation session': ownerSession, 'Reviewer session': reviewSession, 'Reviewer receipt': '12345' };
  for (const [label, text] of Object.entries(fields)) {
    value.pr.body += `\n- ${label}: ${text}`;
    value.issue.body += `\n## ${label}\n${text}`;
  }
  value.receipt = { id: 12345, issue_url: 'https://api.github.com/repos/fixture-owner/fixture-repo/issues/167', body: [
    `- Independent reviewer: ${name}`, `- Implementation session: ${ownerSession}`, `- Reviewer session: ${reviewSession}`,
    `- Target SHA: ${sha}`, '- Reviewer role: independent reviewer', '- Reviewer authorship: none',
  ].join('\n') };
  return value;
}
for (const name of [workMode, 'Codex - ChatGPT Work Mode', 'ChatGPT Work Model']) {
  test(`truthful reviewer name ${name} requires separate exact non-author receipt`, async () => {
    assert.deepEqual((await validate(workModeReview(name))).failures, []);
  });
}
for (const [name, mutate, reason] of [
  ['same session', v => { v.pr.body = v.pr.body.replace(reviewSession, ownerSession); v.issue.body = v.issue.body.replace(reviewSession, ownerSession); v.receipt.body = v.receipt.body.replace(reviewSession, ownerSession); }, /different sessions/],
  ['label alias cannot hide same session', v => { v.pr.body = v.pr.body.replace(reviewSession, ownerSession); }, /different sessions/],
  ['missing session', v => { v.pr.body = v.pr.body.replace(`- Reviewer session: ${reviewSession}`, ''); }, /concrete implementation and reviewer session/],
  ['Task session mismatch', v => { v.issue.body = v.issue.body.replace(reviewSession, ownerSession); }, /Task Reviewer session must match/],
  ['author participation', v => { v.receipt.body = v.receipt.body.replace('Reviewer authorship: none', 'Reviewer authorship: implementation'); }, /Reviewer authorship/],
  ['owner role receipt', v => { v.receipt.body = v.receipt.body.replace('Reviewer role: independent reviewer', 'Reviewer role: implementation owner'); }, /Reviewer role/],
  ['stale artifact', v => { v.receipt.body = v.receipt.body.replace(sha, 'c'.repeat(40)); }, /Target SHA/],
  ['foreign Task receipt', v => { v.receipt.issue_url = 'https://api.github.com/repos/fixture-owner/fixture-repo/issues/999'; }, /matching Task/],
  ['wrong receipt ID', v => { v.receipt.id = 99999; }, /matching Task/],
  ['duplicate attestation', v => { v.receipt.body += '\n- Reviewer authorship: none'; }, /Reviewer authorship/],
  ['unavailable receipt', v => { delete v.receipt; }, /could not be verified/],
]) {
  test(`conditional Work Mode review denies ${name}`, async () => { const value = workModeReview(); mutate(value); assert.match((await validate(value)).failures.join('\n'), reason); });
}
