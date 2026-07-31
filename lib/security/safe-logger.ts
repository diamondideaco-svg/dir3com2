type MaybeErrorWithCode = {
  message?: unknown;
  code?: unknown;
  status?: unknown;
  statusCode?: unknown;
};

function sanitizeMessage(input: string): string {
  return input
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[redacted-phone]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted-token]')
    .replace(/\b(authorization|api[_-]?key|token|secret|password|service[_-]?role[_-]?key)\b\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .trim()
    .slice(0, 240);
}

function extractCode(error: MaybeErrorWithCode): string | undefined {
  const rawCode = error.code ?? error.status ?? error.statusCode;
  if (typeof rawCode === 'string' || typeof rawCode === 'number') {
    return String(rawCode);
  }
  return undefined;
}

export function getSafeErrorDetails(error: unknown): { code?: string; message?: string } {
  if (!error || typeof error !== 'object') {
    if (typeof error === 'string') {
      return { message: sanitizeMessage(error) || 'internal_error' };
    }
    return { message: 'internal_error' };
  }

  const typed = error as MaybeErrorWithCode;
  const message = typeof typed.message === 'string' ? sanitizeMessage(typed.message) : 'internal_error';
  const code = extractCode(typed);

  return {
    ...(code ? { code } : {}),
    message,
  };
}

export function logServerError(event: string, error: unknown): void {
  console.error(event, getSafeErrorDetails(error));
}

export function logServerEvent(event: string): void {
  console.info(event);
}