import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ⚠️ PLACEHOLDER: Replace with JWT validation in production
export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // For development, use the first user in the database
    // In production, validate JWT token here
    const user = await prisma.user.findFirst();

    if (!user) {
      return res.status(401).json({
        error: 'No user found. Please create a user first.'
      });
    }

    req.user = {
      id: user.id,
      email: user.email,
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication error' });
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
