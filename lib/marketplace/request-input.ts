export type MarketplaceRequestInputResult =
  | { ok: true; requestedFor: string; travellers: number }
  | { ok: false; error: string };

function normalizeRequestedFor(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const timestamp = Date.parse(trimmed);
  if (!Number.isFinite(timestamp)) return null;

  try {
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime())) return null;
    return date.toISOString();
  } catch {
    return null;
  }
}

export function parseMarketplaceRequestInputs(body: Record<string, unknown>): MarketplaceRequestInputResult {
  if (typeof body.requested_for !== 'string' || !body.requested_for.trim()) {
    return { ok: false, error: 'Requested date is required' };
  }

  const requestedFor = normalizeRequestedFor(body.requested_for);
  if (!requestedFor) {
    return { ok: false, error: 'Invalid requested date' };
  }

  if (body.traveller_count === undefined || body.traveller_count === null || body.traveller_count === '') {
    return { ok: false, error: 'Traveller count is required' };
  }

  const travellers = Number(body.traveller_count);
  if (!Number.isInteger(travellers) || travellers < 1 || travellers > 99) {
    return { ok: false, error: 'Invalid traveller count' };
  }

  return { ok: true, requestedFor, travellers };
}
