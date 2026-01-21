import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';

/**
 * Validation Middleware using Zod schemas
 *
 * Validates request params, query, and body against Zod schemas
 * Returns 400 Bad Request with detailed error messages on validation failure
 */

/**
 * Validate request against a Zod schema
 *
 * @param schema - Zod schema to validate against
 * @returns Express middleware function
 *
 * @example
 * router.post('/', validate(createBookmarkSchema), async (req, res) => {
 *   // req.body is now validated and typed
 * });
 */
export function validate(schema: z.ZodSchema) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request data
      const validated = await schema.parseAsync({
        params: req.params,
        query: req.query,
        body: req.body,
      });

      // Replace request data with validated data (coerced types, defaults applied)
      req.params = validated.params || req.params;
      req.query = validated.query || req.query;
      req.body = validated.body || req.body;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Format Zod errors into user-friendly response
        const formattedErrors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));

        return res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid request data',
          details: formattedErrors,
        });
      }

      // Pass non-Zod errors to error handler
      next(error);
    }
  };
}

/**
 * Validate only request body (shorthand for common case)
 *
 * @param bodySchema - Zod schema for request body
 * @returns Express middleware function
 *
 * @example
 * router.post('/', validateBody(z.object({ email: z.string().email() })), (req, res) => {
 *   // req.body.email is validated
 * });
 */
export function validateBody(bodySchema: z.ZodSchema) {
  return validate(z.object({ body: bodySchema }));
}

/**
 * Validate only query parameters (shorthand for common case)
 *
 * @param querySchema - Zod schema for query parameters
 * @returns Express middleware function
 */
export function validateQuery(querySchema: z.ZodSchema) {
  return validate(z.object({ query: querySchema }));
}

/**
 * Validate only route parameters (shorthand for common case)
 *
 * @param paramsSchema - Zod schema for route parameters
 * @returns Express middleware function
 */
export function validateParams(paramsSchema: z.ZodSchema) {
  return validate(z.object({ params: paramsSchema }));
}
