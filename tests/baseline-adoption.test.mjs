import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {adoptionContract,digest} from '../scripts/baseline-adoption-contract.mjs';
const rows=Array.from({length:47},(_,i)=>({version:String(20260101000000+i),name:'fixture_'+i,statements:['-- inert fixture '+i]}));
const inventory=rows.map(r=>({version:r.version,name:r.name,statement_md5:createHash('md5').update(r.statements.join('\n')).digest('hex')}));
const backup=JSON.stringify(rows),fingerprint=digest('reviewed fixture schema');
test('adoption checks full inventory, names and statement hashes before generating SQL',()=>{
 assert.ok(adoptionContract(backup,inventory,fingerprint));
 for(const key of ['version','name','statements']){const changed=structuredClone(rows);changed[0][key]=key==='statements'?['changed']:'changed';assert.throws(()=>adoptionContract(JSON.stringify(changed),inventory,fingerprint));}
 assert.throws(()=>adoptionContract(JSON.stringify(rows.slice(1)),inventory,fingerprint));
});
test('metadata transition is one locked transaction without executing baseline or history SQL',()=>{
 const c=adoptionContract(backup,inventory,fingerprint),sql=c.adopt();
 assert.match(sql,/^BEGIN;/);assert.match(sql,/ACCESS EXCLUSIVE/);assert.match(sql,/COMMIT;$/);
 assert.match(sql,/BASELINE_LEDGER_MISMATCH/);assert.match(sql,/BASELINE_ADOPTION_INCOMPLETE/);
 assert.doesNotMatch(sql,/CREATE TABLE|ALTER TABLE|EXECUTE|db push/);
 assert.match(c.receipt,new RegExp(digest(backup)));assert.match(c.receipt,new RegExp(fingerprint));
 assert.match(c.recover,/BASELINE_RECOVERY_NOT_SAFE/);
});
