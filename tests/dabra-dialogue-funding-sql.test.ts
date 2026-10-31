import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Source-only regressions. No SQL engine/database/migration is executed by these checks.
const file='supabase/migrations/20261028174710_task217_dialogue_funding_admission.sql';
test('Task217 SQL P2: both allowlist gates deny false AND UNKNOWN membership',()=>{
 const sql=readFileSync(file,'utf8');
 assert.equal((sql.match(/\(p_subject_hash=ANY\(c.subject_hashes\)\) IS NOT TRUE/g)??[]).length,2);
 assert.doesNotMatch(sql,/NOT\(p_subject_hash=ANY\(c.subject_hashes\)\)/);
});
test('Task217 SQL P2: control array accepts only canonical one-dimensional non-null SHA256 entries',()=>{
 const sql=readFileSync(file,'utf8');
 const line=sql.split('\n').find(l=>l.includes('subject_hashes text[]'));assert.ok(line);
 assert.ok(line.includes("subject_hashes::text ~ '^[{]([a-f0-9]{64}(,[a-f0-9]{64})*)?[}]$'"));
 // PostgreSQL canonical array spelling is tested against the exact declared regex, not a DB execution.
 const pattern=/^[{]([a-f0-9]{64}(,[a-f0-9]{64})*)?[}]$/;
 for(const text of ['{}','{'+ 'a'.repeat(64)+'}','{'+ 'a'.repeat(64)+','+'b'.repeat(64)+'}'])assert.match(text,pattern);
 for(const text of ['{'+ 'a'.repeat(64)+',NULL}','{NULL}','{{'+ 'a'.repeat(64)+'}}','{short}','{'+ 'a'.repeat(63)+'}','{'+ 'a'.repeat(65)+'}','{"'+ 'a'.repeat(64)+','+'b'.repeat(64)+'"}','[0:0]={'+ 'a'.repeat(64)+'}'])assert.doesNotMatch(text,pattern);
});

test('Task217 quota config: policy RPC returns stored daily limits using the loader key',()=>{
 const sql=readFileSync(file,'utf8');
 assert.match(sql,/'dailyLimits',c.daily_limits/);
 assert.match(sql,/p_limits IS DISTINCT FROM c.daily_limits/);
});
