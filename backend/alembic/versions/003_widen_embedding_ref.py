"""Widen chunks.embedding_ref for full embedding JSON vectors."""

from alembic import op
import sqlalchemy as sa

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "chunks",
        "embedding_ref",
        existing_type=sa.String(128),
        type_=sa.Text(),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "chunks",
        "embedding_ref",
        existing_type=sa.Text(),
        type_=sa.String(128),
        existing_nullable=True,
    )
