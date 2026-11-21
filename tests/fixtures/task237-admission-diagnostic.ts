// Test-only observation after an unchanged admission assertion fails.
// Never returns query text, actor IDs, proofs, counters, credentials or errors.
type DiagnosticClient = { query(text:string, values?:unknown[]):Promise<{rows:unknown[]}> };
export type Task237AdmissionDiagnostic = 'eligibility-observed-false' | 'validity-observed-expired' | 'lock-observed-after-denial' | 'unclassified-denial' | 'diagnostic-timeout-or-cancel' | 'diagnostic-unavailable';
export async function task237AdmissionDiagnostic(client:DiagnosticClient, actorId:string, authorityId:string, observationExpiresAtMs:number):Promise<Task237AdmissionDiagnostic> {
 try {
  await client.query('BEGIN READ ONLY');
  await client.query("SET LOCAL statement_timeout='750ms'");
  const guard=(await client.query("SELECT current_database() ~ '^task237_synthetic_[a-f0-9]{32}$' AS synthetic")).rows[0];
  if(!guard || typeof guard!=='object' || !('synthetic' in guard) || guard.synthetic!==true)return 'diagnostic-unavailable';
  const row=(await client.query(`SELECT
   coalesce((SELECT enabled FROM private.dabra_successful_task_control WHERE singleton),false)
    AND private.dabra_public_actor_active($1)
    AND EXISTS(SELECT 1 FROM private.dabra_public_dialogue_authorities a JOIN private.dabra_dialogue_funding_grants g ON g.id=a.source_grant_id
     WHERE a.id=$2 AND a.enabled AND g.enabled AND a.model_tier='economy' AND g.funding_mode='bounded-account-charge' AND g.proof IS NOT DISTINCT FROM a.source_proof) AS eligible,
   coalesce((SELECT (a.profile->'measurement'->>'expiresAtMs')::numeric<=floor(extract(epoch FROM clock_timestamp())*1000) FROM private.dabra_public_dialogue_authorities a WHERE a.id=$2),true)
    OR $3::numeric<=floor(extract(epoch FROM clock_timestamp())*1000) AS expired,
   EXISTS(SELECT 1 FROM pg_locks l WHERE l.database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND l.pid<>pg_backend_pid() AND l.granted AND (
    (l.relation IN ('private.dabra_successful_tasks'::regclass,'private.dabra_public_dialogue_admissions'::regclass)
     AND l.mode IN ('RowExclusiveLock','ShareUpdateExclusiveLock','ShareLock','ShareRowExclusiveLock','ExclusiveLock','AccessExclusiveLock'))
    OR (l.relation IN ('private.dabra_dialogue_admissions'::regclass,'private.dabra_dialogue_funding_grants'::regclass,'private.dabra_public_dialogue_authorities'::regclass,'private.dabra_successful_task_control'::regclass,'auth.users'::regclass,'public.profiles'::regclass)
     AND l.mode IN ('ExclusiveLock','AccessExclusiveLock'))
    OR (l.locktype='advisory' AND l.objsubid=1 AND l.mode='ExclusiveLock' AND ((l.classid::bigint<<32)|l.objid::bigint)=hashtextextended('task217-existing-credit-v2',0))
   )) AS locked`,[actorId,authorityId,observationExpiresAtMs])).rows[0];
  if(!row || typeof row!=='object' || !('eligible' in row) || typeof row.eligible!=='boolean' || !('expired' in row) || typeof row.expired!=='boolean' || !('locked' in row) || typeof row.locked!=='boolean')return 'diagnostic-unavailable';
  if(!row.eligible)return 'eligibility-observed-false';
  if(row.expired)return 'validity-observed-expired';
  // The holder is observed AFTER denial. Its absence cannot rule out a transient lock.
  return row.locked ? 'lock-observed-after-denial' : 'unclassified-denial';
 } catch(error:unknown) {
  return error && typeof error==='object' && 'code' in error && error.code==='57014' ? 'diagnostic-timeout-or-cancel' : 'diagnostic-unavailable';
 } finally {
  // This read-only transaction starts only after claim() has already committed.
  try{await client.query('ROLLBACK');}catch{/* The original assertion still fails. */}
 }
}
