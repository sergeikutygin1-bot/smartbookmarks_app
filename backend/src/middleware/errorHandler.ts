import { Request, Response, NextFunction } from 'express';
import { ApiError, getErrorName, isApiError } from '../utils/errors';
import { ZodError } from 'zod';

/**
 * Global Error Handler Middleware
 *
 * Catches all errors and formats them into consistent JSON responses
 * Should be registered last in the middleware chain
 */
export function errorHandler(
  err: Error | ApiError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Handle ApiError instances
  if (isApiError(err)) {
    res.status(err.statusCode).json(err.toJSON());
    return;
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const formattedErrors = err.errors.map((error) => ({
      field: error.path.join('.'),
      message: error.message,
      code: error.code,
    }));

    res.status(400).json({
      error: 'Validation Error',
      message: 'Invalid request data',
      details: formattedErrors,
    });
    return;
  }

  // Log unexpected errors
  console.error('[Error Handler] Unexpected error:', err);
  console.error('[Error Handler] Stack:', err.stack);

  // Handle unexpected errors
  const statusCode = 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'An unexpected error occurred'
    : err.message;

  res.status(statusCode).json({
    error: getErrorName(statusCode),
    message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}

/**
 * Async Handler Wrapper
 *
 * Wraps async route handlers to catch rejected promises
 * Prevents the need for try-catch blocks in every route
 *
 * @example
 * router.get('/', asyncHandler(async (req, res) => {
 *   const data = await someAsyncOperation();
 *   res.json(data);
 * }));
 */
export function asyncHandler<T = any>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 404 Not Found Handler
 *
 * Catches requests to undefined routes
 * Should be registered after all route handlers but before error handler
 */
export function notFoundHandler(req: Request, res: Response, next: NextFunction): void {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
  });
}
