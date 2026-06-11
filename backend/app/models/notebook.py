import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Table, Column, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


# Association table — many notebooks ↔ many sources
notebook_sources = Table(
    "notebook_sources",
    Base.metadata,
    Column("notebook_id", String(36), ForeignKey("notebooks.id", ondelete="CASCADE"), primary_key=True),
    Column("source_id", String(36), ForeignKey("sources.id", ondelete="CASCADE"), primary_key=True),
)


class Notebook(Base):
    __tablename__ = "notebooks"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    org_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("orgs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), default="Untitled notebook", nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    org = relationship("Org", back_populates="notebooks")
    user = relationship("User", back_populates="notebooks")
    sources = relationship("Source", secondary=notebook_sources, back_populates="notebooks")
    sessions = relationship("Session", back_populates="notebook", cascade="all, delete-orphan")
