import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const errors: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  const validation = err instanceof ZodError;
  const malformed = err instanceof SyntaxError && 'body' in err;
  const tooLarge =
    typeof err === 'object' && err !== null && 'type' in err && err.type === 'entity.too.large';
  const status =
    err instanceof ApiError
      ? err.status
      : validation
        ? 422
        : malformed
          ? 400
          : tooLarge
            ? 413
            : 500;
  res.status(status).json({
    code:
      err instanceof ApiError
        ? err.code
        : validation
          ? 'VALIDATION_ERROR'
          : malformed
            ? 'INVALID_JSON'
            : tooLarge
              ? 'BODY_TOO_LARGE'
              : 'INTERNAL_ERROR',
    message:
      err instanceof ApiError
        ? err.message
        : validation
          ? 'Check the submitted fields.'
          : malformed
            ? 'Request body must be valid JSON.'
            : tooLarge
              ? 'Request body exceeds 16 KB.'
              : 'The request could not be completed.',
    ...(validation ? { details: err.flatten() } : {}),
    requestId: res.locals.requestId,
  });
};
