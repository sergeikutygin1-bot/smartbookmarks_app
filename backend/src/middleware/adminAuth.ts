import { Request, Response, NextFunction } from 'express';

/**
 * Admin middleware - requires authMiddleware to run first
 * Checks if user ID is in the ADMIN_USER_IDS whitelist
 */
export const adminMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Get admin user IDs from environment
  const adminUserIds = (process.env.ADMIN_USER_IDS || '').split(',').filter(Boolean);

  // Check if user is authenticated
  if (!req.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required'
    });
  }

  // Check if user is admin
  if (!adminUserIds.includes(req.user.id)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Admin access required'
    });
  }

  next();
};
