import next from 'next';
import {createServer} from 'node:http';
import {TASK187_APP_ORIGIN} from './sandbox/task187-browser-network.mjs';
const origin=process.env.TASK187_APP_ORIGIN, backend=process.env.TASK187_BACKEND_ORIGIN;
if(origin!==TASK187_APP_ORIGIN||backend!=='http://127.0.0.1:19030')throw Error('TASK187_LOCAL_ORIGIN_REQUIRED');
const realFetch=globalThis.fetch;let externalDenied=0,chatRequests=0,chatCompleted=0;
globalThis.fetch=async(input,init)=>{const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
 if(![origin,backend].includes(url.origin)){externalDenied++;throw Error('TASK187_EXTERNAL_FETCH_DENIED');}
 return realFetch(input,init);
};
const app=next({dev:true,webpack:true,dir:process.cwd(),hostname:'127.0.0.1',port:19040});
await app.prepare();const handle=app.getRequestHandler();
const sockets=new Set();
const server=createServer(async(req,res)=>{
 if(req.url==='/__task187_metrics'){res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({chatRequests,chatCompleted,externalDenied}));return;}
 if(req.url?.startsWith('/api/ai2/chat')){chatRequests++;res.once('finish',()=>chatCompleted++);}
 if(/^\/(auth|rest)\/v1(?:\/|$)/.test(req.url??'')){
  try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const headers={...req.headers};delete headers.host;delete headers.connection;delete headers['content-length'];
   const upstream=await realFetch(backend+req.url,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks),redirect:'manual',signal:AbortSignal.timeout(10000)});
   upstream.headers.forEach((v,k)=>{if(!['content-encoding','content-length','transfer-encoding','connection'].includes(k))res.setHeader(k,v);});res.statusCode=upstream.status;res.end(Buffer.from(await upstream.arrayBuffer()));
  }catch{res.statusCode=503;res.end('LOCAL_AUTH_UNAVAILABLE');}return;
 }
 handle(req,res);
});
server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
await new Promise(resolve=>server.listen(19040,'127.0.0.1',resolve));process.send?.({ready:true});
let stopping=false;
async function stop(){if(stopping)return;stopping=true;server.close();for(const s of sockets)s.destroy();await app.close();process.exit(0);}
process.on('message',m=>{if(m==='STOP')void stop();});process.on('SIGTERM',()=>void stop());
