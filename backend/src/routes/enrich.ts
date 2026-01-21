import express, { Request, Response } from 'express';
import { enrichmentQueue } from '../queues/enrichmentQueue';
import { logger } from '../services/logger';
import { authMiddleware } from '../middleware/auth';
import { jobOwnershipMiddleware } from '../middleware/jobOwnership';
import { enrichmentRateLimit } from '../middleware/rateLimiter';
import { checkDailyBudget } from '../middleware/costControl';
import { QueueEvents } from 'bullmq';
import { createRedisConnection } from '../config/redis';

const router = express.Router();

/**
 * @openapi
 * /api/v1/enrich:
 *   post:
 *     summary: Queue enrichment job
 *     description: |
 *       Queue a new bookmark enrichment job for background processing.
 *
 *       **Enrichment Steps:**
 *       1. Extract content from URL
 *       2. Generate AI summary
 *       3. Auto-generate tags
 *       4. Create vector embedding
 *       5. Extract entities and concepts
 *
 *       Returns a job ID for polling or SSE streaming.
 *     tags:
 *       - Enrichment
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
 *                 description: URL to enrich
 *                 example: https://example.com/article
 *               userTitle:
 *                 type: string
 *                 description: Optional user-provided title (overrides extracted title)
 *               userSummary:
 *                 type: string
 *                 description: Optional user-provided summary
 *               userTags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Optional user-provided tags
 *               existingTags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Existing tags to merge with auto-generated tags
 *               bookmarkId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional bookmark ID if updating existing bookmark
 *     responses:
 *       200:
 *         description: Enrichment job queued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 jobId:
 *                   type: string
 *                   description: Job ID for tracking progress
 *                   example: enrich-abc123
 *                 status:
 *                   type: string
 *                   example: queued
 *                 message:
 *                   type: string
 *                   example: Enrichment job queued successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       429:
 *         $ref: '#/components/responses/RateLimitError'
 *       500:
 *         description: Server error
 */
router.post('/', authMiddleware, enrichmentRateLimit, checkDailyBudget, async (req: Request, res: Response) => {
  const { url, userTitle, userSummary, userTags, existingTags = [], bookmarkId } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    logger.info('server', `Queueing enrichment job for: ${url}`);

    // Add job to queue (returns immediately)
    const job = await enrichmentQueue.addJob({
      url,
      userTitle,
      userSummary,
      userTags,
      existingTags,
      bookmarkId,
      userId: req.user!.id,
    });

    logger.info('server', `Job queued: ${job.id}`);

    // Return job ID for polling or SSE
    res.json({
      jobId: job.id,
      status: 'queued',
      message: 'Enrichment job queued successfully. Use polling or SSE for updates.',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('server', 'Failed to queue enrichment job', {
      error: errorMessage,
      url,
      stack: error instanceof Error ? error.stack : undefined,
    });

    res.status(500).json({
      error: errorMessage,
      message: 'Failed to queue enrichment job',
    });
  }
});

/**
 * @openapi
 * /api/v1/enrich/{jobId}:
 *   get:
 *     summary: Get job status
 *     description: Poll enrichment job status (traditional polling - prefer SSE streaming for real-time updates)
 *     tags:
 *       - Enrichment
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *         description: Job ID from queue response
 *         example: enrich-abc123
 *     responses:
 *       200:
 *         description: Job status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 jobId:
 *                   type: string
 *                 status:
 *                   type: string
 *                   enum: [waiting, active, completed, failed, delayed]
 *                   example: completed
 *                 progress:
 *                   type: number
 *                   description: Progress percentage (0-100)
 *                   example: 100
 *                 attemptsMade:
 *                   type: integer
 *                   description: Number of processing attempts
 *                 result:
 *                   type: object
 *                   description: Enrichment result (only present when status=completed)
 *                 error:
 *                   type: string
 *                   description: Error message (only present when status=failed)
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Not authorized to access this job
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Server error
 */
router.get('/:jobId', authMiddleware, jobOwnershipMiddleware, async (req: Request, res: Response) => {
  const { jobId } = req.params;

  try {
    const jobState = await enrichmentQueue.getJobState(jobId);

    if (!jobState) {
      return res.status(404).json({
        error: 'Job not found',
        message: `No job found with ID: ${jobId}`,
      });
    }

    const progress = await enrichmentQueue.getJobProgress(jobId);

    // Base response
    const response: any = {
      jobId,
      status: jobState,
      progress: progress?.progress,
      attemptsMade: progress?.attemptsMade,
    };

    // Add result if completed
    if (jobState === 'completed') {
      const result = await enrichmentQueue.getJobResult(jobId);
      response.result = result;
    }

    // Add failure reason if failed
    if (jobState === 'failed') {
      response.error = progress?.failedReason;
      response.attemptsMade = progress?.attemptsMade;
    }

    res.json(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('server', 'Failed to get job status', {
      error: errorMessage,
      jobId,
    });

    res.status(500).json({
      error: errorMessage,
      message: 'Failed to retrieve job status',
    });
  }
});

/**
 * @openapi
 * /api/v1/enrich/{jobId}/stream:
 *   get:
 *     summary: Stream job status (SSE)
 *     description: |
 *       Server-Sent Events (SSE) endpoint for real-time enrichment status updates.
 *
 *       **Advantages over polling:**
 *       - 98% fewer requests (60 polls → 1 connection)
 *       - Instant updates (no polling delay)
 *       - Lower backend load
 *
 *       **Usage:**
 *       ```javascript
 *       const eventSource = new EventSource('/enrich/job-id/stream');
 *       eventSource.onmessage = (event) => {
 *         const data = JSON.parse(event.data);
 *         if (data.status === 'completed') {
 *           // Handle result
 *           eventSource.close();
 *         }
 *       };
 *       ```
 *
 *       **Event Format:**
 *       - `{status: 'connected', jobId: string}` - Initial connection
 *       - `{status: 'completed', result: object}` - Job completed
 *       - `{status: 'failed', error: string}` - Job failed
 *       - `{status: 'timeout', error: string}` - 3-minute timeout
 *     tags:
 *       - Enrichment
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *         description: Job ID from queue response
 *         example: enrich-abc123
 *     responses:
 *       200:
 *         description: SSE stream (text/event-stream)
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *               example: |
 *                 data: {"status":"connected","jobId":"enrich-abc123"}
 *
 *                 data: {"status":"completed","result":{...}}
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Not authorized to access this job
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Server error
 */
router.get('/:jobId/stream', authMiddleware, jobOwnershipMiddleware, async (req: Request, res: Response) => {
  const { jobId } = req.params;

  try {
    // Verify job exists first
    const jobState = await enrichmentQueue.getJobState(jobId);
    if (!jobState) {
      return res.status(404).json({
        error: 'Job not found',
        message: `No job found with ID: ${jobId}`,
      });
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering

    // Send initial connection event
    res.write(`data: ${JSON.stringify({ status: 'connected', jobId })}\n\n`);

    logger.debug('enrichment', `SSE connection opened for job ${jobId}`);

    // If job already completed/failed, send result immediately and close
    if (jobState === 'completed') {
      const result = await enrichmentQueue.getJobResult(jobId);
      res.write(`data: ${JSON.stringify({
        status: 'completed',
        result,
      })}\n\n`);
      res.end();
      logger.debug('enrichment', `Job ${jobId} already completed, SSE closed`);
      return;
    }

    if (jobState === 'failed') {
      const progress = await enrichmentQueue.getJobProgress(jobId);
      res.write(`data: ${JSON.stringify({
        status: 'failed',
        error: progress?.failedReason || 'Unknown error',
      })}\n\n`);
      res.end();
      logger.debug('enrichment', `Job ${jobId} already failed, SSE closed`);
      return;
    }

    // Create QueueEvents instance to listen for job completion
    const queueEvents = new QueueEvents('enrichment', {
      connection: createRedisConnection(),
    });

    // Handler for job completion
    const completionHandler = async ({ jobId: completedJobId }: { jobId: string }) => {
      if (completedJobId === jobId) {
        logger.debug('enrichment', `Job ${jobId} completed`);

        const result = await enrichmentQueue.getJobResult(jobId);
        res.write(`data: ${JSON.stringify({
          status: 'completed',
          result,
        })}\n\n`);
        cleanup();
      }
    };

    // Handler for job failure
    const failureHandler = async ({ jobId: failedJobId, failedReason }: { jobId: string; failedReason: string }) => {
      if (failedJobId === jobId) {
        logger.debug('enrichment', `Job ${jobId} failed: ${failedReason}`);

        res.write(`data: ${JSON.stringify({
          status: 'failed',
          error: failedReason,
        })}\n\n`);
        cleanup();
      }
    };

    // Cleanup function to close connection and remove listeners
    const cleanup = () => {
      queueEvents.off('completed', completionHandler);
      queueEvents.off('failed', failureHandler);
      queueEvents.close();
      res.end();
      logger.debug('enrichment', `SSE connection closed for job ${jobId}`);
    };

    // Register event listeners
    queueEvents.on('completed', completionHandler);
    queueEvents.on('failed', failureHandler);

    // Cleanup on client disconnect
    req.on('close', () => {
      logger.debug('enrichment', `Client disconnected from SSE for job ${jobId}`);
      cleanup();
    });

    // Timeout after 3 minutes (enrichment should complete in < 30s typically)
    const timeout = setTimeout(() => {
      logger.warn('enrichment', `SSE timeout for job ${jobId}`);
      res.write(`data: ${JSON.stringify({
        status: 'timeout',
        error: 'Enrichment timed out after 3 minutes',
      })}\n\n`);
      cleanup();
    }, 180000);

    // Clear timeout if cleanup happens before timeout
    req.on('close', () => clearTimeout(timeout));

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('enrichment', 'SSE endpoint error', {
      error: errorMessage,
      jobId,
    });

    // If headers not sent yet, return JSON error
    if (!res.headersSent) {
      res.status(500).json({
        error: errorMessage,
        message: 'Failed to establish SSE connection',
      });
    } else {
      // If SSE already started, send error event and close
      res.write(`data: ${JSON.stringify({
        status: 'error',
        error: errorMessage,
      })}\n\n`);
      res.end();
    }
  }
});

export default router;
