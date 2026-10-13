'use strict';
const { createHash, createPublicKey, verify } = require('node:crypto');
const hash = text => createHash('sha256').update(text, 'utf8').digest('hex');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha = /^[0-9a-f]{40}$/i;
const digest = /^[0-9a-f]{64}$/;
const numeric = value => typeof value === 'string' && /^[1-9][0-9]{0,14}$/.test(value) && Number.isSafeInteger(Number(value));
function field(body, name, issue = false) {
  const lines = (body || '').split(/\r?\n/);
  if (!issue) {
    const matches = lines.flatMap(line => {
      const m = line.trim().match(/^[-*]\s*([^:]+):\s*(.*)$/);
      return m && m[1].trim().toLowerCase() === name.toLowerCase() ? [m[2].trim()] : [];
    });
    return matches.length === 1 ? matches[0] : '';
  }
  const positions = lines.flatMap((line, i) => /^#{2,3}\s+/.test(line.trim()) && line.trim().replace(/^#{2,3}\s+/, '').toLowerCase() === name.toLowerCase() ? [i] : []);
  if (positions.length !== 1) return '';
  const values = [];
  for (const line of lines.slice(positions[0] + 1)) {
    if (/^#{2,3}\s+/.test(line.trim())) break;
    if (line.trim()) values.push(line.trim());
  }
  return values.length === 1 ? values[0] : '';
}
function decode64(value) {
  if (typeof value !== 'string' || value.length > 65536) throw new Error('Invalid proof encoding.');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) throw new Error('Noncanonical proof encoding.');
  return bytes;
}
function proof(body, policy, now) {
  if (!policy || policy.version !== 2 || !Array.isArray(policy.authorities) || !Array.isArray(policy.requiredScopes) || !policy.requiredScopes.includes('functional')) throw new Error('Trusted policy unavailable.');
  if (typeof body !== 'string' || body.length > 90000) throw new Error('Proof unavailable or oversized.');
  const envelope = JSON.parse(body);
  if (JSON.stringify(envelope) !== body) throw new Error('Noncanonical proof envelope.');
  if (Object.keys(envelope).sort().join(',') !== 'keyId,payload,signature') throw new Error('Invalid proof envelope.');
  const keys = policy.authorities.filter(k => k.id === envelope.keyId && k.purpose === 'session-review' && k.revoked !== true);
  if (keys.length !== 1) throw new Error('Untrusted or revoked proof authority.');
  const bytes = decode64(envelope.payload), signature = decode64(envelope.signature);
  const key = createPublicKey(keys[0].publicKey);
  if (key.asymmetricKeyType !== 'ed25519' || signature.length !== 64 || !verify(null, bytes, key, signature)) throw new Error('Invalid evidence signature.');
  const text = bytes.toString('utf8'), data = JSON.parse(text);
  if (JSON.stringify(data) !== text) throw new Error('Noncanonical proof payload.');
  const issued = Date.parse(data.issuedAt), expires = Date.parse(data.expiresAt);
  if (!Number.isFinite(now) || !Number.isFinite(issued) || !Number.isFinite(expires) || issued > now || expires <= now || expires <= issued || expires - issued > 30 * 86400000) throw new Error('Expired or invalid evidence interval.');
  if (!Array.isArray(keys[0].repositories) || !keys[0].repositories.includes(data.repository)) throw new Error('Authority not enrolled for repository.');
  return data;
}
function validate(input) {
  const failures = [], fail = message => failures.push(message);
  const names = ['Governance version','Task','Implementation owner','Independent reviewer','Implementation role','Reviewer role','Implementation session','Reviewer session','Reviewer receipt','Governance proof receipt','Evidence scope','Branch','Target SHA','Base SHA','Worktree','Last verified result','Next action','Verdict'];
  const record = Object.fromEntries(names.map(name => [name, field(input.prBody, name)]));
  if (record['Governance version'] !== '2') return { record, failures: ['Legacy/unversioned evidence is historical only; v2 proof is required for current approval.'] };
  for (const name of names) {
    const issueName = name === 'Target SHA' ? 'Current target SHA' : name === 'Verdict' ? 'Current verdict' : name;
    if (!record[name] || field(input.issueBody, issueName, true) !== record[name]) fail('Task/PR missing, duplicated or mismatched ' + name + '.');
  }
  if (input.taskIsPullRequest || !input.taskTitle?.startsWith('[Codex Task]')) fail('Task must be a Codex Task issue.');
  const repo = input.repoOwner + '/' + input.repoName;
  if (!/^#[1-9][0-9]*$/.test(record.Task)) fail('Invalid Task reference.');
  if (!['#' + input.prNumber, 'https://github.com/' + repo + '/pull/' + input.prNumber].includes(field(input.issueBody, 'Pull request', true))) fail('Task PR mismatch.');
  if (record.Branch !== input.actualBranch) fail('Actual branch mismatch.');
  if (!sha.test(record['Target SHA']) || record['Target SHA'].toLowerCase() !== input.actualSha?.toLowerCase() || !sha.test(record['Base SHA'])) fail('Actual SHA/base mismatch.');
  if (!['IN_PROGRESS','REVIEW','PASS','FAIL','BLOCKED'].includes(record.Verdict)) fail('Invalid verdict.');
  if (record['Implementation role'] !== 'implementer' || record['Reviewer role'] !== 'independent reviewer') fail('Invalid assigned roles.');
  const owner = record['Implementation session'], reviewer = record['Reviewer session'];
  if (!uuid.test(owner) || !uuid.test(reviewer) || owner.toLowerCase() === reviewer.toLowerCase()) fail('Verified different sessions required.');
  if (!numeric(record['Reviewer receipt']) || !numeric(record['Governance proof receipt'])) fail('Invalid receipt reference.');
  let data;
  try {
    const comment = input.proofReceipt;
    if (!comment || String(comment.id) !== record['Governance proof receipt'] || comment.issue_url !== 'https://api.github.com/repos/' + repo + '/issues/' + record.Task.slice(1)) throw new Error('Proof receipt must belong to the exact Task.');
    data = proof(comment.body, input.trustPolicy, input.now);
    for (const [k, v] of Object.entries({version:2,repository:repo,task:record.Task,pr:input.prNumber,sha:record['Target SHA'],baseSha:record['Base SHA'],branch:record.Branch,scope:record['Evidence scope'],ownerSession:owner.toLowerCase()})) {
      if (data[k] !== v) fail('Signed binding mismatch: ' + k + '.');
    }
    if (!Array.isArray(data.authorSessions) || !data.authorSessions.includes(owner.toLowerCase()) || data.authorSessions.some(s => !uuid.test(s)) || new Set(data.authorSessions.map(s => s.toLowerCase())).size !== data.authorSessions.length) fail('Verified authorship set required.');
    if (!Array.isArray(data.sessions) || data.sessions.length < 2 || data.sessions.length > 32 || new Set(data.sessions.map(s => s.id?.toLowerCase())).size !== data.sessions.length) throw new Error('Unique verified session certificates required.');
    for (const s of data.sessions) {
      if (!uuid.test(s.id) || s.id !== s.id.toLowerCase() || s.verified !== true || !s.surface || !s.source || !digest.test(s.runtimeEvidenceHash)) fail('Unproven session identity/provenance.');
    }
    const ownerCert = data.sessions.find(s => s.id === owner.toLowerCase());
    const reviewCert = data.sessions.find(s => s.id === reviewer.toLowerCase());
    if (ownerCert?.surface !== record['Implementation owner'] || reviewCert?.surface !== record['Independent reviewer']) fail('Surface description conflicts with trusted runtime evidence.');
    if (!Array.isArray(data.reviews) || data.reviews.length < 1 || data.reviews.length > 8 || new Set(data.reviews.map(r => r.scope)).size !== data.reviews.length) throw new Error('Distinct scoped reviews required.');
    const primary = data.reviews.find(r => r.scope === 'functional');
    if (!primary || primary.session !== reviewer.toLowerCase() || String(primary.receipt) !== record['Reviewer receipt']) fail('Primary independent reviewer mismatch.');
    const required = new Set(input.trustPolicy.requiredScopes);
    if (!Array.isArray(input.changedFiles)) throw new Error('Changed-file scope unavailable.');
    if (input.changedFiles.some(p => p === 'AGENTS.md' || p.startsWith('.github/') || p.startsWith('docs/CODEX_') || p.startsWith('.agents/skills/'))) required.add('security-policy');
    for (const scope of required) if (!data.reviews.some(r => r.scope === scope)) fail('Missing trusted coverage: ' + scope + '.');
    const seenReviewers = new Set();
    for (const review of data.reviews) {
      const cert = data.sessions.find(s => s.id === review.session);
      if (!cert || review.authorship !== 'none' || review.role !== 'independent reviewer' || data.authorSessions?.some(s => s.toLowerCase() === review.session?.toLowerCase()) || seenReviewers.has(review.session)) fail('Author/self-review or non-independent scope reviewer.');
      seenReviewers.add(review.session);
      if (review.verdict !== 'PASS' || !numeric(String(review.receipt)) || !digest.test(review.bodySha256)) fail('Incomplete exact-artifact review.');
      const receipt = input.reviewReceipts?.[String(review.receipt)];
      if (!receipt || String(receipt.id) !== String(review.receipt) || receipt.issue_url !== input.proofReceipt.issue_url || hash(receipt.body) !== review.bodySha256) { fail('Missing, foreign or edited review receipt.'); continue; }
      const expected = {'Governance version':'2','Task':record.Task,'PR':'#'+input.prNumber,'Target SHA':record['Target SHA'],'Evidence scope':review.scope,'Implementation session':owner,'Reviewer session':review.session,'Reviewer role':'independent reviewer','Reviewer authorship':'none','Review verdict':'PASS'};
      for (const [name, value] of Object.entries(expected)) if (field(receipt.body, name) !== value) fail('Review receipt mismatch: ' + name + '.');
    }
  } catch (error) { fail(error.message); }
  return { record, failures, decision: failures.length ? 'BLOCKED' : 'REVIEW_PROVEN', releaseAuthorized: false };
}
module.exports = { validate, proof, field, hash };
