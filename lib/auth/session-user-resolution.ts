export type SessionUserResolution<TUser> =
  | { identityState: 'authenticated'; user: TUser }
  | { identityState: 'anonymous_confirmed'; user: null }
  | { identityState: 'unresolved_or_error'; user: null; error: unknown };

function isConfirmedMissingSession(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'name' in error && error.name === 'AuthSessionMissingError';
}

export async function resolveSessionUser<TUser>(
  getUser: () => Promise<{ data: { user: TUser | null }; error: unknown }>
): Promise<SessionUserResolution<TUser>> {
  try {
    const { data: { user }, error } = await getUser();
    if (error && isConfirmedMissingSession(error)) return { identityState: 'anonymous_confirmed', user: null };
    if (error) return { identityState: 'unresolved_or_error', user: null, error };
    if (!user) return { identityState: 'anonymous_confirmed', user: null };
    return { identityState: 'authenticated', user };
  } catch (error) {
    return { identityState: 'unresolved_or_error', user: null, error };
  }
}
