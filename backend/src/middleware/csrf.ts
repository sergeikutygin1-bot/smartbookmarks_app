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
    console.log(`[CSRF] ${req.method} ${req.path} - Starting verification`);

    // Skip CSRF for Bearer token authentication (API clients)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      console.log('[CSRF] Skipping - Bearer token detected');
      return next();
    }

    // Skip CSRF for safe HTTP methods
    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
    if (safeMethods.includes(req.method)) {
      console.log(`[CSRF] Skipping - Safe method: ${req.method}`);
      return next();
    }

    // Require authentication for CSRF-protected routes
    if (!req.user?.id) {
      console.log('[CSRF] ❌ Unauthorized - No user ID');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    console.log(`[CSRF] Checking token for user: ${req.user.id}`);

    // Get CSRF token from header
    const token = req.headers['x-csrf-token'] as string;
    if (!token) {
      console.log('[CSRF] ❌ Token missing from headers');
      res.status(403).json({
        error: 'CSRF token missing',
        message: 'Include X-CSRF-Token header in your request',
      });
      return;
    }

    console.log('[CSRF] Token present in headers');

    // Get secret for this user
    const secret = secretStore.get(req.user.id);
    if (!secret) {
      console.log('[CSRF] ❌ No secret found for user');
      res.status(403).json({
        error: 'No CSRF secret found',
        message: 'Fetch a CSRF token first from /api/v1/auth/csrf-token',
      });
      return;
    }

    console.log('[CSRF] Secret found, verifying token...');

    // Verify token
    const valid = tokens.verify(secret, token);
    if (!valid) {
      console.log('[CSRF] ❌ Token verification failed');
      res.status(403).json({
        error: 'Invalid CSRF token',
        message: 'CSRF token verification failed',
      });
      return;
    }

    console.log('[CSRF] ✅ Token verified successfully');
    // Token is valid, proceed
    next();
  } catch (error) {
    console.error('[CSRF] Error:', error);
    next(error);
  }
}

/**
 * Clear CSRF secret for a user (call on logout)
 */
export function clearCsrfSecret(userId: string): void {
  secretStore.delete(userId);
}
