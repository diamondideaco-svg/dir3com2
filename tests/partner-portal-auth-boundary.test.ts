import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

test('portal pages authorize from the server profile role and fail closed without it', () => {
  const partnerPage = fs.readFileSync(path.join(root, 'app/partner-portal/page.tsx'), 'utf8');
  assert.match(partnerPage, /requirePortalActor\(\)/);
  assert.doesNotMatch(partnerPage, /metadata\.role|\.from\('profiles'\)/);

  const providerPage = fs.readFileSync(path.join(root, 'app/provider-portal/page.tsx'), 'utf8');
  assert.match(providerPage, /\.from\('profiles'\)/);
  assert.match(providerPage, /normalizeAuthRole\(profile\?\.role\)/);
  assert.doesNotMatch(providerPage, /metadata\.role/);
  assert.match(providerPage, /redirect\('\/my-account'\)/);
});

test('portal APIs never authorize a partner role from mutable user metadata', () => {
  const source = fs.readFileSync(path.join(root, 'lib/partner-portal/server.ts'), 'utf8');
  assert.match(source, /resolveCanonicalActiveProfile\(supabase, user\.id\)/);
  assert.doesNotMatch(source, /profile\?\.role \|\| metadata\.role/);
  assert.match(source, /PORTAL_ALLOWED_AUTH_ROLES\.has\(authRole\)/);
  assert.match(source, /partnerDomainType = authRole === 'partner'/);
});
