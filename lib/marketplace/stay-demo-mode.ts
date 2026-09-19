/** Server use only; never serialize the environment to a client. Default OFF. */
export function stayDemoEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const common = env.DIR3COM_STAY_SANDBOX_ENABLED === 'true'
    && env.DIR3COM_STAY_SANDBOX_PROVIDERS === 'liteapi'
    && env.LITEAPI_ENV === 'sandbox'
    && Boolean(env.LITEAPI_TEST_API_KEY?.trim().startsWith('sand_'));
  if (!common) return false;
  if (env.VERCEL_ENV === 'production') {
    return env.DIR3COM_STAY_SANDBOX_PRODUCTION_ENABLED === 'true'
      && Boolean(env.DIR3COM_STAY_SANDBOX_RATE_SALT?.trim().length && env.DIR3COM_STAY_SANDBOX_RATE_SALT.trim().length >= 32);
  }
  return env.VERCEL_ENV === 'preview'
    || (!env.VERCEL_ENV && env.DIR3COM_STAY_SANDBOX_LOCAL === 'true');
}
