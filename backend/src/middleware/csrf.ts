import { Request, Response, NextFunction } from 'express';
import Tokens from 'csrf';

// Initialize CSRF token generator
const tokens = new Tokens();

// In-memory store for CSRF secrets (in production, use Redis or session store)
// Map<userId, secret>
const secretStore = new Map<string, string>();

/**
 * Generate a CSRF token for a user session
 * This should be called when user logs in or starts a session
 */
export function generateCsrfToken(userId: string): string {
  // Generate a new secret for this user if one doesn't exist
  if (!secretStore.has(userId)) {
    const secret = tokens.secretSync();
    secretStore.set(userId, secret);
  }

  const secret = secretStore.get(userId)!;
  return tokens.create(secret);
}

/**
 * Get CSRF token endpoint
 * Returns a CSRF token for the authenticated user
 */
export async function getCsrfToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const token = generateCsrfToken(req.user.id);
    res.json({ csrfToken: token });
  } catch (error) {
    next(error);
  }
}

/**
 * Verify CSRF token middleware
 *
 * This middleware:
 * 1. Skips verification for Bearer token API calls (stateless)
 * 2. Skips verification for safe HTTP methods (GET, HEAD, OPTIONS)
 * 3. Verifies CSRF token for state-changing operations with session auth
 */
export async function verifyCsrfToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Skip CSRF for Bearer token authentication (API clients)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return next();
    }

    // Skip CSRF for safe HTTP methods
    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
    if (safeMethods.includes(req.method)) {
      return next();
    }

    // Require authentication for CSRF-protected routes
    if (!req.user?.id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Get CSRF token from header
    const token = req.headers['x-csrf-token'] as string;
    if (!token) {
      res.status(403).json({
        error: 'CSRF token missing',
        message: 'Include X-CSRF-Token header in your request',
      });
      return;
    }

    // Get secret for this user
    const secret = secretStore.get(req.user.id);
    if (!secret) {
      res.status(403).json({
        error: 'No CSRF secret found',
        message: 'Fetch a CSRF token first from /api/v1/auth/csrf-token',
      });
      return;
    }

    // Verify token
    const valid = tokens.verify(secret, token);
    if (!valid) {
      res.status(403).json({
        error: 'Invalid CSRF token',
        message: 'CSRF token verification failed',
      });
      return;
    }

    // Token is valid, proceed
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Clear CSRF secret for a user (call on logout)
 */
export function clearCsrfSecret(userId: string): void {
  secretStore.delete(userId);
}
