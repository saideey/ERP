"""
Product, Category, and Unit of Measure (UOM) models.
Multi-tenant: all models scoped by tenant_id.
"""

from decimal import Decimal
from sqlalchemy import (
    Column, String, Integer, Boolean, Text, Numeric,
    ForeignKey, Index, CheckConstraint, UniqueConstraint
)
from sqlalchemy.orm import relationship

from ..base import TenantBaseModel, SoftDeleteMixin


class Category(TenantBaseModel, SoftDeleteMixin):
    """Product category with hierarchical structure. Scoped per tenant."""
    
    __tablename__ = 'categories'
    
    name = Column(String(200), nullable=False)
    slug = Column(String(200), nullable=False, index=True)
    description = Column(Text, nullable=True)
    parent_id = Column(Integer, ForeignKey('categories.id'), nullable=True)
    image_url = Column(String(500), nullable=True)
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True, nullable=False)
    
    # Relationships
    parent = relationship("Category", remote_side="Category.id", backref="children")
    products = relationship("Product", back_populates="category", lazy="dynamic")
    
    __table_args__ = (
        UniqueConstraint('tenant_id', 'slug', name='uq_category_tenant_slug'),
        UniqueConstraint('tenant_id', 'name', 'parent_id', name='uq_category_tenant_name_parent'),
        Index('ix_categories_parent_id', 'parent_id'),
        Index('ix_categories_tenant_active', 'tenant_id', 'is_active'),
    )
    
    @property
    def full_path(self) -> str:
        if self.parent:
            return f"{self.parent.full_path} / {self.name}"
        return self.name


class UnitOfMeasure(TenantBaseModel):
    """Unit of Measure definitions. Scoped per tenant."""
    
    __tablename__ = 'units_of_measure'
    
    name = Column(String(100), nullable=False)
    symbol = Column(String(20), nullable=False)
    description = Column(String(255), nullable=True)
    uom_type = Column(String(50), nullable=False)
    base_factor = Column(Numeric(20, 10), default=1, nullable=False)
    decimal_places = Column(Integer, default=2)
    is_integer_only = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True, nullable=False)
    
    __table_args__ = (
        UniqueConstraint('tenant_id', 'name', name='uq_uom_tenant_name'),
        UniqueConstraint('tenant_id', 'symbol', name='uq_uom_tenant_symbol'),
        Index('ix_uom_type', 'uom_type'),
        CheckConstraint('base_factor > 0', name='ck_uom_positive_factor'),
    )


class Product(TenantBaseModel, SoftDeleteMixin):
    """Product model with support for multiple units of measure. Scoped per tenant."""
    
    __tablename__ = 'products'
    
    # Basic info
    name = Column(String(300), nullable=False, index=True)
    article = Column(String(100), nullable=True, index=True)
    barcode = Column(String(100), nullable=True, index=True)
    description = Column(Text, nullable=True)
    
    # Category
    category_id = Column(Integer, ForeignKey('categories.id'), nullable=True)
    
    # Base unit of measure
    base_uom_id = Column(Integer, ForeignKey('units_of_measure.id'), nullable=False)
    
    # Pricing
    cost_price = Column(Numeric(20, 4), default=0, nullable=False)
    sale_price = Column(Numeric(20, 4), default=0, nullable=False)
    sale_price_usd = Column(Numeric(20, 4), nullable=True)
    vip_price = Column(Numeric(20, 4), nullable=True)
    vip_price_usd = Column(Numeric(20, 4), nullable=True)
    
    # Display settings
    color = Column(String(7), nullable=True)
    is_favorite = Column(Boolean, default=False)
    sort_order = Column(Integer, default=0)
    
    # Stock settings
    min_stock_level = Column(Numeric(20, 4), default=0)
    track_stock = Column(Boolean, default=True)
    allow_negative_stock = Column(Boolean, default=False)
    
    # Media
    image_url = Column(String(500), nullable=True)
    images = Column(Text, nullable=True)
    
    # Additional info
    brand = Column(String(100), nullable=True)
    manufacturer = Column(String(200), nullable=True)
    country_of_origin = Column(String(100), nullable=True)
    
    # Flags
    is_active = Column(Boolean, default=True, nullable=False)
    is_featured = Column(Boolean, default=False)
    is_service = Column(Boolean, default=False)
    
    # Relationships
    category = relationship("Category", back_populates="products")
    base_uom = relationship("UnitOfMeasure")
    uom_conversions = relationship("ProductUOMConversion", back_populates="product", lazy="dynamic", cascade="all, delete-orphan")
    stock_items = relationship("Stock", back_populates="product", lazy="dynamic")
    
    __table_args__ = (
        UniqueConstraint('tenant_id', 'article', name='uq_product_tenant_article'),
        UniqueConstraint('tenant_id', 'barcode', name='uq_product_tenant_barcode'),
        Index('ix_products_category_id', 'category_id'),
        Index('ix_products_base_uom_id', 'base_uom_id'),
        Index('ix_products_tenant_active', 'tenant_id', 'is_active'),
        Index('ix_products_tenant_name', 'tenant_id', 'name'),
        CheckConstraint('cost_price >= 0', name='ck_product_cost_price_positive'),
        CheckConstraint('sale_price >= 0', name='ck_product_sale_price_positive'),
    )
    
    def get_price_for_customer_type(self, is_vip: bool = False) -> Decimal:
        if is_vip and self.vip_price:
            return self.vip_price
        return self.sale_price


class ProductUOMConversion(TenantBaseModel):
    """Product-specific UOM conversion factors. Scoped per tenant."""
    
    __tablename__ = 'product_uom_conversions'
    
    product_id = Column(Integer, ForeignKey('products.id', ondelete='CASCADE'), nullable=False)
    uom_id = Column(Integer, ForeignKey('units_of_measure.id'), nullable=False)
    conversion_factor = Column(Numeric(20, 10), nullable=False)
    sale_price = Column(Numeric(20, 4), nullable=True)
    vip_price = Column(Numeric(20, 4), nullable=True)
    is_default_sale_uom = Column(Boolean, default=False)
    is_default_purchase_uom = Column(Boolean, default=False)
    is_integer_only = Column(Boolean, default=False)
    
    # Relationships
    product = relationship("Product", back_populates="uom_conversions")
    uom = relationship("UnitOfMeasure")
    
    __table_args__ = (
        UniqueConstraint('tenant_id', 'product_id', 'uom_id', name='uq_product_uom_tenant'),
        Index('ix_product_uom_product_id', 'product_id'),
        Index('ix_product_uom_uom_id', 'uom_id'),
        CheckConstraint('conversion_factor > 0', name='ck_product_uom_positive_factor'),
    )
    
    def to_base_quantity(self, quantity: Decimal) -> Decimal:
        return Decimal(str(quantity)) * Decimal(str(self.conversion_factor))
    
    def from_base_quantity(self, base_quantity: Decimal) -> Decimal:
        if self.conversion_factor == 0:
            return Decimal(0)
        return Decimal(str(base_quantity)) / Decimal(str(self.conversion_factor))


class ProductPriceHistory(TenantBaseModel):
    """Track product price changes. Scoped per tenant."""
    
    __tablename__ = 'product_price_history'
    
    product_id = Column(Integer, ForeignKey('products.id'), nullable=False)
    changed_by_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    price_type = Column(String(20), nullable=False)
    old_price = Column(Numeric(20, 4), nullable=True)
    new_price = Column(Numeric(20, 4), nullable=False)
    reason = Column(Text, nullable=True)
    
    # Relationships
    product = relationship("Product")
    changed_by = relationship("User")
    
    __table_args__ = (
        Index('ix_price_history_product_id', 'product_id'),
        Index('ix_price_history_created_at', 'created_at'),
    )
