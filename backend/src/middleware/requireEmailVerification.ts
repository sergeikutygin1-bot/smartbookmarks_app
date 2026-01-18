import { Request, Response, NextFunction } from 'express';
import prisma from '../db/prisma';

/**
 * Middleware to require email verification
 * Users have a 30-day grace period to verify their email
 */
export const requireEmailVerification = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { emailVerified: true, createdAt: true },
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Grace period: 30 days to verify email
  const gracePeriodDays = 30;
  const accountAge = Date.now() - user.createdAt.getTime();
  const gracePeriodMs = gracePeriodDays * 24 * 60 * 60 * 1000;

  if (!user.emailVerified && accountAge > gracePeriodMs) {
    return res.status(403).json({
      error: 'Email verification required',
      message: 'Please verify your email to continue using Smart Bookmarks',
    });
  }

  next();
};
