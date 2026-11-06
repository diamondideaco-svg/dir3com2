import 'server-only';

import { createHash } from 'node:crypto';

// Trusted permit preparation only. Never expose this result through a public route,
// accept it from a browser, or use the bind RPC to choose/replace the pinned proof.
export function prepareExistingWorkerBindingProof(): { expectedWorkerSha256: string } | null {
  const worker = process.env.DIR3COM_WHATSAPP_WORKER_SECRET;
  if (typeof worker !== 'string' || worker.length < 32 || worker.length > 512) return null;
  return {
    expectedWorkerSha256: createHash('sha256')
      .update('task166-existing-worker-v1:' + worker, 'utf8')
      .digest('hex'),
  };
}
