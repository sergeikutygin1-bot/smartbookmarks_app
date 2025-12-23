-- DropIndex
DROP INDEX "bookmarks_embedding_idx";

-- DropIndex
DROP INDEX "bookmarks_metadata_gin_idx";

-- DropIndex
DROP INDEX "bookmarks_search_vector_idx";

-- AlterTable
ALTER TABLE "bookmarks" ADD COLUMN     "centrality_score" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
ADD COLUMN     "cluster_id" TEXT;

-- CreateTable
CREATE TABLE "entities" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "normalized_name" VARCHAR(255) NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "occurrence_count" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concepts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "normalized_name" VARCHAR(255) NOT NULL,
    "parent_concept_id" TEXT,
    "embedding" vector(1536),
    "occurrence_count" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "concepts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clusters" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "centroid_embedding" vector(1536),
    "bookmark_count" INTEGER NOT NULL DEFAULT 0,
    "coherence_score" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clusters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relationships" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source_type" VARCHAR(20) NOT NULL,
    "source_id" TEXT NOT NULL,
    "target_type" VARCHAR(20) NOT NULL,
    "target_id" TEXT NOT NULL,
    "relationship_type" VARCHAR(50) NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "graph_insights" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "insight_type" VARCHAR(50) NOT NULL,
    "entity_ids" TEXT[],
    "concept_ids" TEXT[],
    "bookmark_ids" TEXT[],
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "confidence_score" DOUBLE PRECISION,
    "relevance_score" DOUBLE PRECISION,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "graph_insights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "entities_user_id_type_idx" ON "entities"("user_id", "entity_type");

-- CreateIndex
CREATE INDEX "entities_occurrence_idx" ON "entities"("user_id", "occurrence_count" DESC);

-- CreateIndex
CREATE INDEX "entities_normalized_name_idx" ON "entities"("normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "entities_user_id_normalized_name_entity_type_key" ON "entities"("user_id", "normalized_name", "entity_type");

-- CreateIndex
CREATE INDEX "concepts_user_id_idx" ON "concepts"("user_id");

-- CreateIndex
CREATE INDEX "concepts_parent_id_idx" ON "concepts"("parent_concept_id");

-- CreateIndex
CREATE INDEX "concepts_occurrence_idx" ON "concepts"("user_id", "occurrence_count" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "concepts_user_id_normalized_name_key" ON "concepts"("user_id", "normalized_name");

-- CreateIndex
CREATE INDEX "clusters_user_id_idx" ON "clusters"("user_id");

-- CreateIndex
CREATE INDEX "clusters_coherence_idx" ON "clusters"("user_id", "coherence_score" DESC);

-- CreateIndex
CREATE INDEX "relationships_user_source_idx" ON "relationships"("user_id", "source_type", "source_id");

-- CreateIndex
CREATE INDEX "relationships_user_target_idx" ON "relationships"("user_id", "target_type", "target_id");

-- CreateIndex
CREATE INDEX "relationships_type_idx" ON "relationships"("user_id", "relationship_type");

-- CreateIndex
CREATE INDEX "relationships_weight_idx" ON "relationships"("user_id", "relationship_type", "weight" DESC);

-- CreateIndex
CREATE INDEX "relationships_source_target_idx" ON "relationships"("user_id", "source_type", "source_id", "target_type", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "relationships_user_id_source_type_source_id_target_type_tar_key" ON "relationships"("user_id", "source_type", "source_id", "target_type", "target_id", "relationship_type");

-- CreateIndex
CREATE INDEX "graph_insights_user_type_idx" ON "graph_insights"("user_id", "insight_type");

-- CreateIndex
CREATE INDEX "graph_insights_relevance_idx" ON "graph_insights"("user_id", "relevance_score" DESC);

-- CreateIndex
CREATE INDEX "graph_insights_expires_idx" ON "graph_insights"("expires_at");

-- CreateIndex
CREATE INDEX "bookmarks_user_id_updated_at_idx" ON "bookmarks"("user_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "bookmarks_user_content_updated_idx" ON "bookmarks"("user_id", "content_type", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "bookmarks_user_status_updated_idx" ON "bookmarks"("user_id", "status", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "bookmarks_cluster_idx" ON "bookmarks"("cluster_id");

-- CreateIndex
CREATE INDEX "bookmarks_centrality_idx" ON "bookmarks"("user_id", "centrality_score" DESC);

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_cluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "clusters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entities" ADD CONSTRAINT "entities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_parent_concept_id_fkey" FOREIGN KEY ("parent_concept_id") REFERENCES "concepts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clusters" ADD CONSTRAINT "clusters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_insights" ADD CONSTRAINT "graph_insights_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
