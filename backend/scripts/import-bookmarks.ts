import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = 'admin@smartbookmarks.app';

  // Get admin user
  const adminUser = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!adminUser) {
    throw new Error('Admin user not found. Please run create-admin-and-import.ts first.');
  }

  console.log(`Importing bookmarks for admin user: ${adminUser.email} (${adminUser.id})`);

  // Read exported data
  const bookmarksRaw = fs.readFileSync('/tmp/bookmarks_export.json', 'utf-8').trim();
  const tagsRaw = fs.readFileSync('/tmp/tags_export.json', 'utf-8').trim();
  const bookmarkTagsRaw = fs.readFileSync('/tmp/bookmark_tags_export.json', 'utf-8').trim();
  const entitiesRaw = fs.readFileSync('/tmp/entities_export.json', 'utf-8').trim();
  const conceptsRaw = fs.readFileSync('/tmp/concepts_export.json', 'utf-8').trim();
  const relationshipsRaw = fs.readFileSync('/tmp/relationships_export.json', 'utf-8').trim();

  const bookmarks = JSON.parse(bookmarksRaw);
  const tags = tagsRaw === 'null' ? [] : JSON.parse(tagsRaw);
  const bookmarkTags = bookmarkTagsRaw === 'null' ? [] : JSON.parse(bookmarkTagsRaw);
  const entities = entitiesRaw === 'null' ? [] : JSON.parse(entitiesRaw);
  const concepts = conceptsRaw === 'null' ? [] : JSON.parse(conceptsRaw);
  const relationships = relationshipsRaw === 'null' ? [] : JSON.parse(relationshipsRaw);

  console.log(`Found ${bookmarks.length} bookmarks to import`);
  console.log(`Found ${tags.length} tags to import`);
  console.log(`Found ${entities.length} entities to import`);
  console.log(`Found ${concepts.length} concepts to import`);
  console.log(`Found ${relationships.length} relationships to import`);

  // Import tags first (with updated user_id)
  console.log('\nImporting tags...');
  for (const tag of tags) {
    await prisma.$executeRawUnsafe(`
      INSERT INTO tags (id, user_id, name, normalized_name, color, created_at)
      VALUES ($1, $2, $3, $4, $5, $6::timestamp)
      ON CONFLICT (id) DO NOTHING
    `, tag.id, adminUser.id, tag.name, tag.normalized_name, tag.color, tag.created_at);
  }
  console.log(`✓ Imported ${tags.length} tags`);

  // Import bookmarks (with updated user_id)
  console.log('\nImporting bookmarks...');
  for (const bookmark of bookmarks) {
    // Handle embedding and search_vector which are special types
    await prisma.$executeRawUnsafe(`
      INSERT INTO bookmarks (
        id, user_id, url, title, domain, source, summary, key_points,
        content_type, status, metadata, embedding, search_vector,
        centrality_score, graph_x, graph_y, graph_positioned_at,
        created_at, updated_at, processed_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8::text[],
        $9, $10, $11::jsonb, $12::vector, $13::tsvector,
        $14, $15, $16, $17::timestamp,
        $18::timestamp, $19::timestamp, $20::timestamp
      )
      ON CONFLICT (id) DO NOTHING
    `,
      bookmark.id,
      adminUser.id,
      bookmark.url,
      bookmark.title,
      bookmark.domain,
      bookmark.source,
      bookmark.summary,
      bookmark.key_points,
      bookmark.content_type,
      bookmark.status,
      bookmark.metadata,
      bookmark.embedding,
      bookmark.search_vector,
      bookmark.centrality_score || 0,
      bookmark.graph_x,
      bookmark.graph_y,
      bookmark.graph_positioned_at,
      bookmark.created_at,
      bookmark.updated_at,
      bookmark.processed_at
    );
  }
  console.log(`✓ Imported ${bookmarks.length} bookmarks`);

  // Import bookmark-tag relationships
  console.log('\nImporting bookmark-tag relationships...');
  for (const bt of bookmarkTags) {
    await prisma.$executeRawUnsafe(`
      INSERT INTO bookmark_tags (bookmark_id, tag_id, auto_generated)
      VALUES ($1, $2, $3)
      ON CONFLICT DO NOTHING
    `, bt.bookmark_id, bt.tag_id, bt.auto_generated);
  }
  console.log(`✓ Imported ${bookmarkTags.length} bookmark-tag relationships`);

  // Import entities (with updated user_id)
  console.log('\nImporting entities...');
  for (const entity of entities) {
    await prisma.$executeRawUnsafe(`
      INSERT INTO entities (
        id, user_id, name, normalized_name, entity_type,
        occurrence_count, metadata, first_seen_at, last_seen_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::timestamp, $9::timestamp)
      ON CONFLICT (id) DO NOTHING
    `,
      entity.id,
      adminUser.id,
      entity.name,
      entity.normalized_name,
      entity.entity_type,
      entity.occurrence_count,
      entity.metadata,
      entity.first_seen_at,
      entity.last_seen_at
    );
  }
  console.log(`✓ Imported ${entities.length} entities`);

  // Import concepts (with updated user_id)
  // Need to insert in two passes due to self-referencing foreign key
  console.log('\nImporting concepts (pass 1 - without parent)...');
  for (const concept of concepts) {
    await prisma.$executeRawUnsafe(`
      INSERT INTO concepts (
        id, user_id, name, normalized_name, parent_concept_id,
        occurrence_count, embedding, created_at
      )
      VALUES ($1, $2, $3, $4, NULL, $5, $6::vector, COALESCE($7::timestamp, CURRENT_TIMESTAMP))
      ON CONFLICT (id) DO NOTHING
    `,
      concept.id,
      adminUser.id,
      concept.name,
      concept.normalized_name,
      concept.occurrence_count,
      concept.embedding,
      concept.first_seen_at
    );
  }
  console.log(`✓ Inserted ${concepts.length} concepts`);

  // Pass 2: Update parent relationships
  console.log('\nImporting concepts (pass 2 - adding parents)...');
  let updatedCount = 0;
  for (const concept of concepts) {
    if (concept.parent_concept_id) {
      await prisma.$executeRawUnsafe(`
        UPDATE concepts
        SET parent_concept_id = $1
        WHERE id = $2
      `,
        concept.parent_concept_id,
        concept.id
      );
      updatedCount++;
    }
  }
  console.log(`✓ Updated ${updatedCount} concept parent relationships`);

  // Import relationships (with updated user_id)
  console.log('\nImporting relationships...');
  for (const rel of relationships) {
    await prisma.$executeRawUnsafe(`
      INSERT INTO relationships (
        id, user_id, source_type, source_id, target_type, target_id,
        relationship_type, weight, metadata, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::timestamp)
      ON CONFLICT (id) DO NOTHING
    `,
      rel.id,
      adminUser.id,
      rel.source_type,
      rel.source_id,
      rel.target_type,
      rel.target_id,
      rel.relationship_type,
      rel.weight,
      rel.metadata,
      rel.created_at
    );
  }
  console.log(`✓ Imported ${relationships.length} relationships`);

  console.log('\n✓ All data imported successfully!');
  console.log(`\nTotal imported for ${adminUser.email}:`);
  console.log(`  - ${bookmarks.length} bookmarks`);
  console.log(`  - ${tags.length} tags`);
  console.log(`  - ${entities.length} entities`);
  console.log(`  - ${concepts.length} concepts`);
  console.log(`  - ${relationships.length} relationships`);
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
