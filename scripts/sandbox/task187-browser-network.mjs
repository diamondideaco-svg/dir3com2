import {connect} from 'node:net';
import {errorMonitor} from 'node:events';

// NextURL canonicalizes loopback IPs to localhost; preserve strict same-origin writes.
export const TASK187_APP_ORIGIN='http://localhost:19040';
export const TASK187_PROXY_RESET_PREFIX='TASK187_BROWSER_UNHANDLED_PROXY_RESET=';
export const TASK187_PROXY_RESET_SOURCES=Object.freeze(['client-socket','client-request','server-response','upstream-request','upstream-response']);
const proxyResetSources=new Set(TASK187_PROXY_RESET_SOURCES);

/** Observe only an unhandled reset on an owned proxy stream. This does not handle
 * the error or change whether the process fails; it emits no error text or data.
 * @param {import('node:events').EventEmitter} emitter
 * @param {string} source
 * @param {(marker:string)=>void} report
 */
export function observeUnhandledTask187ProxyReset(emitter,source,report){
 if(!proxyResetSources.has(source)||typeof report!=='function')throw Error('TASK187_PROXY_OBSERVER_INVALID');
 emitter.on(errorMonitor,error=>{
  try{if(error?.code==='ECONNRESET'&&emitter.listenerCount('error')===0)report(TASK187_PROXY_RESET_PREFIX+source);}catch{ /* Observations never change failure behavior. */ }
 });
}

/**
 * @param {import('node:http').Server} proxy
 * @param {() => void} onAllowed
 * @param {() => void} onDenied
 */
export function attachTask187ConnectProxy(proxy,onAllowed,onDenied) {
 /** @type {Set<import('node:stream').Duplex>} */
 const tunnels=new Set();
 proxy.on('connect',(request,socket,head)=>{
  if(request.url!=='localhost:19040'){
   // A rejected peer may reset before the 403 is flushed. Keep it denied and
   // dispose only its socket; the required browser assertions still fail closed.
   socket.on('error',error=>{socket.destroy();if(error?.code!=='ECONNRESET')throw error;});
   onDenied();socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;
  }
  onAllowed();
  // Never resolve a request-supplied hostname or connect to another local service.
  const upstream=connect({host:'127.0.0.1',port:19040});
  tunnels.add(socket);tunnels.add(upstream);
  const close=()=>{socket.destroy();upstream.destroy();tunnels.delete(socket);tunnels.delete(upstream);};
  socket.once('error',close);upstream.once('error',close);
  socket.once('close',close);upstream.once('close',close);
  upstream.once('connect',()=>{
   socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
   if(head.length)upstream.write(head);
   socket.pipe(upstream);upstream.pipe(socket);
  });
 });
 return ()=>{for(const socket of tunnels)socket.destroy();tunnels.clear();};
}
