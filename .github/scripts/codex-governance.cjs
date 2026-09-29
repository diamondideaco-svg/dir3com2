'use strict';

const ALLOWED_OWNERS = ['Codex Desktop', 'VS Code Codex', 'Codex — ChatGPT Work Mode'];
const ALLOWED_REVIEWERS = ['Codex Desktop', 'VS Code Codex', 'Codex Security'];
const ALLOWED_VERDICTS = ['IN_PROGRESS', 'REVIEW', 'PASS', 'FAIL', 'BLOCKED'];

function prField(body, label) {
  const prefixes = ['- ' + label + ':', '* ' + label + ':'].map(value => value.toLowerCase());
  const matches = (body || '').split(/\r?\n/).map(item => item.trim()).filter(item => prefixes.some(prefix => item.toLowerCase().startsWith(prefix)));
  if (matches.length !== 1) return '';
  const separator = matches[0].indexOf(':');
  return separator >= 0 ? matches[0].slice(separator + 1).trim() : '';
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
  for (const label of ['Implementation owner','Independent reviewer','Branch','Current target SHA','Base SHA','Worktree','Last verified result','Next action']) {
    const prLabel = label === 'Current target SHA' ? 'Target SHA' : label;
    if (issueField(input.issueBody, label) !== record[prLabel]) failures.push('Task ' + prLabel + ' must match the PR record.');
  }
  if (!ALLOWED_OWNERS.includes(record['Implementation owner'])) failures.push('Implementation owner must be Codex Desktop, VS Code Codex, or Codex — ChatGPT Work Mode.');
  if (!ALLOWED_REVIEWERS.includes(record['Independent reviewer'])) failures.push('Independent reviewer must be Codex Desktop, VS Code Codex, or Codex Security.');
  if (record['Implementation owner'] === record['Independent reviewer']) failures.push('Implementation owner and independent reviewer must be different.');
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
