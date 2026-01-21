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
