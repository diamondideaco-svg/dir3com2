import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

// Execute the real replay block with a deterministic database response ordering:
// the waiting query settles before COMMIT's response reaches the locker client.
const replay = readFileSync(new URL('../scripts/run-admin-partner-lifecycle-postgresql.mjs', import.meta.url), 'utf8');
const start = replay.indexOf('  const countryRaceProductId =');
const end = replay.indexOf("  await testClient.query('SET ROLE service_role');", start);
assert.ok(start > 0 && end > start, 'country authorization race block exists');
const block = replay.slice(start, end);

function runRace(outcome: string) {
  const setup = `
    const outcome = ${JSON.stringify(outcome)};
    let settleQuery;
    let observedLock = false;
    let ended = 0;
    const countryLockerMock = {
      async query(sql) {
        if (sql === 'COMMIT') {
          if (!observedLock) throw new Error('COMMIT preceded lock observation');
          settleQuery();
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        return { rows: [] };
      },
      async end() { ended++; },
    };
    const countryWaiterMock = {
      query(sql) {
        if (sql.includes('pg_backend_pid')) return Promise.resolve({ rows: [{ pid: 123 }] });
        return new Promise((resolve, reject) => {
          settleQuery = () => outcome === 'success' ? resolve({ rows: [] }) : reject(new Error(outcome));
        });
      },
      async end() { ended++; },
    };
    const insertDraftTruth = async () => 'isolated-product';
    const connectTestClient = async name => name.endsWith('locker') ? countryLockerMock : countryWaiterMock;
    const setAuthenticatedActor = async () => {};
    const waitForDatabaseLock = async () => { observedLock = true; };
    const testClient = {};
    const staffId = 'isolated-staff';
  `;
  return spawnSync(process.execPath, ['--unhandled-rejections=strict', '--input-type=module', '-e', `${setup}\n${block}\nif (ended !== 2) throw new Error('Clients not closed');`], {
    encoding: 'utf8', timeout: 5000,
  });
}

test('country race safely awaits expected denial even before the COMMIT response arrives', () => {
  const result = runRace('COUNTRY_SCOPE_FORBIDDEN');
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
});

test('country race still fails if stale country access is authorized', () => {
  const result = runRace('success');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unexpectedly authorized stale Egypt scope/);
});

test('country race still fails on an unrelated database error', () => {
  const result = runRace('UNEXPECTED_DATABASE_ERROR');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /UNEXPECTED_DATABASE_ERROR/);
});


const partnerStart = replay.indexOf("  const partnerLocker = await connectTestClient('pr93_partner_locker');");
const partnerEnd = replay.indexOf("  await testClient.query(`UPDATE public.partners SET status='active' WHERE id=$1`, [partnerId]);", partnerStart);
assert.ok(partnerStart > 0 && partnerEnd > partnerStart, 'partner deactivation race block exists');
const partnerBlock = replay.slice(partnerStart, partnerEnd);

function runPartnerRace(outcome: string) {
  const setup = `
    const outcome = ${JSON.stringify(outcome)};
    let settleQuery;
    let observedLock = false;
    let ended = 0;
    let queryAttempts = 0;
    const partnerLockerMock = {
      async query(sql) {
        if (sql === 'COMMIT') {
          if (!observedLock) throw new Error('COMMIT preceded lock observation');
          settleQuery();
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        return { rows: [] };
      },
      async end() { ended++; },
    };
    const partnerWaiterMock = {
      query(sql) {
        if (sql === 'SET ROLE service_role') return Promise.resolve({ rows: [] });
        if (sql.includes('pg_backend_pid')) return Promise.resolve({ rows: [{ pid: 123 }] });
        if (!sql.includes('start_partner_marketplace_request_handoff')) throw new Error('Unexpected query');
        queryAttempts++;
        return new Promise((resolve, reject) => {
          settleQuery = () => outcome === 'success' ? resolve({ rows: [] }) : reject(new Error(outcome));
        });
      },
      async end() { ended++; },
    };
    const connectTestClient = async name => name.endsWith('locker') ? partnerLockerMock : partnerWaiterMock;
    const testClient = {};
    const partnerId = 'isolated-partner';
    const deactivationRequestId = 'isolated-request';
    const waitForDatabaseLock = async (observer, pid, label) => {
      if (observer !== testClient || pid !== 123 || label !== 'partner deactivation race') {
        throw new Error('Wrong lock observation');
      }
      observedLock = true;
    };
  `;
  const finish = `
    let caught;
    try { await (async () => { ${partnerBlock} })(); } catch (error) { caught = error; }
    console.log(JSON.stringify({ observedLock, ended, queryAttempts }));
    if (ended !== 2) throw new Error('Clients not closed');
    if (caught) throw caught;
  `;
  return spawnSync(process.execPath, ['--unhandled-rejections=strict', '--input-type=module', '-e', `${setup}\n${finish}`], {
    encoding: 'utf8', timeout: 5000,
  });
}

function assertPartnerRaceCleanup(result: ReturnType<typeof runPartnerRace>) {
  assert.equal(result.error, undefined);
  assert.deepEqual(JSON.parse(result.stdout), { observedLock: true, ended: 2, queryAttempts: 1 });
}

test('partner deactivation race safely awaits denial before the COMMIT response arrives', () => {
  const result = runPartnerRace('PARTNER_HANDOFF_ACTOR_DENIED');
  assert.equal(result.status, 0, result.stderr);
  assertPartnerRaceCleanup(result);
});

test('partner deactivation race still fails if the inactive partner is authorized', () => {
  const result = runPartnerRace('success');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Deactivated partner unexpectedly started a handoff/);
  assertPartnerRaceCleanup(result);
});

test('partner deactivation race still fails on an unrelated database error', () => {
  const result = runPartnerRace('UNEXPECTED_DATABASE_ERROR');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /UNEXPECTED_DATABASE_ERROR/);
  assertPartnerRaceCleanup(result);
});
