import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { proxy } from '../proxy';

test('unverified visitors can reach only the exact public verification page', () => {
  const response = proxy(new NextRequest('https://example.invalid/auth/verify-email'));
  assert.equal(response.headers.get('location'), null);
  assert.equal(response.headers.get('x-middleware-next'), '1');
});

test('verification routing does not open welcome, protected accounts or sibling auth routes', () => {
  for (const path of ['/login-success', '/my-account', '/my-documents', '/favorites', '/auth/verify-email/private']) {
    const response = proxy(new NextRequest('https://example.invalid' + path));
    assert.equal(response.status, 307);
    const target = new URL(response.headers.get('location')!);
    assert.equal(target.pathname, '/login');
    assert.equal(target.searchParams.get('next'), path);
  }
});
