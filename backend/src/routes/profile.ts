import express, { Request, Response } from 'express';
import prisma from '../db/prisma';
import { authMiddleware } from '../middleware/auth';
import { passwordService } from '../services/auth/PasswordService';
import { auditService, AuditEventType } from '../services/AuditService';

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * GET /api/v1/profile
 * Get current user profile
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User not found',
      });
    }

    return res.status(200).json({ user });
  } catch (error) {
    console.error('Get profile error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get profile',
    });
  }
});

/**
 * PATCH /api/v1/profile/email
 * Update user email (immediate, no verification for MVP)
 */
router.patch('/email', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { newEmail } = req.body;

    // Validate required fields
    if (!newEmail) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'New email is required',
      });
    }

    // Normalize email
    const normalizedEmail = newEmail.toLowerCase().trim();

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid email format',
      });
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser && existingUser.id !== userId) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Email already in use',
      });
    }

    // Update email
    const user = await prisma.user.update({
      where: { id: userId },
      data: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Log email change
    await auditService.log({
      userId,
      email: user.email,
      eventType: AuditEventType.EMAIL_CHANGE,
      success: true,
      req,
    });

    return res.status(200).json({
      message: 'Email updated successfully',
      user,
    });
  } catch (error) {
    console.error('Update email error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update email',
    });
  }
});

/**
 * PATCH /api/v1/profile/password
 * Change user password (requires current password verification)
 */
router.patch('/password', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { currentPassword, newPassword, confirmPassword } = req.body;

    // Validate required fields
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Current password, new password, and confirm password are required',
      });
    }

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'New passwords do not match',
      });
    }

    // Validate password strength
    const validation = passwordService.validatePasswordStrength(newPassword);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Bad Request',
        message: validation.errors.join(', '),
      });
    }

    // Get user with password hash
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.passwordHash) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Cannot change password for OAuth-only accounts',
      });
    }

    // Verify current password
    const isValidPassword = await passwordService.verifyPassword(currentPassword, user.passwordHash);
    if (!isValidPassword) {
      // Log failed password change
      await auditService.log({
        userId,
        email: user.email,
        eventType: AuditEventType.PASSWORD_CHANGE,
        success: false,
        req,
        metadata: { error: 'Invalid current password' },
      });

      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Current password is incorrect',
      });
    }

    // Hash new password
    const newPasswordHash = await passwordService.hashPassword(newPassword);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });

    // Log successful password change
    await auditService.log({
      userId,
      email: user.email,
      eventType: AuditEventType.PASSWORD_CHANGE,
      success: true,
      req,
    });

    return res.status(200).json({
      message: 'Password changed successfully',
    });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to change password',
    });
  }
});

/**
 * GET /api/v1/profile/analytics/summary
 * Get summary analytics (counts of bookmarks, entities, concepts, relationships)
 */
router.get('/analytics/summary', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    // Run all counts in parallel
    const [bookmarkCount, entityCount, conceptCount, relationshipCount] = await Promise.all([
      prisma.bookmark.count({ where: { userId } }),
      prisma.entity.count({ where: { userId } }),
      prisma.concept.count({ where: { userId } }),
      prisma.relationship.count({ where: { userId } }),
    ]);

    return res.status(200).json({
      bookmarks: bookmarkCount,
      entities: entityCount,
      concepts: conceptCount,
      relationships: relationshipCount,
    });
  } catch (error) {
    console.error('Get analytics summary error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get analytics summary',
    });
  }
});

/**
 * GET /api/v1/profile/analytics/bookmarks/trend?days=30
 * Get bookmark creation trend over time
 */
router.get('/analytics/bookmarks/trend', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const days = parseInt(req.query.days as string) || 30;

    // Calculate start date
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get bookmark counts grouped by date
    const bookmarks = await prisma.bookmark.groupBy({
      by: ['createdAt'],
      where: {
        userId,
        createdAt: {
          gte: startDate,
        },
      },
      _count: {
        id: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Create a map of dates to counts
    const dateCountMap = new Map<string, number>();
    bookmarks.forEach((b) => {
      const dateKey = b.createdAt.toISOString().split('T')[0];
      dateCountMap.set(dateKey, (dateCountMap.get(dateKey) || 0) + b._count.id);
    });

    // Fill in missing dates with 0 count
    const result = [];
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (days - 1 - i));
      const dateKey = date.toISOString().split('T')[0];
      result.push({
        date: dateKey,
        count: dateCountMap.get(dateKey) || 0,
      });
    }

    return res.status(200).json({ trend: result });
  } catch (error) {
    console.error('Get bookmark trend error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get bookmark trend',
    });
  }
});

/**
 * GET /api/v1/profile/analytics/entities/top?limit=10
 * Get top entities by occurrence count
 */
router.get('/analytics/entities/top', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 10;

    const entities = await prisma.entity.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        entityType: true,
        occurrenceCount: true,
      },
      orderBy: {
        occurrenceCount: 'desc',
      },
      take: limit,
    });

    return res.status(200).json({ entities });
  } catch (error) {
    console.error('Get top entities error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get top entities',
    });
  }
});

/**
 * GET /api/v1/profile/analytics/concepts/top?limit=10
 * Get top concepts by occurrence count
 */
router.get('/analytics/concepts/top', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 10;

    const concepts = await prisma.concept.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        occurrenceCount: true,
      },
      orderBy: {
        occurrenceCount: 'desc',
      },
      take: limit,
    });

    return res.status(200).json({ concepts });
  } catch (error) {
    console.error('Get top concepts error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get top concepts',
    });
  }
});

/**
 * GET /api/v1/profile/analytics/content-types
 * Get content type distribution
 */
router.get('/analytics/content-types', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const contentTypes = await prisma.bookmark.groupBy({
      by: ['contentType'],
      where: { userId },
      _count: {
        id: true,
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
    });

    const distribution = contentTypes.map((ct) => ({
      type: ct.contentType,
      count: ct._count.id,
    }));

    return res.status(200).json({ distribution });
  } catch (error) {
    console.error('Get content types error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get content type distribution',
    });
  }
});

/**
 * GET /api/v1/profile/analytics/activity/recent?limit=10
 * Get recent bookmarks
 */
router.get('/analytics/activity/recent', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 10;

    const bookmarks = await prisma.bookmark.findMany({
      where: { userId },
      select: {
        id: true,
        title: true,
        url: true,
        domain: true,
        contentType: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    return res.status(200).json({ bookmarks });
  } catch (error) {
    console.error('Get recent activity error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get recent activity',
    });
  }
});

export default router;
