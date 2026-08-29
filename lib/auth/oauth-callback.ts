const VERCEL_PREVIEW_SUFFIX = '.vercel.app';

function getTrustedVercelBranchOrigin(value: string | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value.startsWith('http') ? value : `https://${value}`);
    if (url.protocol !== 'https:' || !url.hostname.endsWith(VERCEL_PREVIEW_SUFFIX)) return null;
    if (url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function getOAuthCallbackOrigin(
  currentOrigin: string,
  environment = process.env.NEXT_PUBLIC_VERCEL_ENV,
  branchUrl = process.env.NEXT_PUBLIC_VERCEL_BRANCH_URL,
) {
  if (environment === 'preview') {
    const branchOrigin = getTrustedVercelBranchOrigin(branchUrl);
    if (branchOrigin) return branchOrigin;
  }

  return new URL(currentOrigin).origin;
}

export function buildOAuthCallbackUrl(currentOrigin: string, destination: string) {
  const callbackOrigin = getOAuthCallbackOrigin(currentOrigin);
  const callback = new URL('/auth/callback', callbackOrigin);
  callback.searchParams.set('redirect', destination);
  callback.searchParams.set('next', destination);
  return callback.toString();
}
