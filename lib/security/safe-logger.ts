type MaybeErrorWithCode = {
  message?: unknown;
  code?: unknown;
  status?: unknown;
  statusCode?: unknown;
};

function isSensitiveKey(key: string) {
  return /(authorization|api[_-]?key|token|secret|password|service[_-]?role[_-]?key|cookie|set-cookie)/i.test(key);
}

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

function sanitizeMetadataValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return sanitizeMessage(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeMetadataValue(item));
  }

  if (typeof value === 'object') {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(input)) {
      if (isSensitiveKey(key)) {
        output[key] = '[redacted]';
        continue;
      }
      output[key] = sanitizeMetadataValue(raw);
    }
    return output;
  }

  return String(value);
}

export function logServerError(event: string, error: unknown, metadata?: Record<string, unknown>): void {
  console.error(event, {
    ...getSafeErrorDetails(error),
    ...(metadata ? { metadata: sanitizeMetadataValue(metadata) } : {}),
  });
}

export function logServerEvent(event: string, metadata?: Record<string, unknown>): void {
  if (!metadata) {
    console.info(event);
    return;
  }

  console.info(event, {
    metadata: sanitizeMetadataValue(metadata),
  });
}