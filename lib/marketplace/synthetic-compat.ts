type ErrorLike = {
  code?: string;
  message?: string;
  details?: string;
};

type Awaitable<T> = T | PromiseLike<T>;

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

export function isMissingSyntheticColumnError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const value = error as ErrorLike;
  const message = text(value.message);
  const details = text(value.details);
  return value.code === '42703' || message.includes('synthetic') || details.includes('synthetic');
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

export async function resolveArrayWithSyntheticCompatibility<T extends Record<string, unknown>>(
  runWithSyntheticFilter: () => Awaitable<{ data: T[] | null; error: unknown }>,
  runWithoutSyntheticFilter: () => Awaitable<{ data: T[] | null; error: unknown }>,
  cleaner: (rows: T[]) => T[]
) {
  const filtered = await runWithSyntheticFilter();
  if (!isMissingSyntheticColumnError(filtered.error)) {
    return { data: filtered.data ?? [], error: filtered.error, usedCompatibilityFallback: false };
  }

  const fallback = await runWithoutSyntheticFilter();
  if (fallback.error) {
    return { data: [] as T[], error: fallback.error, usedCompatibilityFallback: true };
  }

  return {
    data: cleaner(fallback.data ?? []),
    error: null,
    usedCompatibilityFallback: true,
  };
}

export async function resolveSingleWithSyntheticCompatibility<T extends Record<string, unknown>>(
  runWithSyntheticFilter: () => Awaitable<{ data: T | null; error: unknown }>,
  runWithoutSyntheticFilter: () => Awaitable<{ data: T | null; error: unknown }>,
  isSynthetic: (row: T) => boolean
) {
  const filtered = await runWithSyntheticFilter();
  if (!isMissingSyntheticColumnError(filtered.error)) {
    return { data: filtered.data, error: filtered.error, usedCompatibilityFallback: false };
  }

  const fallback = await runWithoutSyntheticFilter();
  if (fallback.error) {
    return { data: null as T | null, error: fallback.error, usedCompatibilityFallback: true };
  }

  if (!fallback.data || isSynthetic(fallback.data)) {
    return { data: null as T | null, error: null, usedCompatibilityFallback: true };
  }

  return {
    data: fallback.data,
    error: null,
    usedCompatibilityFallback: true,
  };
}

export function sanitizeServiceProductsForCompatibility(products: unknown[]) {
  return (Array.isArray(products) ? products : []).filter((product) => {
    if (!product || typeof product !== 'object') return false;
    return !looksSyntheticRecord(product as Record<string, unknown>);
  });
}
