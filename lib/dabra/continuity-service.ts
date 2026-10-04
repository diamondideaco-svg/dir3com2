import { CONTINUITY_UUID, parseContinuityPreferences, parseSavedTrip } from './continuity-contract';
export type ContinuityAction = 'save' | 'clear_preferences' | 'delete_trip' | 'revoke';
export type ContinuityMutation = { action: ContinuityAction; revision: number; generation: number; mutationId: string; payload: Record<string, unknown> };
export function parseContinuityMutation(value: unknown): ContinuityMutation | null {
 if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
 const v = value as Record<string, unknown>;
 if (Object.keys(v).length !== 5 || !['action','revision','generation','mutationId','payload'].every(k => Object.hasOwn(v,k))
  || !['save','clear_preferences','delete_trip','revoke'].includes(String(v.action))
  || typeof v.revision !== 'number' || !Number.isSafeInteger(v.revision) || v.revision < 0
  || typeof v.generation !== 'number' || !Number.isSafeInteger(v.generation) || v.generation < 0
  || typeof v.mutationId !== 'string' || !CONTINUITY_UUID.test(v.mutationId)
  || !v.payload || typeof v.payload !== 'object' || Array.isArray(v.payload)) return null;
 const p = v.payload as Record<string,unknown>;
 if (v.action === 'save') {
  if (Object.keys(p).length !== 3 || !['consent','preferences','trip'].every(k => Object.hasOwn(p,k)) || p.consent !== true
   || (p.preferences !== null && !parseContinuityPreferences(p.preferences))
   || (p.trip !== null && !parseSavedTrip(p.trip))) return null;
 } else if (Object.keys(p).length) return null;
 return v as ContinuityMutation;
}
export type ContinuitySnapshot = {
 revision: number; generation: number; consentEnabled: boolean; consentVersion: string | null;
 preferences: ReturnType<typeof parseContinuityPreferences>; preferencesExpiresAt: string | null;
 trip: ReturnType<typeof parseSavedTrip>; tripExpiresAt: string | null; updatedAt: string | null;
};
export function parseContinuitySnapshot(value: unknown): ContinuitySnapshot | null {
 if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
 const v=value as Record<string,unknown>;
 const timestamp=(s:unknown) => s===null || (typeof s==='string' && Number.isFinite(Date.parse(s)));
 if (typeof v.revision!=='number' || !Number.isSafeInteger(v.revision) || v.revision<0
  || typeof v.generation!=='number' || !Number.isSafeInteger(v.generation) || v.generation<0 || typeof v.consentEnabled!=='boolean'
  || (v.consentVersion!==null && v.consentVersion!=='task187-v1')
  || !timestamp(v.preferencesExpiresAt) || !timestamp(v.tripExpiresAt) || !timestamp(v.updatedAt)
  || (v.preferences!==null && !parseContinuityPreferences(v.preferences)) || (v.trip!==null && !parseSavedTrip(v.trip))
  || (v.preferences===null)!==(v.preferencesExpiresAt===null) || (v.trip===null)!==(v.tripExpiresAt===null)
  || (!v.consentEnabled && (v.preferences!==null || v.trip!==null))) return null;
 return { revision:v.revision,generation:v.generation,consentEnabled:v.consentEnabled,consentVersion:v.consentVersion as string|null,
 preferences:parseContinuityPreferences(v.preferences),preferencesExpiresAt:v.preferencesExpiresAt as string|null,
 trip:parseSavedTrip(v.trip),tripExpiresAt:v.tripExpiresAt as string|null,updatedAt:v.updatedAt as string|null };
}
export type ContinuityRpc = (name: string, args?: Record<string,unknown>) => Promise<{ data:unknown; error:{ code?:string; message?:string }|null }>;
export async function readContinuity(rpc:ContinuityRpc) {
 const {data,error}=await rpc('dabra_continuity_read');
 if(error) throw new Error('CONTINUITY_UNAVAILABLE');
 const state=parseContinuitySnapshot(data);
 if(!state) throw new Error('CONTINUITY_UNAVAILABLE');
 return state;
}
export async function mutateContinuity(rpc:ContinuityRpc,input:ContinuityMutation) {
 const {data,error}=await rpc('dabra_continuity_mutate',{p_action:input.action,p_revision:input.revision,p_generation:input.generation,p_mutation:input.mutationId,p_payload:input.payload});
 if(error) throw new Error(error.code==='40001'?'CONTINUITY_CONFLICT':error.code==='22023'?'CONTINUITY_INVALID':'CONTINUITY_UNAVAILABLE');
 const state=parseContinuitySnapshot(data);
 if(!state) throw new Error('CONTINUITY_UNAVAILABLE');
 return state;
}
