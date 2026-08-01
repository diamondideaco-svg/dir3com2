export type MobileApiErrorCode =
  | 'network_error'
  | 'timeout'
  | 'http_error'
  | 'invalid_response'
  | 'unknown_error';

export type MobileApiError = {
  code: MobileApiErrorCode;
  message: string;
  status?: number;
};

export type MobileApiSuccess<T> = {
  ok: true;
  data: T;
};

export type MobileApiFailure = {
  ok: false;
  error: MobileApiError;
};

export type MobileApiResult<T> = MobileApiSuccess<T> | MobileApiFailure;
