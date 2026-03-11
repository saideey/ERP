"""Add shop analytics tables (views and likes)

Revision ID: 006_shop_analytics
Revises: 005_super_security
Create Date: 2026-03-11
"""
from alembic import op
import sqlalchemy as sa

revision = '006_shop_analytics'
down_revision = '005_super_security'
branch_labels = None
depends_on = None


def upgrade() -> None:
    from sqlalchemy import inspect
    bind = op.get_bind()
    inspector = inspect(bind)
    existing = inspector.get_table_names()

    if 'shop_views' not in existing:
        op.create_table(
            'shop_views',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id'), nullable=False),
            sa.Column('product_id', sa.Integer(), sa.ForeignKey('products.id'), nullable=True),
            sa.Column('ip_address', sa.String(45), nullable=False),
            sa.Column('user_agent', sa.String(500), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        )
        op.create_index('ix_shop_views_tenant', 'shop_views', ['tenant_id'])
        op.create_index('ix_shop_views_product', 'shop_views', ['product_id'])
        op.create_index('ix_shop_views_created', 'shop_views', ['created_at'])
        op.create_index('ix_shop_views_ip', 'shop_views', ['ip_address'])

    if 'shop_likes' not in existing:
        op.create_table(
            'shop_likes',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id'), nullable=False),
            sa.Column('product_id', sa.Integer(), sa.ForeignKey('products.id'), nullable=True),
            sa.Column('ip_address', sa.String(45), nullable=False),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        )
        op.create_index('ix_shop_likes_tenant', 'shop_likes', ['tenant_id'])
        op.create_index('ix_shop_likes_product', 'shop_likes', ['product_id'])
        op.create_unique_constraint('uq_shop_like_ip', 'shop_likes', ['tenant_id', 'product_id', 'ip_address'])


def downgrade() -> None:
    op.drop_table('shop_likes')
    op.drop_table('shop_views')
