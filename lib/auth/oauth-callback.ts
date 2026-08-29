const DIR3COM_VERCEL_PREVIEW_HOST = /^dir3com2(?:-[a-z0-9-]+)?-dir3com\.vercel\.app$/;

export function getTrustedVercelPreviewOrigin(value: string | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value.startsWith('http') ? value : `https://${value}`);
    if (url.protocol !== 'https:' || !DIR3COM_VERCEL_PREVIEW_HOST.test(url.hostname)) return null;
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
    const currentPreviewOrigin = getTrustedVercelPreviewOrigin(currentOrigin);
    if (currentPreviewOrigin) return currentPreviewOrigin;

    const branchOrigin = getTrustedVercelPreviewOrigin(branchUrl);
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
