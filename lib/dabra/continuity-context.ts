import type {ContinuitySnapshot} from './continuity-service';
type Message={id:string;role:'user'|'assistant';text:string};
type Lease={ownerId:string;revision:number;generation:number;preferences:boolean;trip:boolean};

// Provenance is kept separately from user-entered content. Derived messages
// never enter the existing browser context cache, even before revocation.
export class ContinuityContext {
 lease:Lease|null=null;
 draft:string|null=null;
 private derivedIds=new Set<string>();
 capture(ownerId:string,state:ContinuitySnapshot,preferences:boolean,trip:boolean){
  this.lease={ownerId,revision:state.revision,generation:state.generation,preferences,trip};
 }
 isFresh(ownerId:string,state:ContinuitySnapshot|null,now=Date.now()){
  const lease=this.lease;
  if(!lease)return true;
  return Boolean(state&&state.consentEnabled&&lease.ownerId===ownerId&&lease.revision===state.revision&&lease.generation===state.generation
   &&(!lease.preferences||(state.preferences&&Date.parse(state.preferencesExpiresAt??'')>now))
   &&(!lease.trip||(state.trip&&Date.parse(state.tripExpiresAt??'')>now)));
 }
 tag(...ids:string[]){for(const id of ids)this.derivedIds.add(id);}
 independent<T extends Message>(messages:T[]){return messages.filter(message=>!this.derivedIds.has(message.id));}
 forget(){
  const derived=new Set(this.derivedIds);this.lease=null;this.draft=null;this.derivedIds.clear();
  return <T extends Message>(messages:T[])=>messages.filter(message=>!derived.has(message.id));
 }
 clear<T extends Message>(messages:T[]){return this.forget()(messages);}
}
