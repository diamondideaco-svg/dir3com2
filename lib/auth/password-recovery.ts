import type { SupabaseClient } from '@supabase/supabase-js';
import { getOAuthCallbackOrigin } from './oauth-callback';

type RecoveryAuth = Pick<SupabaseClient['auth'], 'getSession' | 'getClaims' | 'getUser' | 'resetPasswordForEmail' | 'updateUser' | 'signOut'>;
export type RecoveryIdentity = { userId: string; sessionId: string };
export type RecoveryFailure = 'invalid-session' | 'password-required' | 'password-short' | 'password-mismatch' | 'request-failed' | 'update-failed';
export class RecoveryError extends Error {
  constructor(public readonly code: RecoveryFailure) { super(code); }
}

// Match the existing Register minimum; Supabase remains authoritative for stronger policy.
export const RECOVERY_PASSWORD_MIN_LENGTH = 6;
export function recoveryRedirect(origin: string) {
  const url = new URL('/auth/reset-password', getOAuthCallbackOrigin(origin));
  const local = url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || ['127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new RecoveryError('request-failed');
  return url.toString();
}

export async function requestPasswordRecovery(auth: RecoveryAuth, email: string, origin: string) {
  try {
    const { error } = await auth.resetPasswordForEmail(email.trim(), { redirectTo: recoveryRedirect(origin) });
    if (error) throw new RecoveryError('request-failed');
  } catch { throw new RecoveryError('request-failed'); }
}

export function validateRecoveryPassword(password: string, confirmation: string) {
  if (!password || !confirmation) throw new RecoveryError('password-required');
  if (password.length < RECOVERY_PASSWORD_MIN_LENGTH) throw new RecoveryError('password-short');
  if (password !== confirmation) throw new RecoveryError('password-mismatch');
}

export async function validateRecoverySession(auth: RecoveryAuth): Promise<RecoveryIdentity> {
  try {
    // The existing SSR browser client initializes/exchanges the PKCE callback.
    // A cached session or PASSWORD_RECOVERY event alone is NOT proof.
    const { data, error } = await auth.getSession();
    const session = data.session;
    if (error || !session?.access_token) throw new Error();
    const verified = await auth.getClaims(session.access_token);
    const claims = verified.data?.claims;
    if (verified.error || !claims || claims.exp <= Date.now() / 1000 ||
        claims.sub !== session.user.id || claims.is_anonymous === true ||
        typeof claims.session_id !== 'string' || !claims.session_id ||
        !Array.isArray(claims.amr) || !claims.amr.some(method => typeof method === 'object' && method !== null && method.method === 'recovery')) throw new Error();
    const live = await auth.getUser(session.access_token);
    if (live.error || !live.data.user || live.data.user.is_anonymous || live.data.user.id !== claims.sub) throw new Error();
    const current = await auth.getSession();
    if (current.error || current.data.session?.access_token !== session.access_token) throw new Error();
    return { userId: claims.sub, sessionId: claims.session_id };
  } catch { throw new RecoveryError('invalid-session'); }
}

export async function updateRecoveredPassword(auth: RecoveryAuth, identity: RecoveryIdentity, password: string, confirmation: string) {
  validateRecoveryPassword(password, confirmation);
  const current = await validateRecoverySession(auth);
  if (current.userId !== identity.userId || current.sessionId !== identity.sessionId) throw new RecoveryError('invalid-session');
  try {
    const { data, error } = await auth.updateUser({ password });
    if (error || !data.user || data.user.id !== identity.userId) throw new Error();
  } catch { throw new RecoveryError('update-failed'); }
}
