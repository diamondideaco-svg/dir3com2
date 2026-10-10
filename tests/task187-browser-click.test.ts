import test from 'node:test';
import assert from 'node:assert/strict';
import {clickTask187Element,Task187ClickError,Task187CommandError,SCROLL_TARGET,READ_CLICK_GEOMETRY,type ClickGeometry} from '../scripts/sandbox/task187-browser-click';
const good:ClickGeometry={x:10,y:10,width:80,height:40,viewportWidth:390,viewportHeight:844,unobscured:true,enabled:true};
async function run(samples:ClickGeometry[],error?:Error){
 const calls:Array<{path:string;body?:unknown}>=[];let sample=0;
 const command=async(path:string,body?:unknown)=>{calls.push({path,body});if(path.endsWith('/click')){if(error)throw error;return null;}if((body as {script:string}).script===READ_CLICK_GEOMETRY)return samples[Math.min(sample++,samples.length-1)];return null;};
 const promise=clickTask187Element(command,'OWNED','ELEMENT','ar-390-reset',{attempts:5,pause:async()=>{}});
 return {calls,promise};
}
test('scrolls then requires three stable unobscured samples before native click',async()=>{
 const {calls,promise}=await run([good,good,good]);await promise;
 assert.equal((calls[0].body as {script:string}).script,SCROLL_TARGET);
 assert.equal(calls.filter(c=>c.path.endsWith('/click')).length,1);
 assert.equal(calls.length,5);
 assert.equal(calls.at(-1)?.path,'/session/OWNED/element/ELEMENT/click');
 assert.equal(SCROLL_TARGET.includes('.click('),false);
});
for(const [name,change] of Object.entries({offscreen:{y:1383.8},covered:{unobscured:false},disabled:{enabled:false},hidden:{height:0},invalid:{x:NaN},horizontal:{x:380}}))test(`fails bounded and never clicks ${name}`,async()=>{
 const {calls,promise}=await run([{...good,...change}]);await assert.rejects(promise,Task187ClickError);
 assert.equal(calls.some(c=>c.path.endsWith('/click')),false);assert.equal(calls.length,6);
});
test('geometry movement resets stability until three equal samples',async()=>{
 const {calls,promise}=await run([good,{...good,y:30},good,good,good]);await promise;assert.equal(calls.length,7);
});
test('continuously moving target never receives a native click',async()=>{
 const {calls,promise}=await run([good,{...good,y:30},good,{...good,y:30},good]);await assert.rejects(promise,Task187ClickError);assert.equal(calls.some(c=>c.path.endsWith('/click')),false);
});
test('native click failure preserves only sanitized operation geometry and HTTP error',async()=>{
 const {promise}=await run([good],new Task187CommandError(400,'element click intercepted','/session/private-id/element/private-element/click'));
 await assert.rejects(promise,(e:unknown)=>{assert.ok(e instanceof Task187ClickError);const data=JSON.parse(e.message);assert.equal(data.webdriver.status,400);assert.equal(data.webdriver.code,'element click intercepted');assert.equal(data.operation,'ar-390-reset');assert.equal(e.message.includes('private-id'),false);return true;});
});
