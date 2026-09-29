import { parseContact, UUID_PATTERN, type ContactInput } from './contract';
export type SaveContact = (input: ContactInput, key: string) => Promise<
  { kind: 'saved'; reference: string; replay: boolean } | { kind: 'conflict' | 'limited' | 'unavailable' }
>;
const headers = { 'Cache-Control': 'no-store' };
const failure = (status: number, code: string) => Response.json({ code }, { status, headers });
// Bounded streaming protects the JSON parser even without Content-Length.
async function readBody(request: Request) {
  if (!request.body) throw new Error('INVALID');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 16384) { await reader.cancel(); throw new Error('TOO_LARGE'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function handleContact(request: Request, save: SaveContact) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return failure(403, 'CONTACT_ORIGIN_REJECTED');
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return failure(415, 'CONTACT_INVALID');
  const key = request.headers.get('idempotency-key');
  if (!key || !UUID_PATTERN.test(key)) return failure(400, 'CONTACT_INVALID');
  let input: ContactInput | null;
  try { input = parseContact(await readBody(request)); }
  catch (error) { return failure(error instanceof Error && error.message === 'TOO_LARGE' ? 413 : 400, 'CONTACT_INVALID'); }
  if (!input) return failure(400, 'CONTACT_INVALID');
  try {
    const result = await save(input, key);
    if (result.kind === 'conflict') return failure(409, 'CONTACT_KEY_CONFLICT');
    if (result.kind === 'limited') return Response.json({ code: 'CONTACT_RATE_LIMITED' }, { status: 429, headers: { ...headers, 'Retry-After': '3600' } });
    if (result.kind !== 'saved') return failure(503, 'CONTACT_DELIVERY_UNAVAILABLE');
    return Response.json({ reference: result.reference, status: 'received', externalDelivery: false }, { status: result.replay ? 200 : 201, headers });
  } catch { return failure(503, 'CONTACT_DELIVERY_UNAVAILABLE'); }
}
