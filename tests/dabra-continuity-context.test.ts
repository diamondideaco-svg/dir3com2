import assert from 'node:assert/strict';
import test from 'node:test';
import {ContinuityContext} from '../lib/dabra/continuity-context';
import type {ContinuitySnapshot} from '../lib/dabra/continuity-service';
const prefs={replyLanguage:'en',displayCurrency:'USD',travelClass:'business',lodgingStyle:'hotel',itineraryPace:'relaxed'} as const;
const trip={id:'11111111-1111-4111-8111-111111111111',origin:'Cairo',destination:'Riyadh',startDate:null,endDate:null,adults:1,children:0,rooms:1,budget:5000,currency:'USD',families:['stay']} as const;
const state:ContinuitySnapshot={revision:1,generation:0,consentEnabled:true,consentVersion:'task187-v1',preferences:prefs,preferencesExpiresAt:'2027-01-01T00:00:00Z',trip:{...trip,families:['stay']},tripExpiresAt:'2027-01-01T00:00:00Z',updatedAt:null};
const now=Date.parse('2026-10-04T00:00:00Z');
test('resume-derived seed and answers never persist; forgetting preserves independently entered messages',()=>{
 const context=new ContinuityContext();context.capture('user:A',state,true,true);context.draft='business hotel relaxed';context.tag('seed','answer');
 const messages=[{id:'prior',role:'user' as const,text:'Independent prior request'},{id:'seed',role:'user' as const,text:context.draft},{id:'typed',role:'user' as const,text:'Independent new request'},{id:'answer',role:'assistant' as const,text:'Derived business hotel'}];
 assert.deepEqual(context.independent(messages).map(m=>m.id),['prior','typed']);
 const remove=context.forget();assert.equal(context.draft,null);assert.equal(context.lease,null);
 // A deferred React updater must not clear a subsequently captured new lease.
 context.capture('user:A',{...state,revision:2},true,true);assert.deepEqual(remove(messages).map(m=>m.id),['prior','typed']);assert.equal((context.lease as {revision:number}|null)?.revision,2);
});
test('reload, other-session revoke, deletion, expiry and account switch invalidate the applied lease before send',()=>{
 const context=new ContinuityContext();context.capture('user:A',state,true,true);assert.equal(context.isFresh('user:A',state,now),true);
 for(const changed of [null,{...state,revision:2},{...state,generation:1,consentEnabled:false,preferences:null,preferencesExpiresAt:null,trip:null,tripExpiresAt:null},{...state,preferences:null,preferencesExpiresAt:null},{...state,trip:null,tripExpiresAt:null},{...state,preferencesExpiresAt:new Date(now).toISOString()}])assert.equal(context.isFresh('user:A',changed,now),false);
 assert.equal(context.isFresh('user:B',state,now),false);context.clear([]);assert.equal(context.isFresh('user:A',null,now),true);
});
test('detached trip and preferences retain the exact source proof for old derived text',()=>{
 const context=new ContinuityContext();context.capture('user:A',state,true,true);context.tag('derived');
 context.scope('I need a car in Cairo',[]);
 assert.equal(context.trip,null);assert.equal(context.lease?.trip,false);assert.equal(context.lease?.tripSource,true);
 context.capture('user:A',state,false,false);
 assert.equal(context.isFresh('user:A',state,now),true);
 assert.equal(context.isFresh('user:A',{...state,tripExpiresAt:new Date(now).toISOString()},now),false);
 assert.equal(context.isFresh('user:A',{...state,preferencesExpiresAt:new Date(now).toISOString()},now),false);
 assert.equal(context.isFresh('user:A',{...state,trip:{...state.trip!,id:'22222222-2222-4222-8222-222222222222'}},now),false);
});

test('scoped history limits transport to the last 64 independent turns',()=>{
 const context=new ContinuityContext();
 const messages=Array.from({length:70},(_,index)=>({id:String(index),role:'user' as const,text:`turn-${index}`}));
 const scoped=context.scoped(messages);assert.equal(scoped.length,64);assert.equal(scoped[0].id,'6');assert.equal(scoped.at(-1)?.id,'69');
});
