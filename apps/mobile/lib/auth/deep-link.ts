const AUTH_CALLBACK_PATH = 'auth/callback';

export function getAuthCallbackUrl() {
  return `dir3com://${AUTH_CALLBACK_PATH}`;
}

export function parseAuthCallbackUrl(url: string) {
  try {
    const normalized = url.replace('dir3com://', '');
    const [pathnamePart, queryPart] = normalized.split('?');
    const pathname = pathnamePart.replace(/^\//, '');
    const params: Record<string, string> = {};

    if (queryPart) {
      queryPart.split('&').forEach((segment) => {
        const [key, rawValue] = segment.split('=');
        if (key) {
          params[decodeURIComponent(key)] = decodeURIComponent(rawValue ?? '');
        }
      });
    }

    return {
      isAuthCallback: pathname === AUTH_CALLBACK_PATH,
      pathname,
      params,
    };
  } catch {
    return {
      isAuthCallback: false,
      pathname: '',
      params: {},
    };
  }
}
