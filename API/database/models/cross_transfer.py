"""
Cross-Tenant Partnership & Transfer Models.

Allows companies to:
1. Find and partner with each other
2. Send products between companies
3. Receiver approves and picks target warehouse
"""

from sqlalchemy import (
    Column, String, Integer, Boolean, Text, Numeric, Date,
    DateTime, ForeignKey, Index, UniqueConstraint, CheckConstraint
)
from sqlalchemy.orm import relationship

from ..base import BaseModel, TimestampMixin, Base, get_tashkent_now


class TenantPartnership(Base, TimestampMixin):
    """
    Partnership between two tenants.
    Once accepted, both can send transfers to each other.
    """
    __tablename__ = 'tenant_partnerships'

    id = Column(Integer, primary_key=True, autoincrement=True)

    # Requester (who sent the request)
    requester_tenant_id = Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False)
    # Target (who received the request)
    target_tenant_id = Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False)

    # Status: pending, accepted, rejected, cancelled
    status = Column(String(20), default='pending', nullable=False)

    notes = Column(Text, nullable=True)

    # Relationships
    requester_tenant = relationship("Tenant", foreign_keys=[requester_tenant_id])
    target_tenant = relationship("Tenant", foreign_keys=[target_tenant_id])

    __table_args__ = (
        UniqueConstraint('requester_tenant_id', 'target_tenant_id', name='uq_partnership_pair'),
        CheckConstraint('requester_tenant_id != target_tenant_id', name='ck_partnership_different_tenants'),
        Index('ix_partnership_requester', 'requester_tenant_id'),
        Index('ix_partnership_target', 'target_tenant_id'),
        Index('ix_partnership_status', 'status'),
    )


class CrossTenantTransfer(Base, TimestampMixin):
    """
    Product transfer between two companies.
    Sender creates -> Receiver approves/rejects.
    """
    __tablename__ = 'cross_tenant_transfers'

    id = Column(Integer, primary_key=True, autoincrement=True)

    # Transfer number (auto-generated)
    transfer_number = Column(String(50), nullable=False, unique=True)

    # Sender
    sender_tenant_id = Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False)
    sender_warehouse_id = Column(Integer, ForeignKey('warehouses.id'), nullable=False)
    sender_user_id = Column(Integer, ForeignKey('users.id'), nullable=False)

    # Receiver
    receiver_tenant_id = Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False)
    receiver_warehouse_id = Column(Integer, ForeignKey('warehouses.id'), nullable=True)  # Set on accept
    receiver_user_id = Column(Integer, ForeignKey('users.id'), nullable=True)  # Set on accept

    # Status: pending, accepted, rejected, cancelled
    status = Column(String(20), default='pending', nullable=False)

    # Dates
    transfer_date = Column(Date, nullable=False)
    accepted_at = Column(DateTime, nullable=True)
    rejected_at = Column(DateTime, nullable=True)

    # Notes
    notes = Column(Text, nullable=True)
    reject_reason = Column(Text, nullable=True)

    # Edit tracking — only the OTHER party (not last editor) can accept
    last_edited_by_tenant_id = Column(Integer, ForeignKey('tenants.id'), nullable=True)

    # Relationships
    sender_tenant = relationship("Tenant", foreign_keys=[sender_tenant_id])
    receiver_tenant = relationship("Tenant", foreign_keys=[receiver_tenant_id])
    sender_warehouse = relationship("Warehouse", foreign_keys=[sender_warehouse_id])
    receiver_warehouse = relationship("Warehouse", foreign_keys=[receiver_warehouse_id])
    sender_user = relationship("User", foreign_keys=[sender_user_id])
    receiver_user = relationship("User", foreign_keys=[receiver_user_id])
    items = relationship("CrossTenantTransferItem", back_populates="transfer", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint('sender_tenant_id != receiver_tenant_id', name='ck_cross_transfer_different_tenants'),
        Index('ix_cross_transfer_sender', 'sender_tenant_id'),
        Index('ix_cross_transfer_receiver', 'receiver_tenant_id'),
        Index('ix_cross_transfer_status', 'status'),
    )


class CrossTenantTransferItem(Base, TimestampMixin):
    """
    Line items for cross-tenant transfer.
    Includes sale_price that sender charges receiver.
    """
    __tablename__ = 'cross_tenant_transfer_items'

    id = Column(Integer, primary_key=True, autoincrement=True)

    transfer_id = Column(Integer, ForeignKey('cross_tenant_transfers.id', ondelete='CASCADE'), nullable=False)
    product_id = Column(Integer, ForeignKey('products.id'), nullable=False)

    # Quantities
    quantity = Column(Numeric(20, 4), nullable=False)
    uom_id = Column(Integer, ForeignKey('units_of_measure.id'), nullable=False)
    base_quantity = Column(Numeric(20, 4), nullable=False)  # In base UOM

    # Price (sender's sale price to receiver)
    sale_price = Column(Numeric(20, 2), nullable=False, default=0)
    sale_price_usd = Column(Numeric(20, 2), nullable=True)
    total_amount = Column(Numeric(20, 2), nullable=False, default=0)

    # Notes
    notes = Column(Text, nullable=True)

    # Relationships
    transfer = relationship("CrossTenantTransfer", back_populates="items")
    product = relationship("Product")
    uom = relationship("UnitOfMeasure")

    __table_args__ = (
        Index('ix_cross_transfer_items_transfer', 'transfer_id'),
        CheckConstraint('quantity > 0', name='ck_cross_item_positive_qty'),
    )



class PartnerPayment(Base, TimestampMixin):
    """
    Payment between partner companies.
    Status: pending -> confirmed/rejected by other party.
    Only confirmed payments affect debt balance.
    """
    __tablename__ = 'partner_payments'

    id = Column(Integer, primary_key=True, autoincrement=True)

    payer_tenant_id = Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False)
    receiver_tenant_id = Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False)

    amount = Column(Numeric(20, 2), nullable=False)
    amount_usd = Column(Numeric(20, 2), nullable=True)

    payment_type = Column(String(30), default='cash', nullable=False)
    payment_date = Column(Date, nullable=False)
    notes = Column(Text, nullable=True)

    # pending -> confirmed / rejected
    status = Column(String(20), default='pending', nullable=False)

    # Who created
    created_by_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    # Who confirmed/rejected
    confirmed_by_id = Column(Integer, ForeignKey('users.id'), nullable=True)
    confirmed_at = Column(DateTime, nullable=True)
    reject_reason = Column(Text, nullable=True)

    payer_tenant = relationship("Tenant", foreign_keys=[payer_tenant_id])
    receiver_tenant = relationship("Tenant", foreign_keys=[receiver_tenant_id])
    created_by = relationship("User", foreign_keys=[created_by_id])
    confirmed_by = relationship("User", foreign_keys=[confirmed_by_id])

    __table_args__ = (
        CheckConstraint('payer_tenant_id != receiver_tenant_id', name='ck_payment_different_tenants'),
        CheckConstraint('amount > 0', name='ck_payment_positive_amount'),
        Index('ix_partner_payment_payer', 'payer_tenant_id'),
        Index('ix_partner_payment_receiver', 'receiver_tenant_id'),
        Index('ix_partner_payment_status', 'status'),
    )


class PartnerNotification(Base, TimestampMixin):
    """Notifications for partner events (transfers, payments, partnerships)."""
    __tablename__ = 'partner_notifications'

    id = Column(Integer, primary_key=True, autoincrement=True)

    tenant_id = Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False)

    # transfer_incoming, transfer_accepted, transfer_rejected,
    # partnership_request, partnership_accepted,
    # payment_pending, payment_confirmed, payment_rejected
    notification_type = Column(String(30), nullable=False)
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=True)

    reference_type = Column(String(30), nullable=True)  # transfer, partnership, payment
    reference_id = Column(Integer, nullable=True)
    from_tenant_id = Column(Integer, ForeignKey('tenants.id'), nullable=True)

    is_read = Column(Boolean, default=False, nullable=False)

    tenant = relationship("Tenant", foreign_keys=[tenant_id])
    from_tenant = relationship("Tenant", foreign_keys=[from_tenant_id])

    __table_args__ = (
        Index('ix_partner_notif_tenant', 'tenant_id'),
        Index('ix_partner_notif_unread', 'tenant_id', 'is_read'),
    )
