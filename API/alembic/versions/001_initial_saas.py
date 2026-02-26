"""Initial SaaS setup - all tables including multi-tenancy

Revision ID: 001_initial_saas
Revises: (none)
Create Date: 2026-02-23

Creates ALL tables from SQLAlchemy models using metadata.create_all().
This is the single migration for fresh deployment.
"""

from alembic import op
from sqlalchemy import text

revision = '001_initial_saas'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    """Create all tables from SQLAlchemy models."""
    conn = op.get_bind()
    
    # Import all models so they register with Base.metadata
    from database.base import Base
    from database.models import (
        tenant, super_admin,
        user, product, warehouse, sale,
        customer, supplier, finance, settings,
        printer
    )
    
    # Create all tables that don't exist yet
    Base.metadata.create_all(bind=conn, checkfirst=True)
    
    print("✅ All tables created from SQLAlchemy models")


def downgrade():
    """Drop all tables."""
    conn = op.get_bind()
    
    from database.base import Base
    from database.models import (
        tenant, super_admin,
        user, product, warehouse, sale,
        customer, supplier, finance, settings,
        printer
    )
    
    Base.metadata.drop_all(bind=conn)
    print("✅ All tables dropped")
