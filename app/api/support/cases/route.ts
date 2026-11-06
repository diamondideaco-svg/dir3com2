import { NextRequest, NextResponse } from 'next/server';
import { resolveCustomerCaseAccess } from '@/lib/contact/customer-cases-server';
import { parseCustomerCaseReference } from '@/lib/contact/customer-cases';
import { handleContact } from '@/lib/contact/handler';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Cookie, Authorization' };
function failure(kind: 'authentication_required' | 'forbidden' | 'unavailable') {
  return NextResponse.json({ code: kind === 'authentication_required' ? 'CASE_AUTH_REQUIRED' : kind === 'forbidden' ? 'CASE_FORBIDDEN' : 'CASE_UNAVAILABLE' },
    { status: kind === 'authentication_required' ? 401 : kind === 'forbidden' ? 403 : 503, headers });
}
export async function GET(request: NextRequest) {
  const url = new URL(request.url), references = url.searchParams.getAll('reference');
  if ([...url.searchParams.keys()].some(k => k !== 'reference') || references.length > 1
    || (references.length === 1 && !parseCustomerCaseReference(references[0]))) {
    return NextResponse.json({ code: 'CASE_INVALID' }, { status: 400, headers });
  }
  const access = await resolveCustomerCaseAccess(request);
  if (access.kind !== 'ready') return failure(access.kind);
  const result = await access.read(references[0] ?? null);
  if (result.kind !== 'ready') return failure(result.kind);
  return NextResponse.json(result, { headers });
}
export async function POST(request: NextRequest) {
  const access = await resolveCustomerCaseAccess(request);
  if (access.kind !== 'ready') return failure(access.kind);
  // Reuse the bounded parser, origin check, canonical input and global-key
  // idempotency contract. The authenticated adapter never falls back to anonymous.
  const response = await handleContact(request, access.save);
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  return response;
}
