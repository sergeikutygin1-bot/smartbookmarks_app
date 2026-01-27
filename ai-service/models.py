"""
SQLAlchemy models for database access.

Maps to Prisma schema in backend/prisma/schema.prisma.
Uses async SQLAlchemy 2.0+ patterns.
"""
from sqlalchemy import String, Float, DateTime, Text, JSON
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from datetime import datetime
from typing import Optional, List
from pgvector.sqlalchemy import Vector


class Base(DeclarativeBase):
    """Base class for all models."""
    pass


class Bookmark(Base):
    """
    Bookmark model - matches Prisma Bookmark table.

    Only includes fields needed for enrichment updates.
    Full schema available in backend/prisma/schema.prisma.
    """
    __tablename__ = "bookmarks"

    # Primary key
    id: Mapped[str] = mapped_column(Text, primary_key=True)

    # User relationship
    user_id: Mapped[str] = mapped_column(Text, nullable=False)

    # Core fields
    url: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Note: tags are in separate bookmark_tags table, not updated by Python worker

    # Enrichment fields (Phase 1)
    content_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    content_metrics: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Embedding
    embedding: Mapped[Optional[List[float]]] = mapped_column(Vector(1536), nullable=True)

    # Status tracking
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending")

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    processed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    def __repr__(self):
        return f"<Bookmark(id={self.id}, title={self.title})>"


class Entity(Base):
    """
    Entity model - matches Prisma Entity table.

    Phase 2: Includes canonicalization fields (canonicalName, aliases, wikidataId, popularity).
    """
    __tablename__ = "entities"

    # Primary key
    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: str(__import__('uuid').uuid4()))

    # User relationship
    user_id: Mapped[str] = mapped_column(Text, nullable=False)

    # Core fields
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(200), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)

    # Usage tracking
    occurrence_count: Mapped[int] = mapped_column(nullable=False, default=1)

    # Phase 2: Canonicalization fields (prepared for Phase 2.1)
    canonical_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    aliases: Mapped[Optional[List[str]]] = mapped_column(ARRAY(String), nullable=True)
    wikidata_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    popularity: Mapped[int] = mapped_column(nullable=False, default=1)

    # Entity metadata (renamed to avoid SQLAlchemy reserved name)
    entity_metadata: Mapped[Optional[dict]] = mapped_column('metadata', JSON, nullable=True)

    # Timestamps
    first_seen_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    def __repr__(self):
        return f"<Entity(id={self.id}, name={self.name}, type={self.entity_type})>"


class Concept(Base):
    """
    Concept model - matches Prisma Concept table.

    Phase 2: Includes canonicalization fields (canonicalName, aliases, description, popularity).
    """
    __tablename__ = "concepts"

    # Primary key
    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: str(__import__('uuid').uuid4()))

    # User relationship
    user_id: Mapped[str] = mapped_column(Text, nullable=False)

    # Core fields
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(200), nullable=False)

    # Hierarchy
    parent_concept_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Usage tracking
    occurrence_count: Mapped[int] = mapped_column(nullable=False, default=1)

    # Phase 2: Canonicalization fields (prepared for Phase 2.1)
    canonical_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    aliases: Mapped[Optional[List[str]]] = mapped_column(ARRAY(String), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    popularity: Mapped[int] = mapped_column(nullable=False, default=1)

    # Timestamp
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    def __repr__(self):
        return f"<Concept(id={self.id}, name={self.name})>"


class Relationship(Base):
    """
    Relationship model - matches Prisma Relationship table.

    Polymorphic relationships between all node types.
    """
    __tablename__ = "relationships"

    # Primary key
    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: str(__import__('uuid').uuid4()))

    # User relationship
    user_id: Mapped[str] = mapped_column(Text, nullable=False)

    # Polymorphic source
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)
    source_id: Mapped[str] = mapped_column(Text, nullable=False)

    # Polymorphic target
    target_type: Mapped[str] = mapped_column(String(50), nullable=False)
    target_id: Mapped[str] = mapped_column(Text, nullable=False)

    # Relationship metadata
    relationship_type: Mapped[str] = mapped_column(String(50), nullable=False)
    weight: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)

    # Relationship metadata (renamed to avoid SQLAlchemy reserved name)
    relationship_metadata: Mapped[Optional[dict]] = mapped_column('metadata', JSON, nullable=True)

    def __repr__(self):
        return f"<Relationship({self.source_type}:{self.source_id} --{self.relationship_type}-> {self.target_type}:{self.target_id})>"
