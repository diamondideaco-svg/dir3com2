type AttemptState = { nonce: string | null };
type AttemptStorage = Pick<Storage, 'getItem' | 'setItem'>;
const STORAGE_KEY = 'dir3com:marketplace-request-session:v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A tab-scoped intent key, not authentication. No request/identity data is stored. */
export async function marketplaceRequestAttemptKey(
  state: AttemptState,
  actorId: string,
  body: string,
  storage: () => AttemptStorage,
): Promise<string> {
  if (!state.nonce) {
    try {
      const saved = storage().getItem(STORAGE_KEY);
      if (saved && UUID.test(saved)) state.nonce = saved;
    } catch { /* Storage restrictions still permit same-mount retries. */ }
    state.nonce ??= crypto.randomUUID();
    try { storage().setItem(STORAGE_KEY, state.nonce); } catch { /* Keep the in-memory nonce. */ }
  }
  // A changed actor or request payload is a different intent. The same intent
  // survives response loss, route remounts and reloads within this browser tab.
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([state.nonce, actorId, body])));
  return `pdp-${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
