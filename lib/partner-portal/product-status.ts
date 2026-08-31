const PARTNER_EDITABLE_PRODUCT_STATUSES = new Set(['draft', 'inactive']);
const KNOWN_PRODUCT_STATUSES = new Set([
  'draft',
  'inactive',
  'published',
  'active',
  'featured',
  'unpublished',
  'disabled',
  'archived',
  'hidden',
]);

type ProductStatusResolution =
  | { ok: true; status: string; changed: boolean }
  | {
      ok: false;
      code:
        | 'CURRENT_PRODUCT_STATUS_INVALID'
        | 'PRODUCT_STATUS_INVALID'
        | 'PRODUCT_STATUS_TRANSITION_DENIED';
      httpStatus: 400 | 403 | 409;
    };

function normalizedStatus(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function resolvePartnerProductCreateStatus(
  requestedStatus: unknown,
  statusProvided: boolean,
): ProductStatusResolution {
  if (!statusProvided) {
    return { ok: true, status: 'draft', changed: false };
  }

  const requested = normalizedStatus(requestedStatus);
  if (!requested || !KNOWN_PRODUCT_STATUSES.has(requested)) {
    return { ok: false, code: 'PRODUCT_STATUS_INVALID', httpStatus: 400 };
  }

  if (!PARTNER_EDITABLE_PRODUCT_STATUSES.has(requested)) {
    return { ok: false, code: 'PRODUCT_STATUS_TRANSITION_DENIED', httpStatus: 403 };
  }

  return { ok: true, status: requested, changed: false };
}

export function resolvePartnerProductUpdateStatus(
  currentStatus: unknown,
  requestedStatus: unknown,
  statusProvided: boolean,
): ProductStatusResolution {
  const current = normalizedStatus(currentStatus);
  if (!current) {
    return { ok: false, code: 'CURRENT_PRODUCT_STATUS_INVALID', httpStatus: 409 };
  }

  if (!statusProvided) {
    return { ok: true, status: current, changed: false };
  }

  const requested = normalizedStatus(requestedStatus);
  if (!requested) {
    return { ok: false, code: 'PRODUCT_STATUS_INVALID', httpStatus: 400 };
  }

  // A client may echo any authoritative server status without mutating it.
  // This preserves future valid lifecycle states without trusting the client
  // to create or escalate to those states.
  if (requested === current) {
    return { ok: true, status: current, changed: false };
  }

  if (!KNOWN_PRODUCT_STATUSES.has(requested)) {
    return { ok: false, code: 'PRODUCT_STATUS_INVALID', httpStatus: 400 };
  }

  if (!PARTNER_EDITABLE_PRODUCT_STATUSES.has(requested)) {
    return { ok: false, code: 'PRODUCT_STATUS_TRANSITION_DENIED', httpStatus: 403 };
  }

  return { ok: true, status: requested, changed: true };
}
