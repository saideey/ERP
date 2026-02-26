"""Add tenant_billings table

Revision ID: 004_tenant_billings
Revises: 003_partner_payments
Create Date: 2026-02-25
"""
from alembic import op
import sqlalchemy as sa

revision = '004_tenant_billings'
down_revision = '003_partner_payments'
branch_labels = None
depends_on = None


def upgrade() -> None:
    from sqlalchemy import inspect
    bind = op.get_bind()
    inspector = inspect(bind)
    existing = inspector.get_table_names()

    if 'tenant_billings' not in existing:
        op.create_table(
            'tenant_billings',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('amount', sa.Numeric(20, 2), nullable=False),
            sa.Column('currency', sa.String(10), default='UZS', nullable=False),
            sa.Column('period_type', sa.String(20), nullable=False),
            sa.Column('period_start', sa.Date(), nullable=False),
            sa.Column('period_end', sa.Date(), nullable=False),
            sa.Column('payment_date', sa.Date(), nullable=False),
            sa.Column('payment_method', sa.String(30), default='cash', nullable=False),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.Column('status', sa.String(20), default='paid', nullable=False),
            sa.Column('created_by_admin_id', sa.Integer(), sa.ForeignKey('super_admins.id'), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('updated_at', sa.DateTime(), nullable=False),
        )


def downgrade() -> None:
    op.drop_table('tenant_billings')
