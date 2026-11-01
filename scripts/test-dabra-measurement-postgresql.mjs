import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, resolve, isAbsolute } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';

const parent = process.env.TASK217_PG_WORKDIR, binaries = process.env.TASK217_PG_BIN;
const dockerImage = process.env.TASK217_PG_DOCKER_IMAGE;
if (dockerImage && !/^sha256:[a-f0-9]{64}$/.test(dockerImage)) throw Error('exact_local_image_digest_required');
if (!parent || !isAbsolute(parent) || (!dockerImage && (!binaries || !isAbsolute(binaries)))
  || (process.platform === 'win32' && !/^D:[\\/]/i.test(parent))) throw Error('isolated_pg_paths_required');
const runId = randomUUID(), containerName = 'task217-measurement-' + runId;
const cluster = join(resolve(parent), 'task217-measurement-pg-' + runId), port = dockerImage ? '5432' : '62417';
mkdirSync(cluster, { recursive: false });
const env = { ...process.env, PGCONNECT_TIMEOUT: '3', PGSSLMODE: 'disable',
  PGPASSFILE: join(cluster, 'no-password-file'), PGSERVICEFILE: join(cluster, 'no-service-file') };
delete env.PGPASSWORD; delete env.PGSERVICE; delete env.PGOPTIONS;
const exe = name => join(binaries ?? '', name + (process.platform === 'win32' ? '.exe' : ''));
function docker(args, input) {
  const r = spawnSync('docker', args, { env, input, encoding: 'utf8', windowsHide: true, timeout: 90000, maxBuffer: 8 * 1024 * 1024 });
  if (r.error || r.status !== 0) throw Error('isolated_docker_pg: ' + (r.error?.message ?? r.stderr));
  return r.stdout.trim();
}
function command(name, args, input) {
  const r = spawnSync(exe(name), args, { env, input, encoding: 'utf8', windowsHide: true, timeout: 90000, maxBuffer: 8 * 1024 * 1024 });
  if (r.error || r.status !== 0) throw Error(name + ': ' + (r.error?.message ?? r.stderr ?? r.stdout));
  return r.stdout.trim();
}
const args = ['-X', '-w', '-h', '127.0.0.1', '-p', port, '-d', 'postgres', '-U', 'task217_measurement_test', '-v', 'ON_ERROR_STOP=1', '-At'];
const query = text => dockerImage ? docker(['exec', '-i', containerName, 'psql', ...args], text) : command('psql', args, text);
const literal = value => "'" + String(value).replaceAll("'", "''") + "'";
const json = value => literal(JSON.stringify(value)) + '::jsonb';
let checks = 0, started = false;
function check(condition, label) { assert.ok(condition, label); checks++; process.stdout.write('OK ' + checks + ' ' + label + '\n'); }
const subject = createHash('sha256').update('SYNTHETIC-local-pg-a').digest('hex'), otherSubject = createHash('sha256').update('SYNTHETIC-local-pg-b').digest('hex');
const definitions = [
  ['intent-ar', 'intent.classify', 'ar'], ['intent-en', 'intent.classify', 'en'],
  ['discover-ar', 'discover', 'ar'], ['discover-en', 'discover', 'en'],
];
const input = 4096, output = 256, cost = 10752;
function seed({ credit = 100000, expired = false, fifth = false, who = subject } = {}) {
  const now = Date.now(), id = randomUUID();
  const permit = {
    schema: 'task217-first-profile-v1', planId: randomUUID(), sourceSha: 'b'.repeat(40), caseSetSha: 'c'.repeat(64), subjectHash: who,
    expiresAtMs: now + (expired ? -1 : 600000), inputTokenCeiling: input, outputTokenCeiling: output,
    cases: definitions.map(([caseId, stage, language]) => ({ caseId, stage, language, requestId: randomUUID() })),
  };
  if (fifth) permit.cases.push({ ...permit.cases[0], requestId: randomUUID() });
  const proof = {
    grantId: id, provider: 'anthropic', model: 'SYNTHETIC-model', environment: 'provider-benchmark',
    accountId: 'SYNTHETIC-' + id, projectId: 'SYNTHETIC-project', evidenceSha256: 'd'.repeat(64), credentialSha256: 'e'.repeat(64),
    verifiedAtMs: now - 1000, expiresAtMs: now + 600000, quotaWindowStartMs: now - 3600000, quotaWindowEndMs: now + 3600000,
    remainingRequests: 60, remainingInputTokens: 245760, remainingOutputTokens: 61440,
    autoReload: 'off', postpaid: 'blocked', overdraft: 'blocked', concurrentAccountUsage: 'bounded',
    mode: 'existing-credit', currency: 'USD', serviceTier: 'standard', pricing: 'standard-2026-10-28',
    authorizedCreditMicros: credit, remainingCreditMicros: credit, measurementPermit: permit,
  };
  query('INSERT INTO private.dabra_dialogue_funding_grants(id,provider,account_id,project_id,funding_mode,authorized_credit_micros,'
    + 'input_rate_micros_per_million,output_rate_micros_per_million,pricing_expires_at,enabled,proof,authorized_at) VALUES('
    + [literal(id), "'anthropic'", literal(proof.accountId), literal(proof.projectId), "'existing-credit'", credit,
      2000000, 10000000, "clock_timestamp()+interval '10 minutes'", true, json(proof), "clock_timestamp()-interval '1 second'"].join(',') + ');');
  return { id, proof, permit };
}
function claimSQL(g, index = 0, changes = {}) {
  const c = g.permit.cases[index];
  const values = {
    attempt: randomUUID(), request: c.requestId, stage: c.stage, subject: g.permit.subjectHash, input, output, cost,
    proof: { ...g.proof, measurementRequest: { planId: g.permit.planId, caseId: c.caseId } }, ...changes,
  };
  return 'SELECT public.reserve_dabra_dialogue_attempt('
    + [literal(values.attempt) + '::uuid', literal(values.request) + '::uuid', literal(values.stage), literal(values.subject),
      literal(g.id) + '::uuid', json(values.proof), values.input, values.output, values.cost,
      '(SELECT daily_limits FROM private.dabra_dialogue_funding_control WHERE singleton)',
      "floor((floor(extract(epoch FROM clock_timestamp())*1000)+10800000)::numeric/86400000)::bigint*86400000-10800000"].join(',') + ');';
}
const decision = (g, i, changes) => JSON.parse(query(claimSQL(g, i, changes))).decision;
function concurrent(text) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(dockerImage ? 'docker' : exe('psql'), dockerImage ? ['exec', '-i', containerName, 'psql', ...args] : args, { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(Error('isolated_pg_test_timeout')); }, 20000);
    child.stdout.on('data', value => { stdout += value; }); child.stderr.on('data', value => { stderr += value; });
    child.on('error', reject); child.on('exit', code => { clearTimeout(timer); if (code === 0) resolveResult(stdout.trim()); else reject(Error(stderr)); });
    child.stdin.end(text);
  });
}
try {
  if (dockerImage) {
    // Existing official image only; no download, host port, external network, shared DB or writable root layer.
    docker(['run','--detach','--pull=never','--read-only','--network=none','--name',containerName,'--user','postgres',
      '--mount','type=bind,source='+cluster+',target=/task217','--env','TMPDIR=/task217/tmp','--entrypoint','/bin/sh',dockerImage,
      '-c','mkdir -p /task217/data /task217/tmp && initdb -D /task217/data -A trust -U task217_measurement_test --encoding=UTF8 --locale=C --no-instructions > /task217/initdb.log 2>&1 && exec postgres -D /task217/data -h 127.0.0.1 -p 5432 -k "" -c shared_buffers=16MB -c max_connections=10 > /task217/postgres.log 2>&1']);
    started = true;
    const isolation = JSON.parse(docker(['inspect',containerName,'--format','{{json .HostConfig}}']));
    const mounts = JSON.parse(docker(['inspect',containerName,'--format','{{json .Mounts}}']));
    check(isolation.NetworkMode === 'none' && isolation.ReadonlyRootfs === true && Object.keys(isolation.PortBindings ?? {}).length === 0, 'container has no external network/host ports and read-only root');
    const dataMount = mounts.find(m => m.Destination === '/task217');
    check(dataMount?.Type === 'bind' && dataMount.Source.replaceAll('\\','/').toLowerCase() === cluster.replaceAll('\\','/').toLowerCase(), 'real PostgreSQL data/log/temp bind to the verified D directory');
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try { docker(['exec',containerName,'pg_isready','-h','127.0.0.1','-p','5432','-U','task217_measurement_test']); ready = true; break; }
      catch { await new Promise(resolveDelay => setTimeout(resolveDelay, 3000)); }
    }
    if (!ready) {
      const initLog = (() => { try { return readFileSync(join(cluster,'initdb.log'),'utf8').slice(-1800); } catch { return ''; } })();
      throw Error('isolated_pg_start_failed: ' + initLog);
    }
  } else {
    command('initdb', ['-D', cluster, '-A', 'trust', '-U', 'task217_measurement_test', '--encoding=UTF8', '--locale=C', '--no-instructions']);
    command('pg_ctl', ['start', '-D', cluster, '-l', join(cluster, 'postgres.log'), '-w', '-t', '30',
      '-o', '-h 127.0.0.1 -p ' + port + ' -c shared_buffers=16MB -c max_connections=10']);
    started = true;
  }
  process.stdout.write('ENGINE ' + query('SELECT version();') + '\nDATA ' + cluster + '\n');
  query('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  query(readFileSync('supabase/migrations/20261028174710_task217_dialogue_funding_admission.sql', 'utf8'));
  const aclQuery = "SELECT oid::regprocedure::text,proacl::text,prosecdef,proconfig::text FROM pg_proc WHERE oid IN ("
    + "'public.reserve_dabra_dialogue_attempt(uuid,uuid,text,text,uuid,jsonb,integer,integer,bigint,jsonb,bigint)'::regprocedure,"
    + "'private.protect_dabra_dialogue_grant()'::regprocedure) ORDER BY 1;";
  const acl = query(aclQuery), rls = query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='private'::regnamespace AND relkind='r' ORDER BY 1;");
  query(readFileSync('supabase/migrations/20261101102846_task217_first_profile_measurement_guard.sql', 'utf8'));
  check(query(aclQuery) === acl, 'existing RPC signature/security settings and ACL preserved');
  check(query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='private'::regnamespace AND relkind='r' ORDER BY 1;") === rls, 'existing tables and forced RLS unchanged');
  query('UPDATE private.dabra_dialogue_funding_control SET enabled=true,subject_hashes=ARRAY[' + literal(subject) + ',' + literal(otherSubject) + '],max_attempt_cost_micros=20000;');
  const g = seed();
  check(decision(g, 0, { proof: g.proof }) === 'denied', 'ordinary path with no qualified profile denied');
  for (let i = 0; i < 4; i++) {
    check(decision(g, i) === 'admitted', 'measurement admits fixed case ' + definitions[i][0] + ' without fake profile');
    check(decision(g, i) === 'denied', 'case/request replay denied with a changed attempt ID');
  }
  check(query('SELECT reserved_credit_micros FROM private.dabra_dialogue_funding_grants WHERE id=' + literal(g.id)) === String(4 * cost), 'four holds accumulated exactly once');
  check(decision(g, 0, { subject: otherSubject }) === 'denied', 'subject/session cannot reset a case');
  check(decision(g, 0, { request: randomUUID() }) === 'denied', 'case cannot replace its fixed request UUID');
  check(decision(g, 0, { stage: 'discover' }) === 'denied', 'case stage is bound');
  check(decision(g, 0, { proof: { ...g.proof, accountId: 'SYNTHETIC-wrong', measurementRequest: { planId: g.permit.planId, caseId: 'intent-ar' } } }) === 'denied', 'full remaining financial proof equality enforced');
  const profiles = [{ provider: 'anthropic', measurement: { capability: 'discover', language: 'en', model: g.proof.model,
    environment: 'provider-benchmark', sourceSha: 'b'.repeat(40), caseSetSha: 'c'.repeat(64), cases: 1, passed: 1,
    measuredAtMs: Date.now(), expiresAtMs: Date.now() + 600000, latencyMs: 1, inputTokenCeiling: input, outputTokenCeiling: output, costCeilingUsd: cost / 1000000 } }];
  query('UPDATE private.dabra_dialogue_funding_control SET profiles=' + json(profiles) + ';');
  check(decision(g, 3, { proof: g.proof }) === 'denied', 'ordinary envelope omission cannot replay a measurement request');
  for (const wrapper of [null, [], {}, { planId: g.permit.planId }, { planId: g.permit.planId, caseId: 'fifth' },
    { planId: g.permit.planId, caseId: 'discover-en', extra: true }]) {
    check(decision(g, 3, { request: randomUUID(), proof: { ...g.proof, measurementRequest: wrapper } }) === 'denied',
      'malformed measurement never falls through to qualified ordinary path');
  }
  for (const key of ['planId','sourceSha','caseSetSha','subjectHash','cases']) {
    const replacement = key === 'cases' ? [...g.permit.cases].reverse() : key === 'planId' ? randomUUID() : 'f'.repeat(key === 'sourceSha' ? 40 : 64);
    let denied = false;
    try { query("UPDATE private.dabra_dialogue_funding_grants SET proof=jsonb_set(proof,'{measurementPermit," + key + "}'," + json(replacement) + ') WHERE id=' + literal(g.id) + ';'); }
    catch (error) { denied = String(error).includes('DIALOGUE_MEASUREMENT_IMMUTABLE'); }
    check(denied, 'proof refresh cannot reset measurement ' + key);
  }
  query("UPDATE private.dabra_dialogue_funding_grants SET proof=jsonb_set(proof,'{evidenceSha256}'," + json('f'.repeat(64)) + ') WHERE id=' + literal(g.id) + ';');
  g.proof.evidenceSha256 = 'f'.repeat(64);
  check(decision(g, 3, { request: randomUUID(), proof: g.proof }) === 'admitted', 'reviewed ordinary profile can use remaining SAME grant after legitimate financial refresh');
  check(query('SELECT reserved_credit_micros FROM private.dabra_dialogue_funding_grants WHERE id=' + literal(g.id)) === String(5 * cost), 'financial refresh did not reset old holds');
  const low = seed({ credit: cost - 1 });
  check(decision(low) === 'denied', 'insufficient financial budget denied before any hold');
  check(decision(seed({ expired: true })) === 'denied', 'expired plan denied');
  check(decision(seed({ fifth: true })) === 'denied', 'stored fifth case denied');
  const race = seed({ who: otherSubject });
  const outcomes = await Promise.all([concurrent(claimSQL(race, 0)), concurrent(claimSQL(race, 0))]);
  check(outcomes.map(value => JSON.parse(value).decision).sort().join(',') === 'admitted,denied', 'real concurrent duplicate reserves admit exactly one');
  check(decision(race, 0) === 'denied', 'committed hold with discarded reply cannot be retried');
  check(query('SELECT reserved_credit_micros FROM private.dabra_dialogue_funding_grants WHERE id=' + literal(race.id)) === String(cost), 'unknown/replay keeps the same financial hold');
  const deniedTables = query("SELECT bool_and(NOT has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')) FROM pg_class c WHERE c.relnamespace='private'::regnamespace AND c.relkind='r';");
  check(deniedTables === 't', 'service_role still has no direct private ledger table privileges');
  let anonymousDenied = false;
  try { query("SET ROLE anon; SELECT public.get_dabra_dialogue_funding_policy(" + literal(subject) + ');'); }
  catch (error) { anonymousDenied = String(error).includes('permission denied'); }
  check(anonymousDenied, 'anonymous cannot read policy/financial proofs');

} finally {
  if (started && dockerImage) {
    docker(['stop','--time','10',containerName]);
    check(docker(['inspect',containerName,'--format','{{.State.Running}}']) === 'false', 'owned isolated PostgreSQL stopped; files and container retained');
  } else if (started) command('pg_ctl', ['stop', '-D', cluster, '-m', 'fast', '-w', '-t', '30']);
}

process.stdout.write('POSTGRES_MEASUREMENT_DELTA=PASS CHECKS=' + checks + '\nNo external provider calls; isolated synthetic cluster only; files retained.\n');
