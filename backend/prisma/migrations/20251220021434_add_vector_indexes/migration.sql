-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Full-text search index (GIN)
CREATE INDEX IF NOT EXISTS bookmarks_search_vector_idx
ON bookmarks USING GIN (search_vector);

-- Vector similarity index (HNSW) - OPTIMIZED PARAMETERS
CREATE INDEX IF NOT EXISTS bookmarks_embedding_idx
ON bookmarks USING hnsw (embedding vector_cosine_ops);

-- Partial index for completed bookmarks (most searches target these)
CREATE INDEX IF NOT EXISTS bookmarks_completed_embedding_idx
ON bookmarks USING hnsw (embedding vector_cosine_ops)
WHERE status = 'completed';

-- JSONB metadata index (for flexible queries)
CREATE INDEX IF NOT EXISTS bookmarks_metadata_gin_idx
ON bookmarks USING GIN (metadata jsonb_path_ops);

-- Auto-update search_vector trigger
CREATE OR REPLACE FUNCTION bookmarks_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.summary, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.domain, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bookmarks_search_vector_trigger
BEFORE INSERT OR UPDATE ON bookmarks
FOR EACH ROW EXECUTE FUNCTION bookmarks_search_vector_update();

-- Set runtime HNSW search quality (balance speed vs recall)
ALTER DATABASE smartbookmarks SET hnsw.ef_search = 40;
