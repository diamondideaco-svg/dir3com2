import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {BASELINE,PENDING} from './production-baseline-contract.mjs';
export const digest=x=>createHash('sha256').update(x).digest('hex');
const literal=x=>"'"+x.replaceAll("'","''")+"'";
// SQL generation only. No connection, remote target, CLI repair, or baseline DDL.
// Caller must freeze delivery, verify live schema independently and validate its
// durable full backup before using this contract. This PR executes it locally only.
export function adoptionContract(backup, expectedInventory, schemaFingerprint) {
  assert.match(schemaFingerprint,/^[a-f0-9]{64}$/);
  const rows=JSON.parse(backup);
  assert.equal(rows.length,47);assert.equal(new Set(rows.map(r=>r.version)).size,47);
  assert.deepEqual(rows.map(r=>r.version).sort(),expectedInventory.map(r=>r.version).sort());
  for(const row of rows) {
    const expected=expectedInventory.find(r=>r.version===row.version);
    assert.equal(row.name,expected.name,'Ledger name mismatch');
    assert.ok(Array.isArray(row.statements)||row.statements===null);
    const checksum=createHash('md5').update((row.statements||[]).filter(s=>s!==null).join('\n')).digest('hex');
    assert.equal(checksum,expected.statement_md5,'Ledger statement checksum mismatch');
  }
  assert.ok(!rows.some(r=>[BASELINE,...PENDING].includes(r.version)));
  const receipt=`BASELINE_ADOPTION_ONLY backup_sha256=${digest(backup)} schema_sha256=${schemaFingerprint}`;
  const marker=[{version:BASELINE,name:'production_schema_baseline',statements:[receipt]}];
  const old=literal(JSON.stringify(rows));const next=literal(JSON.stringify(marker));
  const actual="(SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY version),'[]'::jsonb) FROM supabase_migrations.schema_migrations m)";
  const check=(expected,message)=>`IF ${actual} <> ${expected}::jsonb THEN RAISE EXCEPTION '${message}'; END IF;`;
  return {
    receipt,
    // Fault injection belongs exclusively to the isolated test caller.
    adopt:(fault='')=>`BEGIN; LOCK TABLE supabase_migrations.schema_migrations IN ACCESS EXCLUSIVE MODE;
DO $adopt$ BEGIN
IF ${actual} = ${next}::jsonb THEN RETURN; END IF;
${check(old,'BASELINE_LEDGER_MISMATCH')}
DELETE FROM supabase_migrations.schema_migrations;
${fault==='after-delete'?'PERFORM pg_terminate_backend(pg_backend_pid());':''}
INSERT INTO supabase_migrations.schema_migrations SELECT * FROM jsonb_populate_recordset(NULL::supabase_migrations.schema_migrations,${next}::jsonb);
${check(next,'BASELINE_ADOPTION_INCOMPLETE')}
END $adopt$;
${fault==='before-commit'?'SELECT pg_terminate_backend(pg_backend_pid());':''}
COMMIT;`,
    recover:`BEGIN; LOCK TABLE supabase_migrations.schema_migrations IN ACCESS EXCLUSIVE MODE;
DO $recover$ BEGIN
${check(next,'BASELINE_RECOVERY_NOT_SAFE')}
DELETE FROM supabase_migrations.schema_migrations;
INSERT INTO supabase_migrations.schema_migrations SELECT * FROM jsonb_populate_recordset(NULL::supabase_migrations.schema_migrations,${old}::jsonb);
${check(old,'BASELINE_RECOVERY_INCOMPLETE')}
END $recover$; COMMIT;`,
    marker,
  };
}
