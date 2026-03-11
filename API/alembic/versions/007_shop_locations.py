"""Add shop categories and tenant location fields

Revision ID: 007_shop_locations
Revises: 006_shop_analytics
Create Date: 2026-03-11
"""
from alembic import op
import sqlalchemy as sa

revision = '007_shop_locations'
down_revision = '006_shop_analytics'
branch_labels = None
depends_on = None


def upgrade() -> None:
    from sqlalchemy import inspect
    bind = op.get_bind()
    inspector = inspect(bind)
    existing = inspector.get_table_names()

    # Create shop_categories table
    if 'shop_categories' not in existing:
        op.create_table(
            'shop_categories',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('name', sa.String(200), nullable=False, unique=True),
            sa.Column('icon', sa.String(10), nullable=True),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('sort_order', sa.Integer(), default=0),
            sa.Column('is_active', sa.Boolean(), default=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
        )
        op.create_index('ix_shop_categories_active', 'shop_categories', ['is_active'])

    # Add location columns to tenants
    if 'tenants' in existing:
        cols = [c['name'] for c in inspector.get_columns('tenants')]
        if 'latitude' not in cols:
            op.add_column('tenants', sa.Column('latitude', sa.Numeric(10, 7), nullable=True))
        if 'longitude' not in cols:
            op.add_column('tenants', sa.Column('longitude', sa.Numeric(10, 7), nullable=True))
        if 'region' not in cols:
            op.add_column('tenants', sa.Column('region', sa.String(100), nullable=True))
        if 'district' not in cols:
            op.add_column('tenants', sa.Column('district', sa.String(100), nullable=True))
        if 'shop_category_id' not in cols:
            op.add_column('tenants', sa.Column('shop_category_id', sa.Integer(), sa.ForeignKey('shop_categories.id'), nullable=True))


def downgrade() -> None:
    op.drop_column('tenants', 'shop_category_id')
    op.drop_column('tenants', 'district')
    op.drop_column('tenants', 'region')
    op.drop_column('tenants', 'longitude')
    op.drop_column('tenants', 'latitude')
    op.drop_table('shop_categories')
