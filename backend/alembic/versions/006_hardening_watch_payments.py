"""Watched folders + payment provider fields.

Revision ID: 006
Revises: 005
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    org_cols = {c["name"] for c in insp.get_columns("orgs")} if insp.has_table("orgs") else set()
    if "payment_provider" not in org_cols:
        op.add_column("orgs", sa.Column("payment_provider", sa.String(32), nullable=True))
    if "razorpay_customer_id" not in org_cols:
        op.add_column("orgs", sa.Column("razorpay_customer_id", sa.String(64), nullable=True))
    if "payment_subscription_id" not in org_cols:
        op.add_column("orgs", sa.Column("payment_subscription_id", sa.String(64), nullable=True))

    if insp.has_table("watched_folders"):
        return

    op.create_table(
        "watched_folders",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("org_id", sa.String(36), sa.ForeignKey("orgs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("path", sa.String(1024), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default="1", nullable=False),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("last_scan_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_watched_folders_org_id", "watched_folders", ["org_id"])


def downgrade() -> None:
    op.drop_table("watched_folders")
    op.drop_column("orgs", "payment_subscription_id")
    op.drop_column("orgs", "razorpay_customer_id")
    op.drop_column("orgs", "payment_provider")
