import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {BASELINE,PENDING} from './production-baseline-contract.mjs';
export const digest=x=>createHash('sha256').update(x).digest('hex');
const literal=x=>"'"+x.replaceAll("'","''")+"'";
const rowKeys=['created_by','idempotency_key','name','rollback','statements','version'];
const nullableText=value=>value===null||typeof value==='string';
const nullableTextArray=value=>value===null||(Array.isArray(value)&&value.every(nullableText));
// SQL generation only. No connection, remote target, CLI repair, or baseline DDL.
// Caller must freeze delivery, verify live schema independently and validate its
// durable full backup before using this contract. This PR executes it locally only.
export function adoptionContract(backup, expectedInventory, schemaFingerprint) {
  assert.match(schemaFingerprint,/^[a-f0-9]{64}$/);
  const rows=JSON.parse(backup);
  assert.equal(rows.length,47);assert.equal(new Set(rows.map(r=>r.version)).size,47);
  assert.deepEqual(rows.map(r=>r.version).sort(),expectedInventory.map(r=>r.version).sort());
  for(const row of rows) {
    assert.deepEqual(Object.keys(row).sort(),rowKeys,'Ledger must contain exactly the reviewed six columns');
    assert.equal(typeof row.version,'string');
    for(const key of ['name','created_by','idempotency_key'])assert.ok(nullableText(row[key]),`Invalid ledger ${key}`);
    for(const key of ['statements','rollback'])assert.ok(nullableTextArray(row[key]),`Invalid ledger ${key}`);
    const expected=expectedInventory.find(r=>r.version===row.version);
    assert.equal(row.name,expected.name,'Ledger name mismatch');
    assert.ok(Array.isArray(row.statements)||row.statements===null);
    const checksum=createHash('md5').update((row.statements||[]).filter(s=>s!==null).join('\n')).digest('hex');
    assert.equal(checksum,expected.statement_md5,'Ledger statement checksum mismatch');
  }
  assert.ok(!rows.some(r=>[BASELINE,...PENDING].includes(r.version)));
  const receipt=`BASELINE_ADOPTION_ONLY backup_sha256=${digest(backup)} schema_sha256=${schemaFingerprint}`;
  // Production metadata columns are nullable with no defaults/generated values.
  // Keep their explicit nulls: missing JSON keys are NOT equal to SQL row nulls.
  // Historical metadata remains in the full backup and is restored verbatim.
  const marker=[{version:BASELINE,name:'production_schema_baseline',statements:[receipt],created_by:null,idempotency_key:null,rollback:null}];
  const old=literal(JSON.stringify(rows));const next=literal(JSON.stringify(marker));
  const actual="(SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY version),'[]'::jsonb) FROM supabase_migrations.schema_migrations m)";
  const check=(expected,message)=>`IF ${actual} <> ${expected}::jsonb THEN RAISE EXCEPTION '${message}'; END IF;`;
  const shape=JSON.stringify(rowKeys.map(name=>({name,type:['rollback','statements'].includes(name)?'_text':'text',nullable:name!=='version'})));
  const schemaCheck=`IF (SELECT jsonb_agg(jsonb_build_object('name',column_name,'type',udt_name,'nullable',is_nullable='YES') ORDER BY column_name)
FROM information_schema.columns WHERE table_schema='supabase_migrations' AND table_name='schema_migrations') IS DISTINCT FROM ${literal(shape)}::jsonb
OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='supabase_migrations' AND table_name='schema_migrations' AND (column_default IS NOT NULL OR is_identity <> 'NO' OR is_generated <> 'NEVER'))
THEN RAISE EXCEPTION 'BASELINE_LEDGER_SCHEMA_MISMATCH'; END IF;`;
  return {
    receipt,
    // Fault injection belongs exclusively to the isolated test caller.
    adopt:(fault='')=>`BEGIN; LOCK TABLE supabase_migrations.schema_migrations IN ACCESS EXCLUSIVE MODE;
DO $adopt$ BEGIN
${schemaCheck}
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
${schemaCheck}
${check(next,'BASELINE_RECOVERY_NOT_SAFE')}
DELETE FROM supabase_migrations.schema_migrations;
INSERT INTO supabase_migrations.schema_migrations SELECT * FROM jsonb_populate_recordset(NULL::supabase_migrations.schema_migrations,${old}::jsonb);
${check(old,'BASELINE_RECOVERY_INCOMPLETE')}
END $recover$; COMMIT;`,
    marker,
  };
}
