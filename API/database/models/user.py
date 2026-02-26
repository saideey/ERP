"""
User and Role models for authentication and authorization.
Role-based Access Control (RBAC) implementation.
Multi-tenant: all models scoped by tenant_id.
"""

from enum import Enum as PyEnum
from sqlalchemy import (
    Column, String, Integer, Boolean, Text, 
    ForeignKey, Enum, JSON, Index, UniqueConstraint
)
from sqlalchemy.orm import relationship

from ..base import TenantBaseModel, SoftDeleteMixin


class RoleType(PyEnum):
    """Predefined role types."""
    DIRECTOR = "director"
    SELLER = "seller"
    WAREHOUSE_MANAGER = "warehouse_manager"
    ACCOUNTANT = "accountant"


class PermissionType(PyEnum):
    """Available permissions in the system."""
    # Product permissions
    PRODUCT_VIEW = "product_view"
    PRODUCT_CREATE = "product_create"
    PRODUCT_EDIT = "product_edit"
    PRODUCT_DELETE = "product_delete"
    PRODUCT_PRICE_EDIT = "product_price_edit"
    
    # Warehouse permissions
    WAREHOUSE_VIEW = "warehouse_view"
    WAREHOUSE_CREATE = "warehouse_create"
    WAREHOUSE_INCOME = "warehouse_income"
    WAREHOUSE_OUTCOME = "warehouse_outcome"
    WAREHOUSE_TRANSFER = "warehouse_transfer"
    WAREHOUSE_INVENTORY = "warehouse_inventory"
    
    # Stock permissions
    STOCK_VIEW = "stock_view"
    STOCK_INCOME = "stock_income"
    STOCK_OUTCOME = "stock_outcome"
    STOCK_TRANSFER = "stock_transfer"
    STOCK_ADJUSTMENT = "stock_adjustment"
    
    # Sales permissions
    SALE_VIEW = "sale_view"
    SALE_CREATE = "sale_create"
    SALE_DISCOUNT = "sale_discount"
    SALE_DEBT = "sale_debt"
    SALE_CANCEL = "sale_cancel"
    
    # Payment permissions
    PAYMENT_VIEW = "payment_view"
    PAYMENT_CREATE = "payment_create"
    PAYMENT_CANCEL = "payment_cancel"
    
    # Customer permissions
    CUSTOMER_VIEW = "customer_view"
    CUSTOMER_CREATE = "customer_create"
    CUSTOMER_EDIT = "customer_edit"
    CUSTOMER_DELETE = "customer_delete"
    CUSTOMER_VIP_MANAGE = "customer_vip_manage"
    
    # Report permissions
    REPORT_SALES = "report_sales"
    REPORT_WAREHOUSE = "report_warehouse"
    REPORT_FINANCE = "report_finance"
    REPORT_PROFIT = "report_profit"
    REPORT_EXPORT = "report_export"
    
    # User management permissions
    USER_VIEW = "user_view"
    USER_CREATE = "user_create"
    USER_EDIT = "user_edit"
    USER_DELETE = "user_delete"
    USER_ROLE_ASSIGN = "user_role_assign"
    
    # Settings permissions
    SETTINGS_VIEW = "settings_view"
    SETTINGS_EDIT = "settings_edit"
    SETTINGS_MANAGE = "settings_manage"
    
    # Finance permissions
    FINANCE_VIEW = "finance_view"
    FINANCE_MANAGE = "finance_manage"
    
    # Director special permissions
    DIRECTOR_OVERRIDE = "director_override"


class Role(TenantBaseModel, SoftDeleteMixin):
    """
    Role model for user permissions.
    Scoped per tenant - each tenant has its own roles.
    """
    
    __tablename__ = 'roles'
    
    name = Column(String(100), nullable=False, index=True)
    display_name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    role_type = Column(Enum(RoleType), nullable=True)
    permissions = Column(JSON, default=list, nullable=False)
    max_discount_percent = Column(Integer, default=0)
    is_system = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True, nullable=False)
    
    # Relationships
    users = relationship("User", back_populates="role", lazy="dynamic")
    
    __table_args__ = (
        UniqueConstraint('tenant_id', 'name', name='uq_role_tenant_name'),
        Index('ix_roles_role_type', 'role_type'),
        Index('ix_roles_tenant_active', 'tenant_id', 'is_active'),
    )
    
    def has_permission(self, permission: PermissionType) -> bool:
        if self.role_type == RoleType.DIRECTOR:
            return True
        return permission.value in self.permissions
    
    def add_permission(self, permission: PermissionType):
        if permission.value not in self.permissions:
            self.permissions = self.permissions + [permission.value]
    
    def remove_permission(self, permission: PermissionType):
        if permission.value in self.permissions:
            self.permissions = [p for p in self.permissions if p != permission.value]


class User(TenantBaseModel, SoftDeleteMixin):
    """
    User model for system authentication.
    Scoped per tenant - username unique within tenant.
    """
    
    __tablename__ = 'users'
    
    # Basic info
    username = Column(String(100), nullable=False, index=True)
    email = Column(String(255), nullable=True, index=True)
    password_hash = Column(String(255), nullable=False)
    
    # Personal info
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    phone = Column(String(20), nullable=True, index=True)
    avatar_url = Column(String(500), nullable=True)
    
    # User preferences
    language = Column(String(10), default='uz', nullable=False)
    
    # Role and permissions
    role_id = Column(Integer, ForeignKey('roles.id'), nullable=False)
    
    # Status
    is_active = Column(Boolean, default=True, nullable=False)
    is_blocked = Column(Boolean, default=False, nullable=False)
    blocked_reason = Column(Text, nullable=True)
    
    # Warehouse assignment
    assigned_warehouse_id = Column(Integer, ForeignKey('warehouses.id'), nullable=True)
    
    # Security
    last_login = Column(String(50), nullable=True)
    failed_login_attempts = Column(Integer, default=0)
    password_changed_at = Column(String(50), nullable=True)
    
    # Relationships
    role = relationship("Role", back_populates="users")
    assigned_warehouse = relationship("Warehouse", foreign_keys=[assigned_warehouse_id])
    sales = relationship("Sale", back_populates="seller", foreign_keys="[Sale.seller_id]", lazy="dynamic")
    audit_logs = relationship("AuditLog", back_populates="user", foreign_keys="[AuditLog.user_id]", lazy="dynamic")
    printer_assignments = relationship("UserPrinter", back_populates="user")
    
    __table_args__ = (
        UniqueConstraint('tenant_id', 'username', name='uq_user_tenant_username'),
        UniqueConstraint('tenant_id', 'email', name='uq_user_tenant_email'),
        Index('ix_users_role_id', 'role_id'),
        Index('ix_users_assigned_warehouse', 'assigned_warehouse_id'),
        Index('ix_users_tenant_active', 'tenant_id', 'is_active'),
    )
    
    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"
    
    def has_permission(self, permission: PermissionType) -> bool:
        if not self.is_active or self.is_blocked:
            return False
        return self.role.has_permission(permission)
    
    def can_give_discount(self, discount_percent: float) -> bool:
        if self.role.role_type == RoleType.DIRECTOR:
            return True
        return discount_percent <= self.role.max_discount_percent


class UserSession(TenantBaseModel):
    """User session tracking for security."""
    
    __tablename__ = 'user_sessions'
    
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    token_hash = Column(String(255), nullable=False, index=True)
    device_info = Column(String(500), nullable=True)
    ip_address = Column(String(50), nullable=True)
    expires_at = Column(String(50), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    
    # Relationships
    user = relationship("User")
    
    __table_args__ = (
        Index('ix_user_sessions_user_id', 'user_id'),
        Index('ix_user_sessions_is_active', 'is_active'),
    )
