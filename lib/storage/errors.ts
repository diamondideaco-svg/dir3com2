type StorageErrorLike = {
  error?: unknown;
  message?: unknown;
  name?: unknown;
  status?: unknown;
  statusCode?: unknown;
};

export function isMissingStorageObject(error: unknown) {
  if (!error) return false;

  const candidate = error as StorageErrorLike;
  const status = Number(candidate.statusCode ?? candidate.status);
  if (status === 404) return true;

  const text = [candidate.name, candidate.message, candidate.error]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();

  return /(?:object|resource|file)?\s*not[ _-]?found/.test(text);
}
