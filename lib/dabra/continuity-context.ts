import type {ContinuitySnapshot} from './continuity-service';
import type { SavedTrip } from './continuity-contract';
import { refinePlatformTrip } from './platform-assistant';
type Message={id:string;role:'user'|'assistant';text:string};
type Lease={ownerId:string;revision:number;generation:number;preferences:boolean;trip:boolean};

// Provenance is kept separately from user-entered content. Derived messages
// never enter the existing browser context cache, even before revocation.
export class ContinuityContext {
 lease:Lease|null=null;
 draft:string|null=null;
 trip:SavedTrip|null=null;
 private derivedIds=new Set<string>();
 private pendingIds=new Set<string>();
 capture(ownerId:string,state:ContinuitySnapshot,preferences:boolean,trip:boolean){
  this.lease={ownerId,revision:state.revision,generation:state.generation,preferences,trip};
  if(trip && !this.trip && state.trip)this.trip={...state.trip,families:[...state.trip.families]};
  if(!trip)this.trip=null;
 }
 isFresh(ownerId:string,state:ContinuitySnapshot|null,now=Date.now()){
  const lease=this.lease;
  if(!lease)return true;
  return Boolean(state&&state.consentEnabled&&lease.ownerId===ownerId&&lease.revision===state.revision&&lease.generation===state.generation
   &&(!lease.preferences||(state.preferences&&Date.parse(state.preferencesExpiresAt??'')>now))
   &&(!lease.trip||(state.trip&&Date.parse(state.tripExpiresAt??'')>now)));
 }
 tag(...ids:string[]){for(const id of ids)this.derivedIds.add(id);}
 independent<T extends Message>(messages:T[]){return messages.filter(message=>!this.derivedIds.has(message.id)&&!this.pendingIds.has(message.id));}
 beginAnswer(id:string){this.pendingIds.add(id);}
 finishAnswer(id:string){this.pendingIds.delete(id);}
 cachedMessages(messages:Message[]){return this.independent(messages).filter(m=>m.text.trim()).slice(-20).map(({id,role,text})=>({id,role,text}));}
 forget(){
  const derived=new Set(this.derivedIds);this.lease=null;this.draft=null;this.trip=null;this.derivedIds.clear();
  return <T extends Message>(messages:T[])=>messages.filter(message=>!derived.has(message.id));
 }
 clear<T extends Message>(messages:T[]){return this.forget()(messages);}
 refine(message:string){if(this.trip)this.trip=refinePlatformTrip(this.trip,message);return this.trip;}
}
