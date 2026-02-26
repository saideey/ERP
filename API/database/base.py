"""
Base model class and common mixins for all database models.
"""

from datetime import datetime, timezone, timedelta
from sqlalchemy import Column, Integer, DateTime, Boolean, ForeignKey, Index
from sqlalchemy.orm import declarative_base, declared_attr, relationship

Base = declarative_base()

# Tashkent timezone (UTC+5)
TASHKENT_TZ = timezone(timedelta(hours=5))

def get_tashkent_now():
    """Get current time in Tashkent timezone (as naive datetime)."""
    return datetime.now(TASHKENT_TZ).replace(tzinfo=None)


class TimestampMixin:
    """Mixin for created_at and updated_at timestamps."""
    
    created_at = Column(DateTime, default=get_tashkent_now, nullable=False)
    updated_at = Column(DateTime, default=get_tashkent_now, onupdate=get_tashkent_now, nullable=False)


class SoftDeleteMixin:
    """Mixin for soft delete functionality."""
    
    is_deleted = Column(Boolean, default=False, nullable=False)
    deleted_at = Column(DateTime, nullable=True)


class TenantMixin:
    """
    Mixin that adds tenant_id to any model.
    All tenant-scoped models MUST use this mixin.
    """
    
    @declared_attr
    def tenant_id(cls):
        return Column(
            Integer, 
            ForeignKey('tenants.id', ondelete='CASCADE'), 
            nullable=False, 
            index=True
        )


class BaseModel(Base, TimestampMixin):
    """Abstract base model for NON-tenant models (Tenant, SuperAdmin)."""
    
    __abstract__ = True
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    def to_dict(self):
        """Convert model to dictionary."""
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}
    
    def __repr__(self):
        return f"<{self.__class__.__name__}(id={self.id})>"


class TenantBaseModel(Base, TimestampMixin, TenantMixin):
    """
    Abstract base model for ALL tenant-scoped models.
    
    Includes:
    - id (PK)
    - tenant_id (FK -> tenants.id) with index
    - created_at, updated_at timestamps
    
    All queries on TenantBaseModel subclasses are automatically 
    filtered by tenant_id via SQLAlchemy event listener.
    """
    
    __abstract__ = True
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    def to_dict(self):
        """Convert model to dictionary."""
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}
    
    def __repr__(self):
        return f"<{self.__class__.__name__}(id={self.id}, tenant_id={self.tenant_id})>"
