import 'server-only';

/** Dedicated worker credential digest and server-owned batch, not a session,
 * WhatsApp credential or answer-execution permission. Future provisioning must
 * approve a separate high-entropy token and its delivery/rotation. No credential,
 * ENV, scheduler or live authorization is installed by this contract.
 */
export function readSuccessfulTaskCleanupEndpointConfig(): Readonly<{
  tokenSha256: string; batchLimit: number;
}> | null {
  return null;
}
