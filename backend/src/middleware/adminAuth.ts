import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Admin middleware - requires authMiddleware to run first
 * Checks if user has admin role in the database
 */
export const adminMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  // Check if user is authenticated
  if (!req.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required'
    });
  }

  try {
    // Get user from database to check role
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { role: true },
    });

    if (!user || user.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Admin access required'
      });
    }

    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to verify admin status'
    });
  }
};
