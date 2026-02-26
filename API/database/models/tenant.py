"""
Tenant (Company) model for multi-tenancy SaaS architecture.
Each tenant represents a separate company using the ERP system.
"""

from enum import Enum as PyEnum
from sqlalchemy import (
    Column, String, Integer, Boolean, Text, Numeric,
    DateTime, JSON, Index, CheckConstraint
)
from sqlalchemy.orm import relationship

from ..base import BaseModel


class SubscriptionPlan(PyEnum):
    """Available subscription plans."""
    free = "free"
    basic = "basic"
    pro = "pro"
    enterprise = "enterprise"


class SubscriptionStatus(PyEnum):
    """Subscription status."""
    active = "active"
    trial = "trial"
    suspended = "suspended"
    cancelled = "cancelled"
    expired = "expired"


class Tenant(BaseModel):
    """
    Tenant model - represents a company in the SaaS system.
    
    Each tenant has its own:
    - Users, roles, permissions
    - Products, categories, UOMs
    - Warehouses, stock
    - Sales, customers
    - Settings, reports
    
    Data isolation is enforced via tenant_id on all related models.
    """
    
    __tablename__ = 'tenants'
    
    # Basic info
    name = Column(String(300), nullable=False)  # "G'ayrat Stroy House"
    slug = Column(String(100), unique=True, nullable=False, index=True)  # "gayrat-stroy" (URL uchun)
    
    # Contact info
    logo_url = Column(String(500), nullable=True)
    phone = Column(String(20), nullable=True)
    email = Column(String(255), nullable=True)
    address = Column(Text, nullable=True)
    
    # Subscription
    subscription_plan = Column(
        String(20),
        default='free',
        nullable=False
    )
    subscription_status = Column(
        String(20),
        default='trial',
        nullable=False
    )
    trial_ends_at = Column(DateTime, nullable=True)
    subscription_ends_at = Column(DateTime, nullable=True)
    
    # Limits (based on subscription plan)
    max_users = Column(Integer, default=5, nullable=False)
    max_products = Column(Integer, default=100, nullable=False)
    max_warehouses = Column(Integer, default=2, nullable=False)
    
    # Tenant-specific settings (JSON)
    settings = Column(JSON, default=dict, nullable=False)
    # Example settings:
    # {
    #   "currency": "UZS",
    #   "timezone": "Asia/Tashkent",
    #   "language": "uz",
    #   "sms_enabled": false,
    #   "telegram_bot_token": null,
    #   "telegram_director_ids": [],
    #   "company_phone": "+998 90 123 45 67"
    # }
    
    # Status
    is_active = Column(Boolean, default=True, nullable=False)
    
    # Metadata
    notes = Column(Text, nullable=True)  # Super admin uchun ichki eslatmalar
    
    # Payment notification — Super admin sets this to block tenant users
    payment_required = Column(Boolean, default=False, nullable=False)
    payment_message = Column(Text, nullable=True)  # Custom message, default: "To'lovni amalga oshiring"
    
    __table_args__ = (
        Index('ix_tenants_is_active', 'is_active'),
        Index('ix_tenants_subscription_status', 'subscription_status'),
        CheckConstraint('max_users > 0', name='ck_tenant_max_users_positive'),
        CheckConstraint('max_products > 0', name='ck_tenant_max_products_positive'),
    )
    
    def __repr__(self):
        return f"<Tenant(id={self.id}, name='{self.name}', slug='{self.slug}')>"
    
    @property
    def is_subscription_active(self) -> bool:
        """Check if tenant has active subscription."""
        return (
            self.is_active and 
            self.subscription_status in ('active', 'trial')
        )
