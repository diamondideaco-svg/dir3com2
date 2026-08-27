import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

test('portal pages authorize from the server profile role and fail closed without it', () => {
  for (const sourceFile of ['app/partner-portal/page.tsx', 'app/provider-portal/page.tsx']) {
    const source = fs.readFileSync(path.join(root, sourceFile), 'utf8');
    assert.match(source, /\.from\('profiles'\)/);
    assert.match(source, /normalizeAuthRole\(profile\?\.role\)/);
    assert.doesNotMatch(source, /metadata\.role/);
    assert.match(source, /redirect\('\/my-account'\)/);
  }
});

test('portal APIs never authorize a partner role from mutable user metadata', () => {
  const source = fs.readFileSync(path.join(root, 'lib/partner-portal/server.ts'), 'utf8');
  assert.match(source, /normalizeAuthRole\(profile\?\.role\)/);
  assert.doesNotMatch(source, /profile\?\.role \|\| metadata\.role/);
  assert.match(source, /PORTAL_ALLOWED_AUTH_ROLES\.has\(authRole\)/);
  assert.match(source, /partnerDomainType = authRole === 'partner'/);
});
