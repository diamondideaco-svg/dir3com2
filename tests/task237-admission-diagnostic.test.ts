import test from 'node:test';
import assert from 'node:assert/strict';
import {task237AdmissionDiagnostic,type Task237AdmissionDiagnostic} from './fixtures/task237-admission-diagnostic';
const secret='SYNTHETIC_DO_NOT_EMIT';
function fixture(flags:unknown,options:{synthetic?:boolean;error?:unknown}={}) {
 const statements:string[]=[];
 return {statements,client:{async query(text:string){
  statements.push(text);
  if(text.includes('current_database() ~'))return {rows:[{synthetic:options.synthetic??true}]};
  if(text.startsWith('SELECT\n')){if(options.error)throw options.error;return {rows:[flags]};}
  return {rows:[]};
 }}};
}
for(const [name,flags,expected] of [
 ['eligible false',{eligible:false,expired:false,locked:false},'eligibility-observed-false'],
 ['expired',{eligible:true,expired:true,locked:false},'validity-observed-expired'],
 ['held lock',{eligible:true,expired:false,locked:true},'lock-observed-after-denial'],
 ['no retained witness',{eligible:true,expired:false,locked:false},'unclassified-denial'],
 ['unexpected private result',{eligible:secret,expired:false,locked:true,proof:secret},'diagnostic-unavailable'],
] satisfies [string,unknown,Task237AdmissionDiagnostic][])test('Task237 failure diagnostic: '+name,async()=>{
 const f=fixture(flags);const category=await task237AdmissionDiagnostic(f.client,secret,secret,1);
 assert.equal(category,expected);assert.equal(category.includes(secret),false);assert.equal(f.statements.at(-1),'ROLLBACK');
 assert.ok(f.statements.includes("SET LOCAL statement_timeout='750ms'"));
});
test('Task237 diagnostic refuses another database before observing private relations',async()=>{
 const f=fixture({}, {synthetic:false});assert.equal(await task237AdmissionDiagnostic(f.client,secret,secret,1),'diagnostic-unavailable');
 assert.equal(f.statements.some(s=>s.startsWith('SELECT\n')),false);assert.equal(f.statements.at(-1),'ROLLBACK');
});
for(const [code,expected]of[['57014','diagnostic-timeout'],['XX000','diagnostic-unavailable']] as const)test('Task237 diagnostic sanitizes SQL failure '+code,async()=>{
 const f=fixture({}, {error:{code,message:secret,detail:secret,query:secret}});
 assert.equal(await task237AdmissionDiagnostic(f.client,secret,secret,1),expected);assert.equal(f.statements.at(-1),'ROLLBACK');
});
