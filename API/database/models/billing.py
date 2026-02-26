"""
Tenant Billing model — tracks subscription payments for each company.
"""

from sqlalchemy import (
    Column, String, Integer, Text, Numeric,
    DateTime, Date, ForeignKey, Boolean
)
from sqlalchemy.orm import relationship

from ..base import Base, TimestampMixin


class TenantBilling(Base, TimestampMixin):
    """Individual payment record for a tenant's subscription."""

    __tablename__ = 'tenant_billings'

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False, index=True)

    # Payment info
    amount = Column(Numeric(20, 2), nullable=False)
    currency = Column(String(10), default='UZS', nullable=False)

    # Period
    period_type = Column(String(20), nullable=False)  # monthly, yearly
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)

    # Payment details
    payment_date = Column(Date, nullable=False)
    payment_method = Column(String(30), default='cash', nullable=False)  # cash, card, transfer
    notes = Column(Text, nullable=True)

    # Status
    status = Column(String(20), default='paid', nullable=False)  # paid, refunded, cancelled

    # Who recorded it
    created_by_admin_id = Column(Integer, ForeignKey('super_admins.id'), nullable=True)

    # Relationships
    tenant = relationship("Tenant", backref="billings")
