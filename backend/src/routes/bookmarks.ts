import express, { Request, Response } from 'express';
import { bookmarkRepository, invalidateBookmarkCaches } from '../repositories/bookmarkRepository';
import { invalidateSearchCaches } from './search';
import { authMiddleware } from '../middleware/auth';
import { graphCache } from '../services/graphCache';
import { sanitizeUrl, sanitizeText, sanitizeHtml, sanitizeTags } from '../utils/sanitize';
import { enrichmentQueue } from '../queues/enrichmentQueue';
import { enrichmentRateLimit } from '../middleware/rateLimiter';
import { checkDailyBudget } from '../middleware/costControl';
import { logger } from '../services/logger';
import { prisma } from '../db/prisma';

const router = express.Router();

// Note: authMiddleware is applied in server.ts before this router
// No need to apply it again here

/**
 * @openapi
 * /api/v1/bookmarks:
 *   get:
 *     summary: List bookmarks
 *     description: Retrieve all bookmarks for the authenticated user with optional filtering and pagination
 *     tags:
 *       - Bookmarks
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: Pagination cursor for fetching next page
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of bookmarks to return per page
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [article, video, social, document, other]
 *         description: Filter by content type
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, processing, completed, failed]
 *         description: Filter by enrichment status
 *     responses:
 *       200:
 *         description: List of bookmarks
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Bookmark'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
 */
router.get('/', async (req: Request, res: Response) => {
  console.log('[Bookmarks GET /] Handler called, user:', req.user?.id);
  try {
    const userId = req.user!.id;
    const { cursor, limit, type, status } = req.query;

    const bookmarks = await bookmarkRepository.findByUserId(userId, {
      cursor: cursor as string,
      limit: limit ? parseInt(limit as string) : undefined,
      contentType: type as string,
      status: status as string,
    });

    res.json({ data: bookmarks });
  } catch (error) {
    console.error('[Bookmarks GET /] Error fetching bookmarks:', error);
    console.error('[Bookmarks GET /] Stack:', error instanceof Error ? error.stack : 'N/A');
    res.status(500).json({
      error: 'Failed to fetch bookmarks',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @openapi
 * /api/v1/bookmarks/{id}:
 *   get:
 *     summary: Get bookmark by ID
 *     description: Retrieve a specific bookmark by its unique identifier
 *     tags:
 *       - Bookmarks
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Unique bookmark identifier
 *     responses:
 *       200:
 *         description: Bookmark details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/Bookmark'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Server error
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const bookmark = await bookmarkRepository.findById(id, userId);

    if (!bookmark) {
      return res.status(404).json({
        error: 'Bookmark not found',
        message: `No bookmark found with ID: ${id}`
      });
    }

    res.json({ data: bookmark });
  } catch (error) {
    console.error('Error fetching bookmark:', error);
    res.status(500).json({
      error: 'Failed to fetch bookmark',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @openapi
 * /api/v1/bookmarks:
 *   post:
 *     summary: Create a new bookmark
 *     description: Create a new bookmark with optional metadata. The URL can be empty for manual entry.
 *     tags:
 *       - Bookmarks
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
 *               - url
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *                 description: Bookmark URL (can be empty string for manual entry)
 *                 example: https://example.com/article
 *               title:
 *                 type: string
 *                 maxLength: 500
 *                 description: Optional bookmark title
 *                 example: Interesting Article
 *               notes:
 *                 type: string
 *                 maxLength: 5000
 *                 description: Optional user notes (supports HTML)
 *                 example: This article discusses...
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                   maxLength: 50
 *                 maxItems: 20
 *                 description: Optional tags
 *                 example: [programming, javascript]
 *     responses:
 *       201:
 *         description: Bookmark created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/Bookmark'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         description: Server error
 */
router.post('/', async (req: Request, res: Response) => {
  console.log('📝 POST /api/bookmarks received');
  console.log('Request body:', JSON.stringify(req.body, null, 2));

  try {
    const userId = req.user!.id;
    const { url, title, notes, tags } = req.body;

    // Validate request (allow empty URL for new bookmarks)
    if (url === undefined) {
      console.log('❌ Validation failed: URL is undefined');
      return res.status(400).json({
        error: 'Invalid request',
        message: 'URL field is required (can be empty string)'
      });
    }

    // Sanitize inputs to prevent XSS
    const sanitizedData: any = {
      userId,
      url: url ? sanitizeUrl(url) : '',
      title: title ? sanitizeText(title) : undefined,
    };

    // Add optional fields if present
    if (notes) {
      sanitizedData.notes = sanitizeHtml(notes);
    }
    if (tags && Array.isArray(tags)) {
      sanitizedData.tags = sanitizeTags(tags);
    }

    console.log('✅ Creating bookmark with url:', sanitizedData.url);
    const bookmark = await bookmarkRepository.create(sanitizedData);
    console.log('✅ Bookmark created successfully:', bookmark.id);

    // Invalidate caches
    await invalidateBookmarkCaches(userId);
    await invalidateSearchCaches(userId);
    await graphCache.invalidateProjectionCache(userId);

    res.status(201).json({ data: bookmark });
  } catch (error) {
    console.error('❌ Error creating bookmark:', error);
    res.status(500).json({
      error: 'Failed to create bookmark',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @openapi
 * /api/v1/bookmarks/{id}:
 *   patch:
 *     summary: Update an existing bookmark
 *     description: Update bookmark fields. Supports partial updates (auto-save). Enrichment fields can be updated by worker processes.
 *     tags:
 *       - Bookmarks
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Unique bookmark identifier
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *                 description: Updated URL
 *               title:
 *                 type: string
 *                 maxLength: 500
 *                 description: Updated title
 *               summary:
 *                 type: string
 *                 nullable: true
 *                 description: Updated summary (nullable)
 *               tags:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                 description: Updated tags
 *               status:
 *                 type: string
 *                 enum: [pending, processing, completed, failed]
 *                 description: Enrichment status (typically set by workers)
 *               contentType:
 *                 type: string
 *                 enum: [article, video, social, document, other]
 *                 description: Content type (typically set by workers)
 *               domain:
 *                 type: string
 *                 description: Extracted domain (enrichment field)
 *               keyPoints:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Extracted key points (enrichment field)
 *               metadata:
 *                 type: object
 *                 description: Extraction metadata (enrichment field)
 *               embedding:
 *                 type: array
 *                 items:
 *                   type: number
 *                 description: Vector embedding (enrichment field)
 *     responses:
 *       200:
 *         description: Bookmark updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/Bookmark'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Server error
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const updates = req.body;

    // Don't allow updating id, createdAt, userId
    delete updates.id;
    delete updates.createdAt;
    delete updates.userId;

    // Sanitize user-input fields to prevent XSS
    const sanitizedUpdates: any = {};

    // URL is required - only update if provided and valid
    if (updates.url !== undefined) {
      const sanitizedUrl = updates.url ? sanitizeUrl(updates.url) : '';
      if (sanitizedUrl) {
        sanitizedUpdates.url = sanitizedUrl;
      }
    }

    // Title is required - only update if provided and not empty
    if (updates.title !== undefined && updates.title) {
      sanitizedUpdates.title = sanitizeText(updates.title);
    }

    // Summary is optional (nullable) - matches database schema
    if (updates.summary !== undefined) {
      sanitizedUpdates.summary = updates.summary ? sanitizeHtml(updates.summary) : null;
    }

    // Tags are optional
    if (updates.tags !== undefined && Array.isArray(updates.tags)) {
      sanitizedUpdates.tags = sanitizeTags(updates.tags);
    }

    // Pass through other allowed fields without sanitization
    // These fields are populated by enrichment workers or system processes
    const allowedFields = [
      'status',
      'contentType',
      'enrichmentStatus',
      'domain',      // Enrichment: extracted domain
      'summary',     // Enrichment: AI-generated summary
      'keyPoints',   // Enrichment: extracted key points
      'metadata',    // Enrichment: extraction metadata
      'embedding',   // Enrichment: vector embedding
    ];
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        sanitizedUpdates[field] = updates[field];
      }
    }

    const bookmark = await bookmarkRepository.update(id, userId, sanitizedUpdates);

    if (!bookmark) {
      return res.status(404).json({
        error: 'Bookmark not found',
        message: `No bookmark found with ID: ${id}`
      });
    }

    // Invalidate caches
    await invalidateBookmarkCaches(userId);
    await invalidateSearchCaches(userId);
    await graphCache.invalidateProjectionCache(userId);

    res.json({ data: bookmark });
  } catch (error) {
    console.error('Error updating bookmark:', error);
    res.status(500).json({
      error: 'Failed to update bookmark',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @openapi
 * /api/v1/bookmarks/{id}:
 *   delete:
 *     summary: Delete a bookmark
 *     description: Permanently delete a bookmark and invalidate related caches
 *     tags:
 *       - Bookmarks
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Unique bookmark identifier
 *     responses:
 *       204:
 *         description: Bookmark deleted successfully (no content)
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Server error
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const result = await bookmarkRepository.delete(id, userId);

    if (result.count === 0) {
      return res.status(404).json({
        error: 'Bookmark not found',
        message: `No bookmark found with ID: ${id}`
      });
    }

    // Invalidate caches
    await invalidateBookmarkCaches(userId);
    await invalidateSearchCaches(userId);
    await graphCache.invalidateProjectionCache(userId);

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting bookmark:', error);
    res.status(500).json({
      error: 'Failed to delete bookmark',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @openapi
 * /api/v1/bookmarks/bulk:
 *   post:
 *     summary: Create multiple bookmarks
 *     description: Bulk create bookmarks from a list of URLs
 *     tags:
 *       - Bookmarks
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               urls:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uri
 *                 minItems: 1
 *                 maxItems: 100
 *     responses:
 *       200:
 *         description: Bookmarks created successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post('/bulk', enrichmentRateLimit, checkDailyBudget, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { urls } = req.body;

    // Validation
    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'URLs must be a non-empty array'
      });
    }

    if (urls.length > 100) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Cannot import more than 100 URLs at once. For larger imports, please split into multiple batches.'
      });
    }

    // Validate URL format
    const urlRegex = /^https?:\/\/.+/i;
    const invalidUrls = urls.filter((url: string) => !urlRegex.test(url));
    if (invalidUrls.length > 0) {
      return res.status(400).json({
        error: 'Invalid URLs',
        message: `${invalidUrls.length} URLs have invalid format`,
        invalidUrls: invalidUrls.slice(0, 10)
      });
    }

    // Sanitize URLs and extract domains
    const bookmarkData = urls.map((url: string) => {
      const sanitized = sanitizeUrl(url);
      // Extract domain from URL
      let domain = '';
      try {
        const urlObj = new URL(sanitized);
        domain = urlObj.hostname;
      } catch {
        domain = 'unknown';
      }
      return {
        url: sanitized,
        domain,
        title: sanitized, // Use URL as temporary title, enrichment will update it
      };
    });

    logger.info(`[Bulk Import] Creating ${bookmarkData.length} bookmarks for user ${userId}`);

    // Create all bookmarks in transaction
    const bookmarks = await prisma.$transaction(
      bookmarkData.map((data) =>
        prisma.bookmark.create({
          data: {
            url: data.url,
            title: data.title,
            domain: data.domain,
            userId,
            status: 'pending',
            createdAt: new Date()
          }
        })
      )
    );

    logger.info(`[Bulk Import] Created ${bookmarks.length} bookmarks`);

    // Enqueue enrichment jobs
    const jobs = bookmarks.map(bookmark => ({
      bookmarkId: bookmark.id,
      userId: bookmark.userId,
      url: bookmark.url
    }));

    await enrichmentQueue.addBulk(jobs);

    logger.info(`[Bulk Import] Enqueued ${jobs.length} enrichment jobs`);

    // Invalidate caches
    await invalidateBookmarkCaches(userId);
    await invalidateSearchCaches(userId);
    await graphCache.invalidateProjectionCache(userId);

    res.json({
      created: bookmarks.length,
      bookmarks
    });
  } catch (error) {
    logger.error('[Bulk Import] Error:', error);
    res.status(500).json({
      error: 'Failed to create bookmarks',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @openapi
 * /api/v1/bookmarks/{id}/enrich:
 *   post:
 *     summary: Enrich a bookmark with AI metadata
 *     description: |
 *       Queue an enrichment job for an existing bookmark. This will:
 *       1. Extract content from the bookmark's URL
 *       2. Generate AI-powered summary
 *       3. Auto-generate relevant tags
 *       4. Create vector embedding for semantic search
 *       5. Extract entities and concepts
 *
 *       Returns a job ID for tracking enrichment progress via polling or SSE.
 *     tags:
 *       - Bookmarks
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *       - csrfToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Bookmark ID
 *     responses:
 *       200:
 *         description: Enrichment job queued successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 jobId:
 *                   type: string
 *                   description: Job ID for tracking enrichment progress
 *                 status:
 *                   type: string
 *                   enum: [queued]
 *                 message:
 *                   type: string
 *       404:
 *         description: Bookmark not found
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Server error
 */
router.post('/:id/enrich', enrichmentRateLimit, checkDailyBudget, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    // Fetch the bookmark to get its URL
    const bookmark = await bookmarkRepository.findById(id, userId);

    if (!bookmark) {
      return res.status(404).json({
        error: 'Bookmark not found',
        message: `No bookmark found with ID: ${id}`
      });
    }

    // Ensure bookmark has a URL to enrich
    if (!bookmark.url) {
      return res.status(400).json({
        error: 'Invalid bookmark',
        message: 'Bookmark has no URL to enrich'
      });
    }

    logger.info('server', `Queueing enrichment job for bookmark: ${id}`);

    // Queue enrichment job
    const job = await enrichmentQueue.addJob({
      url: bookmark.url,
      userTitle: bookmark.title || undefined,
      userSummary: bookmark.summary || undefined,
      userTags: bookmark.tags?.map((t: any) => t.tag?.name || t.name) || undefined,
      existingTags: bookmark.tags?.map((t: any) => t.tag?.name || t.name) || [],
      bookmarkId: id,
      userId,
    });

    logger.info('server', `Enrichment job queued: ${job.id} for bookmark: ${id}`);

    res.json({
      jobId: job.id,
      status: 'queued',
      message: 'Enrichment job queued successfully. Use polling or SSE for updates.',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('server', 'Failed to queue bookmark enrichment job', {
      error: errorMessage,
      bookmarkId: req.params.id,
      stack: error instanceof Error ? error.stack : undefined,
    });

    res.status(500).json({
      error: errorMessage,
      message: 'Failed to queue enrichment job',
    });
  }
});

export default router;
