"""
Shop analytics models — views and likes tracking (IP-based, no auth required).
"""

from sqlalchemy import (
    Column, String, Integer, Boolean, Text,
    ForeignKey, Index, UniqueConstraint, DateTime
)
from sqlalchemy.orm import relationship
from datetime import datetime

from ..base import Base


class ShopView(Base):
    """Track page views per IP for shops and products."""

    __tablename__ = 'shop_views'

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey('tenants.id'), nullable=False)
    product_id = Column(Integer, ForeignKey('products.id'), nullable=True)  # NULL = shop view, set = product view
    ip_address = Column(String(45), nullable=False)
    user_agent = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index('ix_shop_views_tenant', 'tenant_id'),
        Index('ix_shop_views_product', 'product_id'),
        Index('ix_shop_views_created', 'created_at'),
        Index('ix_shop_views_ip', 'ip_address'),
    )


class ShopLike(Base):
    """Track likes per IP — one like per IP per entity."""

    __tablename__ = 'shop_likes'

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey('tenants.id'), nullable=False)
    product_id = Column(Integer, ForeignKey('products.id'), nullable=True)  # NULL = shop like, set = product like
    ip_address = Column(String(45), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint('tenant_id', 'product_id', 'ip_address', name='uq_shop_like_ip'),
        Index('ix_shop_likes_tenant', 'tenant_id'),
        Index('ix_shop_likes_product', 'product_id'),
    )
