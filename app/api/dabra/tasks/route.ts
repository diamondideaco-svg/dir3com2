import { successfulTaskReplayResponse } from '@/lib/dabra/successful-task-replay';
/** No production adapter is installed. The real route always fails closed, without reading data.
 * Authenticated owner replay is implemented and exercised only with injected synthetic dependencies.
 * A later privacy-approved source change, not request JSON or an env flag, is required to connect it.
 */
export async function POST(request: Request) {
  return successfulTaskReplayResponse(request);
}
