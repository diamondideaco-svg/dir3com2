import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

function assertPass(condition, title, details) {
  if (!condition) {
    throw new Error(`FAIL: ${title}${details ? `\n${details}` : ''}`);
  }
  console.log(`PASS: ${title}`);
}

const identitySource = read('lib/auth/identity.ts');
const contractSource = read('lib/auth/identity-contract.ts');
const sessionIdentityRouteSource = read('app/api/auth/session-identity/route.ts');
const sessionIdentityHookSource = read('hooks/useSessionIdentity.ts');
const headerSource = read('components/layout/Header.tsx');
const profilePageSource = read('app/profile/page.tsx');
const dashboardPageSource = read('app/dashboard/page.tsx');
const proxySource = read('proxy.ts');
const callbackSource = read('app/auth/callback/route.ts');

assertPass(
  /return normalized \?\? null;/.test(identitySource),
  'role normalization does not fallback to customer for unknown roles'
);

assertPass(
  /role: metadataRole \?\? 'customer'/.test(identitySource),
  'customer fallback is limited to new profile creation only'
);

const profileUpdateBlockMatch = identitySource.match(/\.update\(\{([\s\S]*?)\}\)\s*\.eq\('id', user\.id\)/);
const profileUpdateBlock = profileUpdateBlockMatch?.[1] ?? '';

assertPass(
  /full_name:/.test(profileUpdateBlock) && /email,/.test(profileUpdateBlock) && !/role:/.test(profileUpdateBlock),
  'existing profile update does not overwrite existing role'
);

assertPass(
  /authenticated: boolean;[\s\S]*userId: string \| null;[\s\S]*email: string \| null;[\s\S]*displayName: string \| null;[\s\S]*avatarUrl: string \| null;[\s\S]*role: SessionRole \| null;[\s\S]*status: string \| null;[\s\S]*isAdmin: boolean;/.test(contractSource),
  'session identity contract exposes required camelCase fields'
);

assertPass(
  /createAnonymousSessionIdentity/.test(sessionIdentityRouteSource) &&
    /authenticated: true/.test(sessionIdentityRouteSource) &&
    /isAdmin: role === 'admin'/.test(sessionIdentityRouteSource),
  'session identity API returns authenticated and role-derived isAdmin values'
);

assertPass(
  /fetch\('\/api\/auth\/session-identity'/.test(sessionIdentityHookSource) && /normalizeSessionIdentityPayload/.test(sessionIdentityHookSource),
  'useSessionIdentity hook reads normalized session identity contract'
);

assertPass(
  /useSessionIdentity\(\)/.test(headerSource) &&
    /!isLoading && isAuthenticated/.test(headerSource) &&
    /buildLoginTarget\('\/my-account'\)/.test(headerSource),
  'Header gates private account items until authenticated session is resolved'
);

assertPass(
  /createSupabaseServerClient/.test(profilePageSource) && /redirect\(buildLoginTarget\('\/profile'\)\)/.test(profilePageSource),
  '/profile performs server-side auth check before redirecting'
);

assertPass(
  /resolveCanonicalUserRole/.test(dashboardPageSource) && /role !== 'admin'/.test(dashboardPageSource),
  '/dashboard enforces server-side admin role guard'
);

assertPass(
  /'\/profile'/.test(proxySource) && /'\/dashboard'/.test(proxySource),
  'proxy protected-route inventory includes /profile and /dashboard'
);

assertPass(
  /ensureCanonicalProfileFromAuthUser/.test(callbackSource),
  'Google callback keeps identity sync through hardened canonical profile routine'
);

console.log('PASS: EO-088 contract checks complete');
