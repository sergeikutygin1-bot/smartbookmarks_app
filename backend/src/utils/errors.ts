/**
 * Custom Error Classes for Smart Bookmarks API
 *
 * Provides consistent error handling across the application
 * All errors extend ApiError with HTTP status codes
 */

/**
 * Base API Error class
 * All custom errors should extend this class
 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: getErrorName(this.statusCode),
      message: this.message,
      ...(this.details && { details: this.details }),
    };
  }
}

/**
 * 400 Bad Request
 * Used for invalid request data (validation errors, malformed input)
 */
export class BadRequestError extends ApiError {
  constructor(message: string, details?: any) {
    super(400, message, details);
  }
}

/**
 * 401 Unauthorized
 * Used for authentication failures (missing or invalid credentials)
 */
export class UnauthorizedError extends ApiError {
  constructor(message: string = 'Authentication required') {
    super(401, message);
  }
}

/**
 * 403 Forbidden
 * Used for authorization failures (authenticated but not allowed)
 */
export class ForbiddenError extends ApiError {
  constructor(message: string = 'Access denied') {
    super(403, message);
  }
}

/**
 * 404 Not Found
 * Used when a requested resource doesn't exist
 */
export class NotFoundError extends ApiError {
  constructor(resource: string = 'Resource') {
    super(404, `${resource} not found`);
  }
}

/**
 * 409 Conflict
 * Used for conflicts (duplicate email, concurrent modification)
 */
export class ConflictError extends ApiError {
  constructor(message: string) {
    super(409, message);
  }
}

/**
 * 422 Unprocessable Entity
 * Used for semantic validation errors (valid format but invalid business logic)
 */
export class UnprocessableEntityError extends ApiError {
  constructor(message: string, details?: any) {
    super(422, message, details);
  }
}

/**
 * 429 Too Many Requests
 * Used for rate limiting violations
 */
export class TooManyRequestsError extends ApiError {
  constructor(message: string = 'Too many requests', public retryAfter?: number) {
    super(429, message);
  }

  toJSON() {
    const json = super.toJSON();
    if (this.retryAfter) {
      return { ...json, retryAfter: this.retryAfter };
    }
    return json;
  }
}

/**
 * 500 Internal Server Error
 * Used for unexpected server errors
 */
export class InternalServerError extends ApiError {
  constructor(message: string = 'Internal server error') {
    super(500, message);
  }
}

/**
 * 503 Service Unavailable
 * Used when a service dependency is unavailable
 */
export class ServiceUnavailableError extends ApiError {
  constructor(message: string = 'Service temporarily unavailable') {
    super(503, message);
  }
}

/**
 * Get error name from HTTP status code
 */
export function getErrorName(statusCode: number): string {
  const errorNames: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    503: 'Service Unavailable',
  };

  return errorNames[statusCode] || 'Unknown Error';
}

/**
 * Type guard to check if error is an ApiError
 */
export function isApiError(error: any): error is ApiError {
  return error instanceof ApiError;
}
