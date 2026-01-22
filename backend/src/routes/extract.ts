/**
 * Content Extraction API Routes
 *
 * Exposes content extraction functionality for Python workers
 */

import express, { Request, Response } from 'express';
import { z } from 'zod';
import { extractContent } from '../tools/contentExtractor';
import { logger } from '../services/logger';

const router = express.Router();

// Request validation schema
const ExtractRequestSchema = z.object({
  url: z.string().url('Invalid URL format'),
  timeout: z.number().optional(),
});

/**
 * POST /api/v1/extract
 *
 * Extract content from a URL
 *
 * Request body:
 * {
 *   "url": "https://example.com/article",
 *   "timeout": 10000 (optional, default 10s)
 * }
 *
 * Response:
 * {
 *   "url": "https://example.com/article",
 *   "title": "Article Title",
 *   "domain": "example.com",
 *   "contentType": "article",
 *   "rawText": "Full text content...",
 *   "cleanText": "Cleaned text...",
 *   "extractionConfidence": 0.95,
 *   "extractedAt": "2026-01-22T01:00:00.000Z",
 *   "metadata": { ... }
 * }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validation = ExtractRequestSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: validation.error.issues,
      });
    }

    const { url, timeout } = validation.data;

    logger.info(`[ExtractAPI] Extracting content from ${url}`);

    // Extract content
    const extracted = await extractContent(url, { timeout });

    logger.info(`[ExtractAPI] Successfully extracted content from ${url} (confidence: ${extracted.extractionConfidence})`);

    return res.status(200).json(extracted);

  } catch (error: any) {
    logger.error(`[ExtractAPI] Extraction failed: ${error.message}`);

    return res.status(500).json({
      error: 'Content extraction failed',
      message: error.message,
      url: req.body.url,
    });
  }
});

export default router;
