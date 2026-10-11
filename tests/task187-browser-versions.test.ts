import test from 'node:test';
import assert from 'node:assert/strict';
import {assertTask187BrowserVersions} from '../scripts/sandbox/task187-browser-versions.mjs';
test('installed non-CfT browser accepts official same-build driver patch',()=>{
 assert.doesNotThrow(()=>assertTask187BrowserVersions('154.0.8037.95','154.0.8037.92'));
});
for(const value of [undefined,null,'','154.0.8037','154.0.8037.92.extra','x154.0.8037.92','154.0.8037.92\n','154.00.8037.92']){
 for(const side of ['chrome','driver'])test(`reject ${side} malformed ${JSON.stringify(value)}`,()=>{
  assert.throws(()=>assertTask187BrowserVersions(side==='chrome'?value:'154.0.8037.95',side==='driver'?value:'154.0.8037.92'));
 });
}
for(const driver of ['153.0.8037.92','154.1.8037.92','154.0.8038.92'])test(`reject incompatible build ${driver}`,()=>{
 assert.throws(()=>assertTask187BrowserVersions('154.0.8037.95',driver));
});