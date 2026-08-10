type ErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

function text(value: unknown) {
  return String(value || '').toLowerCase();
}

function startsWithSandboxSlug(value: unknown) {
  return text(value).startsWith('sandbox-');
}

function includesSyntheticLabel(value: unknown) {
  const v = text(value);
  return v.includes('synthetic') || v.includes('اصطناعي') || v.includes('تجريبي') || v.includes('sandbox');
}

function startsWithTestReference(value: unknown) {
  return String(value || '').toUpperCase().startsWith('TEST-');
}

export function isSyntheticSchemaRolloutError(error: unknown) {
  if (!error || typeof error !== 'object') return false;

  const value = error as ErrorLike;
  const haystack = `${text(value.message)} ${text(value.details)} ${text(value.hint)}`;

  // Only treat explicit missing synthetic column failures as rollout gaps.
  const missingColumnShape = /column\s+"?synthetic"?\s+does\s+not\s+exist/.test(haystack);
  return value.code === '42703' && missingColumnShape;
}

export function isOperationalSyntheticSchemaError(error: unknown) {
  return isSyntheticSchemaRolloutError(error);
}

export function getSyntheticSchemaOperationalMessage() {
  return 'Marketplace schema rollout is incomplete. Please retry after infrastructure migration verification.';
}

export function looksSyntheticRecord(input: Record<string, unknown>) {
  if (input.synthetic === true) return true;
  if (startsWithSandboxSlug(input.slug)) return true;
  if (includesSyntheticLabel(input.name_en) || includesSyntheticLabel(input.name_ar)) return true;
  if (startsWithTestReference(input.reference_code)) return true;
  return false;
}

export function keepPublicNonSynthetic<T extends Record<string, unknown>>(rows: T[]) {
  return rows.filter((row) => !looksSyntheticRecord(row));
}

export function keepPublicCategoryNonSynthetic<T extends Record<string, unknown>>(rows: T[]) {
  return rows.filter((row) => !looksSyntheticRecord(row));
}

export function keepPublicAssetsNonSynthetic<T extends Record<string, unknown>>(rows: T[]) {
  return rows.filter((row) => !looksSyntheticRecord(row));
}

export function sanitizeServiceProductsForCompatibility(products: unknown[]) {
  return (Array.isArray(products) ? products : []).filter((product) => {
    if (!product || typeof product !== 'object') return false;
    return !looksSyntheticRecord(product as Record<string, unknown>);
  });
}
