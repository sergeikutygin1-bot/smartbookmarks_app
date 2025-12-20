-- DropIndex
DROP INDEX "bookmarks_embedding_idx";

-- DropIndex
DROP INDEX "bookmarks_metadata_gin_idx";

-- DropIndex
DROP INDEX "bookmarks_search_vector_idx";

-- CreateIndex
CREATE INDEX "bookmark_tags_tag_id_idx" ON "bookmark_tags"("tag_id");

-- CreateIndex
CREATE INDEX "bookmark_tags_bookmark_id_idx" ON "bookmark_tags"("bookmark_id");
