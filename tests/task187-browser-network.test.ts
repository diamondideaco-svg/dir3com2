import assert from 'node:assert/strict';
import {once} from 'node:events';
import {spawnSync} from 'node:child_process';
import {createServer as httpServer} from 'node:http';
import {connect,createServer as tcpServer,type Socket} from 'node:net';
import test from 'node:test';
import {NextRequest} from 'next/server';
import {TASK187_APP_ORIGIN,attachTask187ConnectProxy} from '../scripts/sandbox/task187-browser-network.mjs';

const deadline=()=>AbortSignal.timeout(5000);
test('canonical browser origin satisfies unchanged NextRequest same-origin contract',()=>{
 const request=new NextRequest(TASK187_APP_ORIGIN+'/api/dabra/continuity',{method:'POST',headers:{origin:TASK187_APP_ORIGIN,'content-type':'application/json'}});
 assert.equal(request.headers.get('origin'),request.nextUrl.origin);
 const old=new NextRequest('http://127.0.0.1:19040/api/dabra/continuity',{method:'POST',headers:{origin:'http://127.0.0.1:19040'}});
 assert.notEqual(old.headers.get('origin'),old.nextUrl.origin);
 for(const origin of ['https://example.invalid','http://localhost:19030','http://localhost:19041'])assert.notEqual(origin,request.nextUrl.origin);
});

test('CONNECT forwards only the owned application and cleans live tunnels',{timeout:20000},async t=>{
 const targetSockets=new Set<Socket>();let targetConnections=0,allowed=0,denied=0;
 const target=tcpServer(socket=>{targetConnections++;targetSockets.add(socket);socket.on('data',data=>socket.write('echo:'+data.toString()));socket.on('close',()=>targetSockets.delete(socket));});
 const proxy=httpServer();const closeTunnels=attachTask187ConnectProxy(proxy,()=>allowed++,()=>denied++);
 t.after(async()=>{closeTunnels();for(const socket of targetSockets)socket.destroy();proxy.closeAllConnections();await Promise.all([new Promise<void>(resolve=>proxy.close(()=>resolve())),new Promise<void>(resolve=>target.close(()=>resolve()))]);});
 await new Promise<void>((resolve,reject)=>{target.once('error',reject);target.listen(19040,'127.0.0.1',resolve);});
 await new Promise<void>((resolve,reject)=>{proxy.once('error',reject);proxy.listen(0,'127.0.0.1',resolve);});
 const address=proxy.address();assert.ok(address&&typeof address!=='string');
 const open=async(authority:string,head='')=>{
  const socket=connect({host:'127.0.0.1',port:address.port});socket.setEncoding('utf8');await once(socket,'connect',{signal:deadline()});
  socket.write('CONNECT '+authority+' HTTP/1.1\r\nHost: '+authority+'\r\n\r\n'+head);return socket;
 };
 const readUntil=(socket:Socket,needle:string)=>new Promise<string>((resolve,reject)=>{
  let data='';const timer=setTimeout(()=>{cleanup();socket.destroy();reject(Error('CONNECT_RESPONSE_TIMEOUT'));},5000);
  const receive=(chunk:string)=>{data+=chunk;if(data.includes(needle)){cleanup();resolve(data);}};
  const error=(reason:Error)=>{cleanup();reject(reason);};
  const cleanup=()=>{clearTimeout(timer);socket.off('data',receive);socket.off('error',error);};
  socket.on('data',receive);socket.once('error',error);
 });
 for(const authority of ['example.invalid:443','127.0.0.1:19040','localhost:19041','localhost:19030','localhost:443','[::1]:19040','LOCALHOST:19040','localhost:19040@evil.invalid:443','localhost:19040.evil.invalid:443']){
  await t.test('denies '+authority,async()=>{const socket=await open(authority);try{assert.match(await readUntil(socket,'\r\n\r\n'),/^HTTP\/1\.1 403 Forbidden/);assert.equal(targetConnections,0);}finally{socket.destroy();}});
 }
 assert.equal(denied,9);assert.equal(allowed,0);
 await t.test('forwards exact authority and bytes already following CONNECT headers',async()=>{
  const socket=await open('localhost:19040','bootstrap-head');try{const response=await readUntil(socket,'echo:bootstrap-head');assert.match(response,/^HTTP\/1\.1 200 Connection Established/);socket.write('follow-up');assert.match(await readUntil(socket,'echo:follow-up'),/echo:follow-up/);assert.equal(targetConnections,1);}finally{socket.destroy();}
 });
 await t.test('cleanup closes a still-live owned tunnel',async()=>{
  const socket=await open('localhost:19040');await readUntil(socket,'\r\n\r\n');const closed=once(socket,'close',{signal:deadline()});closeTunnels();await closed;assert.equal(socket.destroyed,true);
 });
 assert.equal(allowed,2);assert.equal(denied,9);
});

// An untrusted peer resets a denied CONNECT after its headers are received.
// The child isolates an unhandled-event regression without weakening the proxy.
test('denied CONNECT peer reset is contained without permitting an external connection',{timeout:10000},()=>{
 const moduleUrl=new URL('../scripts/sandbox/task187-browser-network.mjs',import.meta.url).href;
 const source=`import assert from 'node:assert/strict';import {createServer} from 'node:http';import {connect} from 'node:net';import {errorMonitor} from 'node:events';import {attachTask187ConnectProxy} from ${JSON.stringify(moduleUrl)};let client,denied=0,allowed=0,observed=false;const proxy=createServer();const deadline=setTimeout(()=>{throw Error('SYNTHETIC_RESET_TIMEOUT');},4000);proxy.on('connection',socket=>socket.on(errorMonitor,error=>{if(error?.code==='ECONNRESET'){observed=true;setImmediate(()=>{assert.equal(denied,1);assert.equal(allowed,0);proxy.close(()=>{clearTimeout(deadline);console.log(JSON.stringify({denied,allowed,observed}));});});}}));attachTask187ConnectProxy(proxy,()=>allowed++,()=>{denied++;client.resetAndDestroy();});proxy.listen(0,'127.0.0.1',()=>{client=connect(proxy.address().port,'127.0.0.1',()=>client.write('CONNECT example.invalid:443 HTTP/1.1\\r\\nHost: example.invalid:443\\r\\n\\r\\n'));client.on('error',()=>{});});`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',source],{encoding:'utf8',timeout:5000,env:{PATH:process.env.PATH??'',NODE_ENV:'test'}});
 assert.equal(result.status,0,'the isolated denied-socket reset must not crash the proxy');
 assert.deepEqual(JSON.parse(result.stdout.trim()),{denied:1,allowed:0,observed:true});
});


test('unexpected denied CONNECT socket errors still fail closed',{timeout:10000},()=>{
 const moduleUrl=new URL('../scripts/sandbox/task187-browser-network.mjs',import.meta.url).href;
 const source=`import {createServer} from 'node:http';import {connect} from 'node:net';import {attachTask187ConnectProxy} from ${JSON.stringify(moduleUrl)};let serverSocket;const proxy=createServer();proxy.on('connection',socket=>{serverSocket=socket;});attachTask187ConnectProxy(proxy,()=>{},()=>{serverSocket.emit('error',Object.assign(Error('SYNTHETIC_UNEXPECTED_SOCKET_ERROR'),{code:'EACCES'}));});proxy.listen(0,'127.0.0.1',()=>{const client=connect(proxy.address().port,'127.0.0.1',()=>client.write('CONNECT example.invalid:443 HTTP/1.1\\r\\nHost: example.invalid:443\\r\\n\\r\\n'));client.on('error',()=>{});});setTimeout(()=>process.exit(0),4000);`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',source],{encoding:'utf8',timeout:5000,env:{PATH:process.env.PATH??'',NODE_ENV:'test'}});
 assert.equal(result.status,1,'an unexpected error must remain a failure');
 assert.match(result.stderr,/SYNTHETIC_UNEXPECTED_SOCKET_ERROR/);
});
