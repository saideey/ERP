"""Add partner payments, notifications, and transfer edit tracking

Revision ID: 003_partner_payments
Revises: 002_cross_tenant
Create Date: 2026-02-24
"""
from alembic import op
import sqlalchemy as sa

revision = '003_partner_payments'
down_revision = '002_cross_tenant'
branch_labels = None
depends_on = None


def upgrade() -> None:
    from sqlalchemy import inspect
    bind = op.get_bind()
    inspector = inspect(bind)
    existing = inspector.get_table_names()

    if 'partner_payments' not in existing:
        op.create_table(
            'partner_payments',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('payer_tenant_id', sa.Integer(), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
            sa.Column('receiver_tenant_id', sa.Integer(), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
            sa.Column('amount', sa.Numeric(20, 2), nullable=False),
            sa.Column('amount_usd', sa.Numeric(20, 2), nullable=True),
            sa.Column('payment_type', sa.String(30), default='cash', nullable=False),
            sa.Column('payment_date', sa.Date(), nullable=False),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.Column('status', sa.String(20), default='pending', nullable=False),
            sa.Column('created_by_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('confirmed_by_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
            sa.Column('confirmed_at', sa.DateTime(), nullable=True),
            sa.Column('reject_reason', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('updated_at', sa.DateTime(), nullable=False),
        )
    else:
        cols = [c['name'] for c in inspector.get_columns('partner_payments')]
        if 'status' not in cols:
            op.add_column('partner_payments', sa.Column('status', sa.String(20), server_default='pending', nullable=False))
        if 'confirmed_by_id' not in cols:
            op.add_column('partner_payments', sa.Column('confirmed_by_id', sa.Integer(), nullable=True))
        if 'confirmed_at' not in cols:
            op.add_column('partner_payments', sa.Column('confirmed_at', sa.DateTime(), nullable=True))
        if 'reject_reason' not in cols:
            op.add_column('partner_payments', sa.Column('reject_reason', sa.Text(), nullable=True))

    if 'partner_notifications' not in existing:
        op.create_table(
            'partner_notifications',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
            sa.Column('notification_type', sa.String(30), nullable=False),
            sa.Column('title', sa.String(200), nullable=False),
            sa.Column('message', sa.Text(), nullable=True),
            sa.Column('reference_type', sa.String(30), nullable=True),
            sa.Column('reference_id', sa.Integer(), nullable=True),
            sa.Column('from_tenant_id', sa.Integer(), sa.ForeignKey('tenants.id'), nullable=True),
            sa.Column('is_read', sa.Boolean(), default=False, nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('updated_at', sa.DateTime(), nullable=False),
        )

    # Add edit tracking to cross_tenant_transfers
    if 'cross_tenant_transfers' in existing:
        cols = [c['name'] for c in inspector.get_columns('cross_tenant_transfers')]
        if 'last_edited_by_tenant_id' not in cols:
            op.add_column('cross_tenant_transfers',
                sa.Column('last_edited_by_tenant_id', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_table('partner_notifications')
    op.drop_table('partner_payments')
