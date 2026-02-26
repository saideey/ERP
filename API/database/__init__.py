"""
Database package for Metall Basa SaaS ERP.

Usage:
    from database import db, get_db, init_db
    from database.models import User, Product, Sale, Tenant
"""

from .base import Base, BaseModel, TenantBaseModel, TenantMixin, TimestampMixin, SoftDeleteMixin
from .connection import (
    DatabaseConnection,
    db,
    get_db,
    init_db,
    reset_db,
)

# Import all models to ensure they are registered with SQLAlchemy
from .models import *


__all__ = [
    # Base
    'Base',
    'BaseModel',
    'TenantBaseModel',
    'TenantMixin',
    'TimestampMixin',
    'SoftDeleteMixin',
    
    # Connection
    'DatabaseConnection',
    'db',
    'get_db',
    'init_db',
    'reset_db',
]
