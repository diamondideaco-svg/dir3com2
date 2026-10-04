// Per mounted account. Invalidating also rejects a response whose transport
// ignores AbortSignal, including a late JSON decode after an account switch.
export class ContinuityRequests {
 private generation=0;
 private controller:AbortController|null=null;
 invalidate(){this.generation++;this.controller?.abort();this.controller=null;}
 begin(){
  this.invalidate();const generation=this.generation;const controller=new AbortController();this.controller=controller;
  return {signal:controller.signal,isCurrent:()=>generation===this.generation&&!controller.signal.aborted};
 }
}
