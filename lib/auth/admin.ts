import 'server-only';

import { notFound, redirect } from 'next/navigation';
import { AuthorizationError, requireAdmin } from '@/lib/auth/authorization';

function buildLoginTarget(destination: string) {
  const encoded = encodeURIComponent(destination);
  return `/login?redirect=${encoded}&next=${encoded}`;
}

export async function requireAdminPageAccess(destination = '/admin') {
  try {
    return await requireAdmin();
  } catch (error) {
    if (error instanceof AuthorizationError && error.status === 401) {
      redirect(buildLoginTarget(destination));
    }
    if (error instanceof AuthorizationError && error.status === 403) {
      notFound();
    }
    throw error;
  }
}

export async function requireAdminActionAccess() {
  return requireAdmin();
}
