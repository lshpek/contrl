"""Add Telegram identity fields to clients for bot bridge

Revision ID: 0005_bot_bridge_telegram
Revises: 0004_bot_control_attachments_and_ai
Create Date: 2026-11-14
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0005_bot_bridge_telegram"
down_revision = "0004_bot_control_attachments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("clients")}
    with op.batch_alter_table("clients") as batch:
        if "telegram_user_id" not in cols:
            batch.add_column(sa.Column("telegram_user_id", sa.String(length=64), nullable=True))
        if "telegram_username" not in cols:
            batch.add_column(sa.Column("telegram_username", sa.String(length=100), nullable=True))
    existing_idx = {idx["name"] for idx in inspector.get_indexes("clients")}
    if "ix_clients_telegram_user_id" not in existing_idx:
        op.create_index("ix_clients_telegram_user_id", "clients", ["telegram_user_id"], unique=True)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_idx = {idx["name"] for idx in inspector.get_indexes("clients")}
    if "ix_clients_telegram_user_id" in existing_idx:
        op.drop_index("ix_clients_telegram_user_id", table_name="clients")
    cols = {c["name"] for c in inspector.get_columns("clients")}
    with op.batch_alter_table("clients") as batch:
        if "telegram_username" in cols:
            batch.drop_column("telegram_username")
        if "telegram_user_id" in cols:
            batch.drop_column("telegram_user_id")
