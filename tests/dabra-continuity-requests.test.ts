import assert from 'node:assert/strict';
import test from 'node:test';
import {ContinuityRequests} from '../lib/dabra/continuity-requests';
test('account transition rejects delayed transport and delayed JSON even if abort is ignored',async()=>{
 const requests=new ContinuityRequests();const old=requests.begin();let resolve!:(value:string)=>void;
 const delayed=new Promise<string>(r=>{resolve=r;});let state='empty';
 const consuming=delayed.then(value=>{if(old.isCurrent())state=value;});
 requests.invalidate();resolve('private-account-A');await consuming;assert.equal(state,'empty');assert.equal(old.signal.aborted,true);
});
test('newer reload wins and unmount invalidates every pending response',()=>{
 const requests=new ContinuityRequests();const first=requests.begin();const second=requests.begin();assert.equal(first.isCurrent(),false);assert.equal(second.isCurrent(),true);
 requests.invalidate();assert.equal(second.isCurrent(),false);
 const otherAccount=new ContinuityRequests();assert.equal(otherAccount.begin().isCurrent(),true);assert.equal(first.isCurrent(),false);
});
