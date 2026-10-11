import {connect} from 'node:net';

// NextURL canonicalizes loopback IPs to localhost; preserve strict same-origin writes.
export const TASK187_APP_ORIGIN='http://localhost:19040';

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
