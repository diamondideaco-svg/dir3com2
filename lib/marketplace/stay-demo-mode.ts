/** Server use only; never serialize the environment to a client. Default OFF. */
export function stayDemoEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.DIR3COM_STAY_SANDBOX_ENABLED === 'true'
    && env.DIR3COM_STAY_SANDBOX_PROVIDERS === 'liteapi'
    && env.LITEAPI_ENV === 'sandbox'
    && Boolean(env.LITEAPI_TEST_API_KEY?.trim().startsWith('sand_'))
    && (env.VERCEL_ENV === 'preview' || env.VERCEL_ENV === 'production'
      || (!env.VERCEL_ENV && env.DIR3COM_STAY_SANDBOX_LOCAL === 'true'));
}
