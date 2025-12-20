-- Partial GIN index for full-text search on completed bookmarks only
-- This reduces index size and improves write performance since most searches target completed bookmarks
CREATE INDEX IF NOT EXISTS bookmarks_completed_search_idx
  ON bookmarks USING GIN (search_vector)
  WHERE status = 'completed';

-- Note: We keep the existing bookmarks_search_vector_idx for queries that don't filter by status
-- The query planner will choose the most efficient index based on the WHERE clause
