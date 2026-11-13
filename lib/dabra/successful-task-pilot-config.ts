import 'server-only';

/** Private server configuration, never a client actor or a source-code identity
 * list. Provisioning the approved private source is a separate activation step.
 * Membership is independent of consent, funding and policy eligibility.
 */
export function readSuccessfulTaskPilotConfig(): Readonly<{
  schema: 'dabra-successful-task-pilot-v1'; actorId: string; revision: string;
}> | null {
  return null;
}
