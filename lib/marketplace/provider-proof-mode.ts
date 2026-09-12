import type { DataSourceMode } from './travel-provider-adapter';
import { isSabreCertUrl } from '@/lib/sabre/config';

export const PROVIDER_PROOF_PATH = '/marketplace/provider-proof';
export const PROVIDER_PROOF_API_PATH = '/api/marketplace/provider-proof';
export const MARKETPLACE_API_PATH = '/api/services';
export const MARKETPLACE_LITEAPI_PROOF_VALUE = 'liteapi';
export const PROVIDER_PROOF_PROVIDERS = ['duffel', 'liteapi', 'sabre'] as const;
export type ProviderProofProvider = (typeof PROVIDER_PROOF_PROVIDERS)[number];
export type ProviderProofEnvironment = 'sandbox' | 'live';

export function isProviderProofEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  // Vercel Preview builds run with NODE_ENV=production; the deployment
  // environment, explicit flag, and provider allowlist remain the authority.
  if (env.VERCEL_ENV === 'production') return false;
  if (env.NODE_ENV === 'production' && env.VERCEL_ENV !== 'preview') return false;
  if (env.DIR3COM_PROVIDER_PROOF_ENABLED !== 'true') return false;
  return env.VERCEL_ENV === 'preview' || env.DIR3COM_PROVIDER_PROOF_LOCAL === 'true';
}

export function providerProofProviders(env: NodeJS.ProcessEnv = process.env): ProviderProofProvider[] {
  const configured = env.DIR3COM_PROVIDER_PROOF_PROVIDERS
    ?.split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const requested = configured?.length ? configured : [...PROVIDER_PROOF_PROVIDERS];
  return PROVIDER_PROOF_PROVIDERS.filter((provider) => requested.includes(provider));
}

export function providerProofMode(environment: ProviderProofEnvironment): DataSourceMode {
  return environment === 'sandbox' ? 'PROVIDER_SANDBOX' : 'PROVIDER_LIVE';
}

export function isProviderProofPath(pathname: string): boolean {
  return pathname === PROVIDER_PROOF_PATH || pathname === PROVIDER_PROOF_API_PATH;
}

/**
 * Route-level authorization for the proof API. Preview/local and an explicit
 * feature flag are required; production can never enter this mode.
 */
export function authorizeProviderProofRequest(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return false;
  }
  if (url.pathname !== PROVIDER_PROOF_API_PATH || !isProviderProofEnabled(env)) return false;

  const environment = url.searchParams.get('environment') ?? 'sandbox';
  if (environment !== 'sandbox' && environment !== 'live') return false;

  const providers = url.searchParams.getAll('provider');
  if (providers.some((provider) => !providerProofProviders(env).includes(provider as ProviderProofProvider))) return false;
  return true;
}

/**
 * Allows LiteAPI Sandbox cards to enter the customer Marketplace Stay flow
 * only under the existing explicit local/Preview proof gate. Query parameters
 * are not authority: production and every non-Stay request remain fail-closed.
 */
export function authorizeMarketplaceLiteApiProofRequest(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return false;
  }

  return url.pathname === MARKETPLACE_API_PATH
    && url.searchParams.get('family') === 'dir3-stay'
    && url.searchParams.get('providerProof') === MARKETPLACE_LITEAPI_PROOF_VALUE
    && isProviderProofEnabled(env)
    && providerProofProviders(env).includes('liteapi')
    && providerEnvironmentAllowed('liteapi', 'sandbox', env);
}

export function proofEnvironmentAllowed(
  environment: ProviderProofEnvironment,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!isProviderProofEnabled(env)) return false;
  if (environment === 'sandbox') {
    return env.DUFFEL_ENV?.trim().toLowerCase() === 'sandbox'
      || env.DUFFEL_ENV?.trim().toLowerCase() === 'test'
      || env.LITEAPI_ENV?.trim().toLowerCase() === 'sandbox'
      || sabreSandboxConfigured(env);
  }
  return env.DUFFEL_ENV?.trim().toLowerCase() === 'production'
    || env.DUFFEL_ENV?.trim().toLowerCase() === 'live'
    || env.LITEAPI_ENV?.trim().toLowerCase() === 'production'
    || env.LITEAPI_ENV?.trim().toLowerCase() === 'live';
}

export function providerEnvironmentAllowed(
  provider: ProviderProofProvider,
  environment: ProviderProofEnvironment,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (provider === 'sabre') {
    // The existing Sabre BFM integration targets the cert endpoint. It is
    // intentionally proof-only; never treat it as a live marketplace source.
    return environment === 'sandbox' && sabreSandboxConfigured(env);
  }

  const value = provider === 'duffel'
    ? env.DUFFEL_ENV?.trim().toLowerCase()
    : env.LITEAPI_ENV?.trim().toLowerCase();
  return environment === 'sandbox'
    ? (provider === 'duffel' ? value === 'sandbox' || value === 'test' : value === 'sandbox')
    : value === 'production' || value === 'live';
}

function sabreSandboxConfigured(env: NodeJS.ProcessEnv): boolean {
  const hasCredentials = Boolean(env.SABRE_PCC?.trim() && env.SABRE_USER_ID?.trim() && env.SABRE_PASSWORD?.trim());
  if (!hasCredentials) return false;

  const explicitEnvironment = env.SABRE_ENV?.trim().toLowerCase();
  if (explicitEnvironment && !['sandbox', 'test', 'cert', 'certification'].includes(explicitEnvironment)) return false;

  return isSabreCertUrl(env.SABRE_API_BASE_URL || 'https://api.cert.platform.sabre.com')
    && isSabreCertUrl(env.SABRE_AUTH_URL || 'https://api.cert.platform.sabre.com/v2/auth/token');
}
