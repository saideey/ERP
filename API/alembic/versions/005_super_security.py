"""Add super admin security and login logs

Revision ID: 005_super_security
Revises: 004_tenant_billings
Create Date: 2026-02-26
"""
from alembic import op
import sqlalchemy as sa

revision = '005_super_security'
down_revision = '004_tenant_billings'
branch_labels = None
depends_on = None


def upgrade() -> None:
    from sqlalchemy import inspect
    bind = op.get_bind()
    inspector = inspect(bind)
    existing = inspector.get_table_names()

    # Add security columns to super_admins
    if 'super_admins' in existing:
        cols = [c['name'] for c in inspector.get_columns('super_admins')]
        if 'locked_until' not in cols:
            op.add_column('super_admins', sa.Column('locked_until', sa.DateTime(), nullable=True))
        if 'security_pin' not in cols:
            op.add_column('super_admins', sa.Column('security_pin', sa.String(255), nullable=True))
        if 'security_code' not in cols:
            op.add_column('super_admins', sa.Column('security_code', sa.String(255), nullable=True))

    # Create login logs table
    if 'super_admin_login_logs' not in existing:
        op.create_table(
            'super_admin_login_logs',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('username', sa.String(100), nullable=True),
            sa.Column('ip_address', sa.String(50), nullable=True),
            sa.Column('user_agent', sa.Text(), nullable=True),
            sa.Column('step_reached', sa.Integer(), default=1),
            sa.Column('success', sa.Boolean(), default=False),
            sa.Column('failure_reason', sa.String(200), nullable=True),
            sa.Column('country', sa.String(50), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('updated_at', sa.DateTime(), nullable=False),
        )


def downgrade() -> None:
    op.drop_table('super_admin_login_logs')
