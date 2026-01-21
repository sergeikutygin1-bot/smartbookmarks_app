import { Request, Response, NextFunction } from 'express';

/**
 * API Versioning Middleware
 *
 * Adds X-API-Version header to all responses
 * Supports deprecation warnings for old API versions
 */

/**
 * Add API version header to response
 */
export function apiVersionHeader(version: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.set('X-API-Version', version);
    next();
  };
}

/**
 * Add deprecation warning headers to response
 * Used for deprecated API versions or endpoints
 *
 * @param message - Deprecation message
 * @param sunsetDate - ISO date string when the endpoint will be removed
 */
export function deprecationWarning(message: string, sunsetDate: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.set({
      'Deprecation': 'true',
      'Sunset': sunsetDate,
      'Warning': `299 - "Deprecated: ${message}"`,
    });
    next();
  };
}

/**
 * Combined middleware for versioned routes
 * Adds version header and optional deprecation warning
 */
export function versionedRoute(version: string, options?: {
  deprecated?: boolean;
  deprecationMessage?: string;
  sunsetDate?: string;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Add version header
    res.set('X-API-Version', version);

    // Add deprecation headers if specified
    if (options?.deprecated) {
      res.set({
        'Deprecation': 'true',
        'Sunset': options.sunsetDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // Default: 90 days
        'Warning': `299 - "Deprecated: ${options.deprecationMessage || 'This endpoint is deprecated. Please migrate to the latest version.'}"`,
      });
    }

    next();
  };
}
