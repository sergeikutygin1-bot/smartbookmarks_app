import express, { Request, Response } from 'express';
import { bookmarkRepository, invalidateBookmarkCaches } from '../repositories/bookmarkRepository';
import { invalidateSearchCaches } from './search';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

/**
 * GET /api/bookmarks
 * List bookmarks with optional filtering
 */
router.get('/', async (req: Request, res: Response) => {
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
    console.error('Error fetching bookmarks:', error);
    res.status(500).json({
      error: 'Failed to fetch bookmarks',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/bookmarks/:id
 * Get a specific bookmark by ID
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
 * POST /api/bookmarks
 * Create a new bookmark
 */
router.post('/', async (req: Request, res: Response) => {
  console.log('📝 POST /api/bookmarks received');
  console.log('Request body:', JSON.stringify(req.body, null, 2));

  try {
    const userId = req.user!.id;
    const { url, title } = req.body;

    // Validate request (allow empty URL for new bookmarks)
    if (url === undefined) {
      console.log('❌ Validation failed: URL is undefined');
      return res.status(400).json({
        error: 'Invalid request',
        message: 'URL field is required (can be empty string)'
      });
    }

    console.log('✅ Creating bookmark with url:', url);
    const bookmark = await bookmarkRepository.create({
      userId,
      url,
      title,
    });
    console.log('✅ Bookmark created successfully:', bookmark.id);

    // Invalidate caches
    await invalidateBookmarkCaches(userId);
    await invalidateSearchCaches(userId);

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
 * PATCH /api/bookmarks/:id
 * Update an existing bookmark (AUTO-SAVE)
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

    const bookmark = await bookmarkRepository.update(id, userId, updates);

    if (!bookmark) {
      return res.status(404).json({
        error: 'Bookmark not found',
        message: `No bookmark found with ID: ${id}`
      });
    }

    // Invalidate caches
    await invalidateBookmarkCaches(userId);
    await invalidateSearchCaches(userId);

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
 * DELETE /api/bookmarks/:id
 * Delete a bookmark
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

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting bookmark:', error);
    res.status(500).json({
      error: 'Failed to delete bookmark',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
