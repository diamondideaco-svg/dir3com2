import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

// Execute the actual Actions inline validator with in-memory GitHub responses.
// No copied validator, credentials, network request or external action is used.
const workflow = readFileSync('.github/workflows/codex-governance.yml', 'utf8');
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
    } } } },
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
  ['Work Mode reviewer remains disallowed', value => Object.assign(value, records('VS Code Codex', workMode)), /Independent reviewer must be/],
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

test('forms document Work Mode only as owner and workflow permissions remain read-only', () => {
  const form = readFileSync('.github/ISSUE_TEMPLATE/codex-task.yml', 'utf8');
  const ownerField = form.split('    id: owner\n')[1].split('  - type:')[0];
  const reviewerField = form.split('    id: reviewer\n')[1].split('  - type:')[0];
  assert.ok(ownerField.includes(workMode));
  assert.equal(reviewerField.includes(workMode), false);
  const template = readFileSync('.github/pull_request_template.md', 'utf8');
  assert.ok(template.split('\n').find(line => line.startsWith('- Implementation owner:')).includes(workMode));
  assert.equal(template.split('\n').find(line => line.startsWith('- Independent reviewer:')).includes(workMode), false);
  const permissions = workflow.split('permissions:\n')[1].split('\nconcurrency:')[0];
  assert.match(permissions, /contents: read/);
  assert.match(permissions, /issues: read/);
  assert.match(permissions, /pull-requests: read/);
  assert.doesNotMatch(permissions, /write/);
});
