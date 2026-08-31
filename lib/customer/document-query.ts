export type DocumentQueryError = {
  code?: string;
  message?: string;
};

export type DocumentQueryResult<T> =
  | { status: 'ready'; documents: T[] }
  | { status: 'error' };

export function resolveDocumentQuery<T>(
  data: T[] | null,
  error: DocumentQueryError | null,
): DocumentQueryResult<T> {
  if (error) {
    return { status: 'error' };
  }

  return { status: 'ready', documents: data ?? [] };
}
