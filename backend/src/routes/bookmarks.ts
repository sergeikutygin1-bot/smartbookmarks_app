import express, { Request, Response } from 'express';
import * as bookmarkStorage from '../services/bookmarkStorage';

const router = express.Router();

/**
 * GET /api/bookmarks
 * List bookmarks with optional filtering
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { q, type, source, dateFrom, dateTo } = req.query;

    const filters = {
      query: q as string | undefined,
      type: type as string | undefined,
      source: source as string | undefined,
      dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
      dateTo: dateTo ? new Date(dateTo as string) : undefined,
    };

    const bookmarks = await bookmarkStorage.getBookmarks(filters);

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
    const { id } = req.params;
    const bookmark = await bookmarkStorage.getBookmarkById(id);

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
  try {
    const { url, title } = req.body;

    // Validate request (allow empty URL for new bookmarks)
    if (url === undefined) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'URL field is required (can be empty string)'
      });
    }

    const bookmark = await bookmarkStorage.createBookmark({ url, title });

    res.status(201).json({ data: bookmark });
  } catch (error) {
    console.error('Error creating bookmark:', error);
    res.status(500).json({
      error: 'Failed to create bookmark',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * PATCH /api/bookmarks/:id
 * Update an existing bookmark
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Don't allow updating id, createdAt
    delete updates.id;
    delete updates.createdAt;

    const bookmark = await bookmarkStorage.updateBookmark(id, updates);

    if (!bookmark) {
      return res.status(404).json({
        error: 'Bookmark not found',
        message: `No bookmark found with ID: ${id}`
      });
    }

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
    const { id } = req.params;
    const success = await bookmarkStorage.deleteBookmark(id);

    if (!success) {
      return res.status(404).json({
        error: 'Bookmark not found',
        message: `No bookmark found with ID: ${id}`
      });
    }

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
