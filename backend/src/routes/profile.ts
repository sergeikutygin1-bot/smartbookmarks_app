import express, { Request, Response } from 'express';
import prisma from '../db/prisma';
import { authMiddleware } from '../middleware/auth';
import { passwordService } from '../services/auth/PasswordService';
import { auditService, AuditEventType } from '../services/AuditService';

const router = express.Router();

// Note: authMiddleware is applied in server.ts before this router
// No need to apply it again here

/**
 * @openapi
 * /api/v1/profile:
 *   get:
 *     summary: Get user profile
 *     description: Retrieve the authenticated user's profile information
 *     tags:
 *       - Profile
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Server error
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
 * @openapi
 * /api/v1/profile/email:
 *   patch:
 *     summary: Update user email
 *     description: Update the authenticated user's email address (immediate, no verification for MVP)
 *     tags:
 *       - Profile
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newEmail
 *             properties:
 *               newEmail:
 *                 type: string
 *                 format: email
 *                 description: New email address
 *                 example: newemail@example.com
 *     responses:
 *       200:
 *         description: Email updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Email updated successfully
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       409:
 *         description: Email already in use
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
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
 * @openapi
 * /api/v1/profile/password:
 *   patch:
 *     summary: Change password
 *     description: Change user password (requires current password verification)
 *     tags:
 *       - Profile
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *               - confirmPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 format: password
 *                 description: Current password for verification
 *                 example: OldPass123!
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 description: New password (min 8 characters, requires uppercase, lowercase, number, special char)
 *                 example: NewSecurePass123!
 *               confirmPassword:
 *                 type: string
 *                 format: password
 *                 description: Confirm new password (must match newPassword)
 *                 example: NewSecurePass123!
 *     responses:
 *       200:
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Password changed successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         description: Current password is incorrect or unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         description: Server error
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
 * @openapi
 * /api/v1/profile/analytics/summary:
 *   get:
 *     summary: Get analytics summary
 *     description: Retrieve summary statistics for user's bookmarks, entities, concepts, and relationships
 *     tags:
 *       - Profile
 *       - Analytics
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Analytics summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 bookmarks:
 *                   type: integer
 *                   description: Total number of bookmarks
 *                   example: 150
 *                 entities:
 *                   type: integer
 *                   description: Total number of entities
 *                   example: 42
 *                 concepts:
 *                   type: integer
 *                   description: Total number of concepts
 *                   example: 28
 *                 relationships:
 *                   type: integer
 *                   description: Total number of relationships
 *                   example: 312
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
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
 * @openapi
 * /api/v1/profile/analytics/bookmarks/trend:
 *   get:
 *     summary: Get bookmark creation trend
 *     description: Retrieve bookmark creation trend over a specified time period
 *     tags:
 *       - Profile
 *       - Analytics
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *           minimum: 1
 *           maximum: 365
 *         description: Number of days to look back
 *     responses:
 *       200:
 *         description: Bookmark trend data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 trend:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       date:
 *                         type: string
 *                         format: date
 *                         example: "2026-01-20"
 *                       count:
 *                         type: integer
 *                         example: 5
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
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
 * @openapi
 * /api/v1/profile/analytics/entities/top:
 *   get:
 *     summary: Get top entities
 *     description: Retrieve top entities ranked by occurrence count
 *     tags:
 *       - Profile
 *       - Analytics
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 100
 *         description: Maximum number of entities to return
 *     responses:
 *       200:
 *         description: Top entities list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 entities:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       name:
 *                         type: string
 *                         example: OpenAI
 *                       entityType:
 *                         type: string
 *                         enum: [person, company, technology, location, product]
 *                         example: company
 *                       occurrenceCount:
 *                         type: integer
 *                         example: 15
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
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
 * @openapi
 * /api/v1/profile/analytics/concepts/top:
 *   get:
 *     summary: Get top concepts
 *     description: Retrieve top concepts ranked by occurrence count
 *     tags:
 *       - Profile
 *       - Analytics
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 100
 *         description: Maximum number of concepts to return
 *     responses:
 *       200:
 *         description: Top concepts list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 concepts:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       name:
 *                         type: string
 *                         example: Machine Learning
 *                       occurrenceCount:
 *                         type: integer
 *                         example: 25
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
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
 * @openapi
 * /api/v1/profile/analytics/content-types:
 *   get:
 *     summary: Get content type distribution
 *     description: Retrieve distribution of bookmarks by content type
 *     tags:
 *       - Profile
 *       - Analytics
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Content type distribution
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 distribution:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string
 *                         enum: [article, video, social, document, other]
 *                         example: article
 *                       count:
 *                         type: integer
 *                         example: 75
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
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
 * @openapi
 * /api/v1/profile/analytics/activity/recent:
 *   get:
 *     summary: Get recent activity
 *     description: Retrieve recently created bookmarks
 *     tags:
 *       - Profile
 *       - Analytics
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 100
 *         description: Maximum number of bookmarks to return
 *     responses:
 *       200:
 *         description: Recent bookmarks list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 bookmarks:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       title:
 *                         type: string
 *                       url:
 *                         type: string
 *                         format: uri
 *                       domain:
 *                         type: string
 *                       contentType:
 *                         type: string
 *                         enum: [article, video, social, document, other]
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
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
