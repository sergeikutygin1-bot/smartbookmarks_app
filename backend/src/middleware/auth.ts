import { Request, Response, NextFunction } from 'express';
import { tokenService } from '../services/auth/TokenService';

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let token: string | undefined;

    // Try cookies first (new method)
    if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    }
    // Fallback to Authorization header (old method for backward compatibility)
    else if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.substring(7);
    }

    if (!token) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing authentication token'
      });
    }

    // Verify JWT
    const decoded = tokenService.verifyAccessToken(token);

    if (!decoded) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token'
      });
    }

    // Attach user to request
    req.user = {
      id: decoded.userId,
      email: decoded.email,
    };

    console.log('[Auth Middleware] Authenticated user:', {
      userId: decoded.userId,
      email: decoded.email,
    });

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      error: 'Authentication error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
      };
    }
  }
}
