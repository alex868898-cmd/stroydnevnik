export enum ProviderErrorCategory {
  AUTH_ERROR = 'AuthError',
  RATE_LIMIT_ERROR = 'RateLimitError',
  VALIDATION_ERROR = 'ValidationError',
  TRANSIENT_ERROR = 'TransientError',
  UNSUPPORTED_OPERATION_ERROR = 'UnsupportedOperationError',
}

export class ProviderError extends Error {
  constructor(
    readonly category: ProviderErrorCategory,
    message: string,
    readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'ProviderError';
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ProviderError);
    }
  }
}
