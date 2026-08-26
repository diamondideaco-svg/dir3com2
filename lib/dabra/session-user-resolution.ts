export type DabraSessionIdentity = {
  identityState: 'authenticated' | 'anonymous_confirmed' | 'unresolved_or_error';
  authenticated: boolean;
  userId: string | null;
};

export type DabraSessionUserResolution<TUser> =
  | { identityState: 'authenticated'; user: TUser }
  | { identityState: 'anonymous_confirmed'; user: null }
  | { identityState: 'unresolved_or_error'; user: null; error: unknown };

function isConfirmedMissingSession(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'name' in error && error.name === 'AuthSessionMissingError';
}

export async function resolveDabraSessionUser<TUser>(
  getUser: () => Promise<{ data: { user: TUser | null }; error: unknown }>
): Promise<DabraSessionUserResolution<TUser>> {
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

export function anonymousDabraIdentity(): DabraSessionIdentity {
  return { identityState: 'anonymous_confirmed', authenticated: false, userId: null };
}

export function unresolvedDabraIdentity(): DabraSessionIdentity {
  return { identityState: 'unresolved_or_error', authenticated: false, userId: null };
}
