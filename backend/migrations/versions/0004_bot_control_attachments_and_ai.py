"""Service bot control fields and order attachments."""
from alembic import op
import sqlalchemy as sa

revision = "0004_bot_control_attachments"
down_revision = "0003_commercial_and_ops"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("services", sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("services", sa.Column("control_mode", sa.String(length=24), nullable=False, server_default="manual_flag"))
    op.add_column("services", sa.Column("control_url", sa.String(length=500), nullable=True))

    op.create_table(
        "order_attachments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("uploaded_by_user_id", sa.Integer(), nullable=True),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("stored_filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=120), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("is_internal", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["uploaded_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_order_attachments_order_id", "order_attachments", ["order_id"])
    op.create_index("ix_order_attachments_created_at", "order_attachments", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_order_attachments_created_at", table_name="order_attachments")
    op.drop_index("ix_order_attachments_order_id", table_name="order_attachments")
    op.drop_table("order_attachments")

    with op.batch_alter_table("services") as batch_op:
        batch_op.drop_column("control_url")
        batch_op.drop_column("control_mode")
        batch_op.drop_column("is_enabled")
