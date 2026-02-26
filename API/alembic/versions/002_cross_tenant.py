"""Add cross-tenant partnerships and transfers

Revision ID: 002_cross_tenant
Revises: 001_initial_saas
Create Date: 2026-02-23
"""
from alembic import op
import sqlalchemy as sa

revision = '002_cross_tenant'
down_revision = '001_initial_saas'
branch_labels = None
depends_on = None


def upgrade() -> None:
    from sqlalchemy import inspect
    bind = op.get_bind()
    inspector = inspect(bind)
    existing = inspector.get_table_names()

    if 'tenant_partnerships' not in existing:
        op.create_table(
            'tenant_partnerships',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('requester_tenant_id', sa.Integer(), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
            sa.Column('target_tenant_id', sa.Integer(), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
            sa.Column('status', sa.String(20), default='pending', nullable=False),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('updated_at', sa.DateTime(), nullable=False),
            sa.UniqueConstraint('requester_tenant_id', 'target_tenant_id', name='uq_partnership_pair'),
            sa.CheckConstraint('requester_tenant_id != target_tenant_id', name='ck_partnership_different_tenants'),
            sa.Index('ix_partnership_requester', 'requester_tenant_id'),
            sa.Index('ix_partnership_target', 'target_tenant_id'),
            sa.Index('ix_partnership_status', 'status'),
        )

    if 'cross_tenant_transfers' not in existing:
        op.create_table(
            'cross_tenant_transfers',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('transfer_number', sa.String(50), nullable=False, unique=True),
            sa.Column('sender_tenant_id', sa.Integer(), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
            sa.Column('sender_warehouse_id', sa.Integer(), sa.ForeignKey('warehouses.id'), nullable=False),
            sa.Column('sender_user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('receiver_tenant_id', sa.Integer(), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
            sa.Column('receiver_warehouse_id', sa.Integer(), sa.ForeignKey('warehouses.id'), nullable=True),
            sa.Column('receiver_user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
            sa.Column('status', sa.String(20), default='pending', nullable=False),
            sa.Column('transfer_date', sa.Date(), nullable=False),
            sa.Column('accepted_at', sa.DateTime(), nullable=True),
            sa.Column('rejected_at', sa.DateTime(), nullable=True),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.Column('reject_reason', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('updated_at', sa.DateTime(), nullable=False),
            sa.CheckConstraint('sender_tenant_id != receiver_tenant_id', name='ck_cross_transfer_different_tenants'),
            sa.Index('ix_cross_transfer_sender', 'sender_tenant_id'),
            sa.Index('ix_cross_transfer_receiver', 'receiver_tenant_id'),
            sa.Index('ix_cross_transfer_status', 'status'),
        )

    if 'cross_tenant_transfer_items' not in existing:
        op.create_table(
            'cross_tenant_transfer_items',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('transfer_id', sa.Integer(), sa.ForeignKey('cross_tenant_transfers.id', ondelete='CASCADE'), nullable=False),
            sa.Column('product_id', sa.Integer(), sa.ForeignKey('products.id'), nullable=False),
            sa.Column('quantity', sa.Numeric(20, 4), nullable=False),
            sa.Column('uom_id', sa.Integer(), sa.ForeignKey('units_of_measure.id'), nullable=False),
            sa.Column('base_quantity', sa.Numeric(20, 4), nullable=False),
            sa.Column('sale_price', sa.Numeric(20, 2), nullable=False, server_default='0'),
            sa.Column('sale_price_usd', sa.Numeric(20, 2), nullable=True),
            sa.Column('total_amount', sa.Numeric(20, 2), nullable=False, server_default='0'),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('updated_at', sa.DateTime(), nullable=False),
            sa.Index('ix_cross_transfer_items_transfer', 'transfer_id'),
            sa.CheckConstraint('quantity > 0', name='ck_cross_item_positive_qty'),
        )


def downgrade() -> None:
    op.drop_table('cross_tenant_transfer_items')
    op.drop_table('cross_tenant_transfers')
    op.drop_table('tenant_partnerships')
