'use strict';

const ALLOWED_OWNERS = ['Codex Desktop', 'VS Code Codex', 'Codex — ChatGPT Work Mode'];
const ALLOWED_REVIEWERS = ['Codex Desktop', 'VS Code Codex', 'Codex Security'];
const WORK_MODE_NAMES = ['Codex - ChatGPT Work Mode', 'Codex — ChatGPT Work Mode', 'ChatGPT Work Model'];
const identity = value => WORK_MODE_NAMES.includes(value) ? ALLOWED_OWNERS[2] : value;
const ALLOWED_VERDICTS = ['IN_PROGRESS', 'REVIEW', 'PASS', 'FAIL', 'BLOCKED'];

function prField(body, label) {
  const matches = (body || '').split(/\r?\n/).flatMap(line => {
    const match = line.trim().match(/^[-*]\s*([^:]+):\s*(.*)$/);
    return match && match[1].trim().toLowerCase() === label.toLowerCase() ? [match[2].trim()] : [];
  });
  return matches.length === 1 ? matches[0] : '';
}
function issueField(body, label) {
  const lines = (body || '').split(/\r?\n/);
  const headings = ['## ' + label, '### ' + label].map(value => value.toLowerCase());
  const indexes = lines.flatMap((line, index) => headings.includes(line.trim().toLowerCase()) ? [index] : []);
  if (indexes.length !== 1) return '';
  const section = [];
  for (const line of lines.slice(indexes[0] + 1)) {
    if (/^#{2,3}\s+/.test(line.trim())) break;
    if (line.trim()) section.push(line.trim());
  }
  return section.length === 1 ? section[0] : '';
}
function validate(input) {
  const labels = ['Task','Implementation owner','Independent reviewer','Branch','Target SHA','Base SHA','Worktree','Last verified result','Next action','Verdict'];
  const record = Object.fromEntries(labels.map(label => [label, prField(input.prBody, label)]));
  record.Verdict = record.Verdict.toUpperCase();
  const failures = [];
  if (!/^#[0-9]+$/.test(record.Task)) failures.push('Task must reference exactly one GitHub Codex Task issue as #number.');
  if (input.taskIsPullRequest) failures.push('Task must reference a GitHub issue, not a pull request.');
  if (!input.taskTitle.startsWith('[Codex Task]')) failures.push('Task issue title must start with [Codex Task].');
  const taskPr = issueField(input.issueBody, 'Pull request');
  const validTaskPrs = ['#' + input.prNumber, 'https://github.com/' + input.repoOwner + '/' + input.repoName + '/pull/' + input.prNumber];
  if (!validTaskPrs.includes(taskPr)) failures.push('Task Pull request must match the current PR number or canonical URL.');
  for (const label of ['Implementation owner','Independent reviewer','Branch','Current target SHA','Base SHA','Worktree','Last verified result','Next action','Current verdict']) {
    const prLabel = label === 'Current target SHA' ? 'Target SHA' : label === 'Current verdict' ? 'Verdict' : label;
    if (issueField(input.issueBody, label) !== record[prLabel]) failures.push('Task ' + prLabel + ' must match the PR record.');
  }
  const owner = identity(record['Implementation owner']), reviewer = identity(record['Independent reviewer']);
  if (!ALLOWED_OWNERS.includes(owner)) failures.push('Implementation owner must be Codex Desktop, VS Code Codex, or Codex - ChatGPT Work Mode.');
  if (!ALLOWED_REVIEWERS.includes(reviewer) && reviewer !== ALLOWED_OWNERS[2]) failures.push('Independent reviewer must be an assigned Codex Desktop, VS Code Codex, Codex Security, or separate Codex - ChatGPT Work Mode session.');
  if (reviewer === ALLOWED_OWNERS[2]) {
    const sessionFields = ['Implementation session', 'Reviewer session', 'Reviewer receipt'];
    for (const label of sessionFields) {
      record[label] = prField(input.prBody, label);
      if (issueField(input.issueBody, label) !== record[label]) failures.push('Task ' + label + ' must match the PR record.');
    }
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(record['Implementation session']) || !uuid.test(record['Reviewer session'])) failures.push('Independent reviewer must be assigned with concrete implementation and reviewer session IDs.');
    if (record['Implementation session'].toLowerCase() === record['Reviewer session'].toLowerCase()) failures.push('Implementation owner and independent reviewer must be different sessions.');
    const receipt = input.reviewerReceipt;
    const issueUrl = 'https://api.github.com/repos/' + input.repoOwner + '/' + input.repoName + '/issues/' + record.Task.slice(1);
    if (!/^[1-9][0-9]*$/.test(record['Reviewer receipt']) || !receipt || String(receipt.id) !== record['Reviewer receipt'] || receipt.issue_url !== issueUrl) failures.push('Reviewer receipt must be a fetched comment on the matching Task issue.');
    else {
      const expected = { 'Independent reviewer': record['Independent reviewer'], 'Implementation session': record['Implementation session'], 'Reviewer session': record['Reviewer session'], 'Target SHA': record['Target SHA'], 'Reviewer role': 'independent reviewer', 'Reviewer authorship': 'none' };
      for (const [label, value] of Object.entries(expected)) {
        if (prField(receipt.body, label) !== value) failures.push('Reviewer receipt ' + label + ' must match the assigned exact artifact and non-author review role.');
      }
    }
  } else if (owner === reviewer) failures.push('Implementation owner and independent reviewer must be different.');
  if (record.Branch !== input.actualBranch) failures.push('Declared Branch must equal actual PR head branch: ' + input.actualBranch);
  if (!/^[0-9a-f]{40}$/i.test(record['Target SHA'])) failures.push('Target SHA must be a full 40-character commit SHA.');
  if (record['Target SHA'].toLowerCase() !== input.actualSha.toLowerCase()) failures.push('Target SHA must equal actual PR head SHA: ' + input.actualSha);
  if (!/^[0-9a-f]{40}$/i.test(record['Base SHA'])) failures.push('Base SHA must be a full 40-character commit SHA.');
  for (const label of ['Worktree','Last verified result','Next action']) {
    if (!record[label] || /^(TBD|UNVERIFIED)$/i.test(record[label])) failures.push(label + ' must be concrete before PR validation.');
  }
  if (!ALLOWED_VERDICTS.includes(record.Verdict)) failures.push('Verdict must be IN_PROGRESS, REVIEW, PASS, FAIL, or BLOCKED.');
  return { record, failures };
}
module.exports = { validate };
