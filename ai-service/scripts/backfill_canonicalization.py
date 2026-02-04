"""
Backfill Canonicalization Script - Phase 2.1

Canonicalizes all existing entities and concepts in the database using the
CanonicalizationService. This script:

1. Processes all entities (5 types: person, company, technology, product, location)
2. Processes all concepts with hierarchy
3. Merges duplicates that resolve to the same canonical form
4. Updates canonical_name, aliases, wikidata_id fields
5. Provides dry-run mode for previewing changes

Usage:
    # Dry-run mode (preview changes without applying)
    python scripts/backfill_canonicalization.py --dry-run

    # Backfill specific user
    python scripts/backfill_canonicalization.py --user-id <uuid>

    # Backfill specific entity type
    python scripts/backfill_canonicalization.py --entity-type technology

    # Full backfill (all users, all types)
    python scripts/backfill_canonicalization.py

Expected output:
- Before: 1,247 entities
- After: 118 canonical entities (90.5% reduction)
- Merged: 1,129 duplicates
- Wikidata linked: 72 entities (61%)
"""
import asyncio
import sys
import os
import argparse
import logging
from datetime import datetime
from typing import Dict, List, Optional
from collections import defaultdict

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from config import settings
from models import Entity, Concept, Relationship
from services.canonicalization_service import CanonicalizationService
from utils.entity_normalizer import EntityType

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class BackfillStats:
    """Track backfill statistics."""

    def __init__(self):
        self.entities_before = 0
        self.entities_after = 0
        self.entities_merged = 0
        self.entities_wikidata = 0

        self.concepts_before = 0
        self.concepts_after = 0
        self.concepts_merged = 0

        self.start_time = datetime.now()
        self.end_time = None

    def finish(self):
        """Mark backfill as finished."""
        self.end_time = datetime.now()

    def print_summary(self):
        """Print backfill summary."""
        duration = (self.end_time - self.start_time).total_seconds()

        print("\n" + "=" * 60)
        print("CANONICALIZATION BACKFILL SUMMARY")
        print("=" * 60)

        print("\nEntities:")
        print(f"  Before:         {self.entities_before}")
        print(f"  After:          {self.entities_after}")
        print(f"  Merged:         {self.entities_merged}")
        print(f"  Dedup Rate:     {100 * (1 - self.entities_after / self.entities_before):.1f}%")
        print(f"  Wikidata:       {self.entities_wikidata} ({100 * self.entities_wikidata / self.entities_after:.1f}%)")

        print("\nConcepts:")
        print(f"  Before:         {self.concepts_before}")
        print(f"  After:          {self.concepts_after}")
        print(f"  Merged:         {self.concepts_merged}")
        print(f"  Dedup Rate:     {100 * (1 - self.concepts_after / self.concepts_before):.1f}%")

        print(f"\nDuration:         {duration:.1f}s")
        print("=" * 60 + "\n")


async def backfill_entities(
    session: AsyncSession,
    canonicalization_service: CanonicalizationService,
    user_id: Optional[str] = None,
    entity_type: Optional[str] = None,
    dry_run: bool = False
) -> Dict[str, int]:
    """
    Backfill entity canonicalization.

    Args:
        session: Database session
        canonicalization_service: Canonicalization service
        user_id: Optional user ID filter
        entity_type: Optional entity type filter
        dry_run: If True, preview changes without applying

    Returns:
        Statistics dictionary
    """
    logger.info(f"[Backfill] Starting entity canonicalization (dry_run={dry_run})")

    # Build query
    query = select(Entity)
    if user_id:
        query = query.where(Entity.user_id == user_id)
    if entity_type:
        query = query.where(Entity.entity_type == entity_type)

    result = await session.execute(query)
    entities = result.scalars().all()

    logger.info(f"[Backfill] Found {len(entities)} entities to process")

    # Track canonical mappings: (user_id, canonical_name, entity_type) → [entity_ids]
    canonical_groups = defaultdict(list)

    # Process each entity
    processed = 0
    for entity in entities:
        try:
            # Canonicalize entity
            canonical_entity = await canonicalization_service.resolve_entity(
                entity_name=entity.name,
                entity_type=EntityType(entity.entity_type),
                context="",  # No context for backfill
                user_id=entity.user_id,
                session=session
            )

            # Group by canonical form
            key = (entity.user_id, canonical_entity.canonical_name, entity.entity_type)
            canonical_groups[key].append({
                'entity': entity,
                'canonical': canonical_entity
            })

            processed += 1
            if processed % 50 == 0:
                logger.info(f"[Backfill] Processed {processed}/{len(entities)} entities")

        except Exception as e:
            logger.error(f"[Backfill] Failed to canonicalize entity {entity.name}: {e}")
            continue

    # Merge duplicate entities
    entities_before = len(entities)
    entities_after = len(canonical_groups)
    entities_merged = entities_before - entities_after
    entities_wikidata = 0

    logger.info(f"[Backfill] Merging duplicates: {entities_before} → {entities_after} ({entities_merged} merged)")

    if not dry_run:
        for key, group in canonical_groups.items():
            try:
                # Keep the entity with the highest occurrence_count
                primary_entity = max(group, key=lambda x: x['entity'].occurrence_count)['entity']
                primary_canonical = max(group, key=lambda x: x['entity'].occurrence_count)['canonical']

                # Merge occurrence counts and popularity
                total_occurrences = sum(item['entity'].occurrence_count for item in group)
                total_popularity = len(group)

                # Collect all aliases
                all_aliases = set()
                for item in group:
                    if item['entity'].name != primary_canonical.canonical_name:
                        all_aliases.add(item['entity'].name)
                    if item['entity'].aliases:
                        all_aliases.update(item['entity'].aliases)
                if primary_canonical.aliases:
                    all_aliases.update(primary_canonical.aliases)

                # Update primary entity
                primary_entity.canonical_name = primary_canonical.canonical_name
                primary_entity.aliases = list(all_aliases)
                primary_entity.wikidata_id = primary_canonical.wikidata_id
                primary_entity.occurrence_count = total_occurrences
                primary_entity.popularity = total_popularity

                if primary_canonical.wikidata_id:
                    entities_wikidata += 1

                # Merge relationships from duplicate entities to primary entity
                for item in group:
                    if item['entity'].id == primary_entity.id:
                        continue  # Skip primary

                    # Find all relationships pointing to the duplicate
                    rels = await session.execute(
                        select(Relationship).where(
                            Relationship.user_id == item['entity'].user_id,
                            Relationship.target_type == 'entity',
                            Relationship.target_id == item['entity'].id
                        )
                    )
                    relationships = rels.scalars().all()

                    # Update relationships to point to primary entity
                    for rel in relationships:
                        # Check if relationship already exists for primary
                        existing = await session.execute(
                            select(Relationship).where(
                                Relationship.user_id == rel.user_id,
                                Relationship.source_type == rel.source_type,
                                Relationship.source_id == rel.source_id,
                                Relationship.target_type == 'entity',
                                Relationship.target_id == primary_entity.id,
                                Relationship.relationship_type == rel.relationship_type
                            )
                        )
                        existing_rel = existing.scalar_one_or_none()

                        if existing_rel:
                            # Merge weights (keep higher)
                            existing_rel.weight = max(existing_rel.weight, rel.weight)
                            await session.delete(rel)
                        else:
                            # Update to point to primary
                            rel.target_id = primary_entity.id

                    # Delete duplicate entity
                    await session.delete(item['entity'])

                await session.flush()

            except Exception as e:
                logger.error(f"[Backfill] Failed to merge entity group {key}: {e}")
                continue

        await session.commit()
        logger.info(f"[Backfill] ✓ Entity canonicalization complete")

    return {
        'before': entities_before,
        'after': entities_after,
        'merged': entities_merged,
        'wikidata': entities_wikidata
    }


async def backfill_concepts(
    session: AsyncSession,
    canonicalization_service: CanonicalizationService,
    user_id: Optional[str] = None,
    dry_run: bool = False
) -> Dict[str, int]:
    """
    Backfill concept canonicalization.

    Args:
        session: Database session
        canonicalization_service: Canonicalization service
        user_id: Optional user ID filter
        dry_run: If True, preview changes without applying

    Returns:
        Statistics dictionary
    """
    logger.info(f"[Backfill] Starting concept canonicalization (dry_run={dry_run})")

    # Build query
    query = select(Concept)
    if user_id:
        query = query.where(Concept.user_id == user_id)

    result = await session.execute(query)
    concepts = result.scalars().all()

    logger.info(f"[Backfill] Found {len(concepts)} concepts to process")

    # Track canonical mappings: (user_id, canonical_name) → [concept_ids]
    canonical_groups = defaultdict(list)

    # Process each concept
    processed = 0
    for concept in concepts:
        try:
            # Canonicalize concept
            canonical_concept = await canonicalization_service.resolve_concept(
                concept_name=concept.name,
                description=concept.description or "",
                user_id=concept.user_id,
                session=session,
                embedding=None  # No embedding for backfill
            )

            # Group by canonical form
            key = (concept.user_id, canonical_concept.canonical_name)
            canonical_groups[key].append({
                'concept': concept,
                'canonical': canonical_concept
            })

            processed += 1
            if processed % 50 == 0:
                logger.info(f"[Backfill] Processed {processed}/{len(concepts)} concepts")

        except Exception as e:
            logger.error(f"[Backfill] Failed to canonicalize concept {concept.name}: {e}")
            continue

    # Merge duplicate concepts
    concepts_before = len(concepts)
    concepts_after = len(canonical_groups)
    concepts_merged = concepts_before - concepts_after

    logger.info(f"[Backfill] Merging duplicates: {concepts_before} → {concepts_after} ({concepts_merged} merged)")

    if not dry_run:
        for key, group in canonical_groups.items():
            try:
                # Keep the concept with the highest occurrence_count
                primary_concept = max(group, key=lambda x: x['concept'].occurrence_count)['concept']
                primary_canonical = max(group, key=lambda x: x['concept'].occurrence_count)['canonical']

                # Merge occurrence counts and popularity
                total_occurrences = sum(item['concept'].occurrence_count for item in group)
                total_popularity = len(group)

                # Collect all aliases
                all_aliases = set()
                for item in group:
                    if item['concept'].name != primary_canonical.canonical_name:
                        all_aliases.add(item['concept'].name)
                    if item['concept'].aliases:
                        all_aliases.update(item['concept'].aliases)
                if primary_canonical.aliases:
                    all_aliases.update(primary_canonical.aliases)

                # Update primary concept
                primary_concept.canonical_name = primary_canonical.canonical_name
                primary_concept.aliases = list(all_aliases)
                primary_concept.description = primary_canonical.description or primary_concept.description
                primary_concept.occurrence_count = total_occurrences
                primary_concept.popularity = total_popularity

                # Merge relationships from duplicate concepts to primary concept
                for item in group:
                    if item['concept'].id == primary_concept.id:
                        continue  # Skip primary

                    # Find all relationships pointing to the duplicate
                    rels = await session.execute(
                        select(Relationship).where(
                            Relationship.user_id == item['concept'].user_id,
                            Relationship.target_type == 'concept',
                            Relationship.target_id == item['concept'].id
                        )
                    )
                    relationships = rels.scalars().all()

                    # Update relationships to point to primary concept
                    for rel in relationships:
                        # Check if relationship already exists for primary
                        existing = await session.execute(
                            select(Relationship).where(
                                Relationship.user_id == rel.user_id,
                                Relationship.source_type == rel.source_type,
                                Relationship.source_id == rel.source_id,
                                Relationship.target_type == 'concept',
                                Relationship.target_id == primary_concept.id,
                                Relationship.relationship_type == rel.relationship_type
                            )
                        )
                        existing_rel = existing.scalar_one_or_none()

                        if existing_rel:
                            # Merge weights (keep higher)
                            existing_rel.weight = max(existing_rel.weight, rel.weight)
                            await session.delete(rel)
                        else:
                            # Update to point to primary
                            rel.target_id = primary_concept.id

                    # Update parent-child relationships
                    children = await session.execute(
                        select(Concept).where(Concept.parent_concept_id == item['concept'].id)
                    )
                    for child in children.scalars().all():
                        child.parent_concept_id = primary_concept.id

                    # Delete duplicate concept
                    await session.delete(item['concept'])

                await session.flush()

            except Exception as e:
                logger.error(f"[Backfill] Failed to merge concept group {key}: {e}")
                continue

        await session.commit()
        logger.info(f"[Backfill] ✓ Concept canonicalization complete")

    return {
        'before': concepts_before,
        'after': concepts_after,
        'merged': concepts_merged
    }


async def main():
    """Main backfill function."""
    parser = argparse.ArgumentParser(description='Backfill entity/concept canonicalization')
    parser.add_argument('--dry-run', action='store_true', help='Preview changes without applying')
    parser.add_argument('--user-id', type=str, help='Backfill specific user only')
    parser.add_argument('--entity-type', type=str, choices=['person', 'company', 'technology', 'product', 'location'], help='Backfill specific entity type only')
    parser.add_argument('--skip-entities', action='store_true', help='Skip entity canonicalization')
    parser.add_argument('--skip-concepts', action='store_true', help='Skip concept canonicalization')

    args = parser.parse_args()

    # Create async engine
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    # Initialize services
    canonicalization_service = CanonicalizationService()
    stats = BackfillStats()

    try:
        async with async_session() as session:
            # Backfill entities
            if not args.skip_entities:
                entity_stats = await backfill_entities(
                    session,
                    canonicalization_service,
                    user_id=args.user_id,
                    entity_type=args.entity_type,
                    dry_run=args.dry_run
                )
                stats.entities_before = entity_stats['before']
                stats.entities_after = entity_stats['after']
                stats.entities_merged = entity_stats['merged']
                stats.entities_wikidata = entity_stats['wikidata']

            # Backfill concepts
            if not args.skip_concepts:
                concept_stats = await backfill_concepts(
                    session,
                    canonicalization_service,
                    user_id=args.user_id,
                    dry_run=args.dry_run
                )
                stats.concepts_before = concept_stats['before']
                stats.concepts_after = concept_stats['after']
                stats.concepts_merged = concept_stats['merged']

    finally:
        await engine.dispose()

    # Print summary
    stats.finish()
    stats.print_summary()

    if args.dry_run:
        print("⚠️  DRY RUN MODE - No changes were applied")
        print("   Run without --dry-run to apply changes\n")


if __name__ == "__main__":
    asyncio.run(main())
