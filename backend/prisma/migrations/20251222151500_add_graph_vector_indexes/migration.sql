-- Add HNSW indexes for vector similarity search (high performance)
-- HNSW (Hierarchical Navigable Small World) is optimized for approximate nearest neighbor search

-- Concepts embedding index (for semantic concept similarity)
CREATE INDEX IF NOT EXISTS concepts_embedding_idx ON concepts
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Clusters centroid embedding index (for cluster similarity)
CREATE INDEX IF NOT EXISTS clusters_centroid_embedding_idx ON clusters
USING hnsw (centroid_embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Re-add bookmarks embedding index with HNSW (for bookmark similarity)
CREATE INDEX IF NOT EXISTS bookmarks_embedding_idx ON bookmarks
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- GIN index for metadata JSONB searches
CREATE INDEX IF NOT EXISTS entities_metadata_gin_idx ON entities USING GIN (metadata jsonb_path_ops);
