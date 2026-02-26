"""
Tenant schemas for Super Admin API.
"""

from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, field_validator
import re


class TenantCreate(BaseModel):
    """Create new tenant (company)."""
    
    name: str
    slug: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    subscription_plan: str = "free"
    max_users: int = 5
    max_products: int = 100
    max_warehouses: int = 2
    notes: Optional[str] = None
    
    # Initial admin user
    admin_username: str
    admin_password: str
    admin_first_name: str
    admin_last_name: str
    admin_phone: Optional[str] = None
    
    @field_validator("slug")
    @classmethod
    def validate_slug(cls, v: str) -> str:
        v = v.strip().lower()
        if not re.match(r'^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$', v):
            raise ValueError(
                "Slug faqat kichik harflar, raqamlar va '-' dan iborat bo'lishi kerak. "
                "Uzunligi 3-50 belgi."
            )
        # Reserved slugs
        reserved = ['super', 'admin', 'api', 'login', 'register', 'health', 'docs', 'static']
        if v in reserved:
            raise ValueError(f"'{v}' slug band qilingan")
        return v
    
    @field_validator("admin_username")
    @classmethod
    def validate_admin_username(cls, v: str) -> str:
        if len(v) < 3:
            raise ValueError("Username kamida 3 ta belgidan iborat bo'lishi kerak")
        return v.strip().lower()


class TenantUpdate(BaseModel):
    """Update tenant info."""
    
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    logo_url: Optional[str] = None
    subscription_plan: Optional[str] = None
    subscription_status: Optional[str] = None
    max_users: Optional[int] = None
    max_products: Optional[int] = None
    max_warehouses: Optional[int] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class TenantResponse(BaseModel):
    """Tenant info response."""
    
    id: int
    name: str
    slug: str
    logo_url: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    subscription_plan: str
    subscription_status: str
    max_users: int
    max_products: int
    max_warehouses: int
    is_active: bool
    notes: Optional[str] = None
    payment_required: bool = False
    payment_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    # Stats (filled by service)
    users_count: Optional[int] = None
    products_count: Optional[int] = None
    warehouses_count: Optional[int] = None
    
    model_config = {"from_attributes": True}


class TenantListResponse(BaseModel):
    """List of tenants response."""
    
    data: List[TenantResponse]
    total: int


class TenantPublicInfo(BaseModel):
    """
    Minimal tenant info for login page.
    Only shows name and logo - no sensitive data.
    """
    
    name: str
    slug: str
    logo_url: Optional[str] = None
    payment_required: bool = False
    payment_message: Optional[str] = None


# Super Admin schemas
class SuperAdminLogin(BaseModel):
    """Super admin login request."""
    
    username: str
    password: str


class SuperAdminInfo(BaseModel):
    """Super admin info response."""
    
    id: int
    username: str
    email: Optional[str] = None
    first_name: str
    last_name: str
    
    model_config = {"from_attributes": True}


class SuperAdminLoginResponse(BaseModel):
    """Super admin login response."""
    
    success: bool = True
    message: str
    admin: SuperAdminInfo
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class DashboardStats(BaseModel):
    """Super admin dashboard statistics."""
    
    total_tenants: int
    active_tenants: int
    suspended_tenants: int
    total_users: int
    total_products: int
    total_sales_today: int
