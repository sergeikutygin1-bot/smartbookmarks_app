-- CreateIndex
CREATE INDEX IF NOT EXISTS "bookmark_tags_tag_id_idx" ON "bookmark_tags"("tag_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "bookmark_tags_bookmark_id_idx" ON "bookmark_tags"("bookmark_id");
