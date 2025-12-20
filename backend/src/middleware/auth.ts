import { Request, Response, NextFunction } from 'express';

// ⚠️ PLACEHOLDER: Replace with JWT validation in production
export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // For development, use a mock user
  // In production, validate JWT token here
  req.user = {
    id: 'dev-user-id-12345',
    email: 'dev@example.com',
  };

  next();
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
