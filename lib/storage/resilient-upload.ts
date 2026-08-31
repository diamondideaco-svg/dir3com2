type StorageErrorLike = {
  code?: unknown;
  error?: unknown;
  message?: unknown;
  status?: unknown;
  statusCode?: unknown;
};

type UploadAttempt = { error: unknown | null };
type ObjectExistence = { exists: boolean; error: unknown | null };

type UploadStorageObjectInput = {
  path: string;
  upload(path: string): Promise<UploadAttempt>;
  objectExists(path: string): Promise<ObjectExistence>;
  maxAttempts?: number;
  retryDelayMs?: number;
};

type UploadStorageObjectResult =
  | { ok: true; attempts: number; recoveredExistingObject: boolean }
  | { ok: false; attempts: number; error: unknown };

function numericStorageStatus(error: unknown) {
  if (!error || typeof error !== 'object') return Number.NaN;
  const candidate = error as StorageErrorLike;
  return Number(candidate.statusCode ?? candidate.status ?? candidate.code);
}

export function isTransientStorageError(error: unknown) {
  const status = numericStorageStatus(error);
  if (status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599)) {
    return true;
  }

  if (!error || typeof error !== 'object') return false;
  const candidate = error as StorageErrorLike;
  const text = [candidate.code, candidate.error, candidate.message]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();

  return /(?:cloudflare|eai_again|econnreset|etimedout|fetch failed|network error|temporar(?:y|ily) unavailable|timed?\s*out)/.test(text);
}

function wait(milliseconds: number) {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export async function uploadStorageObjectWithRecovery(
  input: UploadStorageObjectInput,
): Promise<UploadStorageObjectResult> {
  const maxAttempts = Math.min(Math.max(Math.trunc(input.maxAttempts ?? 3), 1), 3);
  const retryDelayMs = Math.min(Math.max(Math.trunc(input.retryDelayMs ?? 100), 0), 1_000);
  let lastError: unknown = new Error('STORAGE_UPLOAD_NOT_ATTEMPTED');

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const upload = await input.upload(input.path);
    if (!upload.error) {
      return { ok: true, attempts: attempt, recoveredExistingObject: false };
    }

    lastError = upload.error;
    const existence = await input.objectExists(input.path);
    if (!existence.error && existence.exists) {
      return { ok: true, attempts: attempt, recoveredExistingObject: true };
    }

    if (!isTransientStorageError(upload.error) || attempt === maxAttempts) {
      return { ok: false, attempts: attempt, error: upload.error };
    }

    await wait(retryDelayMs * attempt);
  }

  return { ok: false, attempts: maxAttempts, error: lastError };
}
