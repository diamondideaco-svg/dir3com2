import 'server-only';

export type SuccessfulTaskPilotSnapshot =
  | Readonly<{ kind: 'disabled' | 'unavailable' }>
  | Readonly<{ kind: 'configured';
      program: Readonly<{ schema: 'dabra-successful-task-program-v1'; revision: string }>;
      membership: Readonly<{ actorId: string; revision: string }> }>;

/** One private read per request; no value is provisioned here or cached globally. */
export function readSuccessfulTaskPilotConfig(): SuccessfulTaskPilotSnapshot {
  try { return parseSuccessfulTaskPilotConfig(process.env.DABRA_SUCCESSFUL_TASK_PILOT_CONFIG); }
  catch { return Object.freeze({ kind: 'unavailable' }); }
}

/** Only absence disables selection. Invalid configuration never selects legacy. */
export function parseSuccessfulTaskPilotConfig(raw: unknown): SuccessfulTaskPilotSnapshot {
  return parseSuccessfulTaskConfig(raw, 'dabra-successful-task-pilot-v1');
}

function parseSuccessfulTaskConfig(raw: unknown, schema: string): SuccessfulTaskPilotSnapshot {
  if (raw === undefined) return Object.freeze({ kind: 'disabled' });
  try {
    if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > 1024) throw new Error();
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    const v = value as Record<string, unknown>;
    if (Object.keys(v).sort().join(',') !== 'actorId,revision,schema'
      || v.schema !== schema
      || typeof v.revision !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(v.revision)
      || typeof v.actorId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v.actorId)) throw new Error();
    return Object.freeze({ kind: 'configured',
      program: Object.freeze({ schema: 'dabra-successful-task-program-v1', revision: v.revision }),
      membership: Object.freeze({ actorId: v.actorId.toLowerCase(), revision: v.revision }) });
  } catch { return Object.freeze({ kind: 'unavailable' }); }
}

/** Consent preparation has a separate gate and never selects task execution.
 * If both gates are configured, they must identify the same account/revision.
 * Withdrawal and status remain independent of either gate.
 */
export function readSuccessfulTaskConsentConfig(): SuccessfulTaskPilotSnapshot {
  try {
    const execution = readSuccessfulTaskPilotConfig();
    const consent = parseSuccessfulTaskConfig(process.env.DABRA_SUCCESSFUL_TASK_CONSENT_CONFIG, 'dabra-successful-task-consent-pilot-v1');
    if (consent.kind === 'disabled') return execution;
    if (consent.kind !== 'configured' || execution.kind === 'unavailable') return Object.freeze({ kind: 'unavailable' });
    if (execution.kind === 'configured' && (execution.membership.actorId !== consent.membership.actorId
      || execution.program.revision !== consent.program.revision)) return Object.freeze({ kind: 'unavailable' });
    return consent;
  } catch { return Object.freeze({ kind: 'unavailable' }); }
}
