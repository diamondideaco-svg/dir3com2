import 'server-only';

/** Separate from answer execution/consent policy: disabling generation must not
 * disable an authorized cleanup service. No scheduler or live authorization is
 * configured here. A later reviewed activation must supply this capability.
 */
export function readSuccessfulTaskCleanupAuthorization(): 'stored-deadline-content-only' | null {
  return null;
}
