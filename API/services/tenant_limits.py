"""
Tenant Limit Enforcement — Multi-Tenant SaaS

Centralized limit checking for:
- max_users: Maximum users per tenant
- max_products: Maximum products per tenant
- max_warehouses: Maximum warehouses per tenant

Usage in any service:
    from services.tenant_limits import check_limit, LimitType
    
    ok, msg = check_limit(db, tenant_id, LimitType.PRODUCTS)
    if not ok:
        return None, msg  # "Mahsulot limiti: 100/100. Tarif oshiring."
"""

from enum import Enum
from typing import Tuple, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from database.models import Tenant, User, Product, Warehouse


class LimitType(str, Enum):
    USERS = "users"
    PRODUCTS = "products"
    WAREHOUSES = "warehouses"


# Display names and model mappings
_LIMIT_CONFIG = {
    LimitType.USERS: {
        "name": "Xodim",
        "max_field": "max_users",
        "model": User,
        "filters": lambda m: [m.is_deleted == False],
    },
    LimitType.PRODUCTS: {
        "name": "Mahsulot",
        "max_field": "max_products",
        "model": Product,
        "filters": lambda m: [m.is_deleted == False],
    },
    LimitType.WAREHOUSES: {
        "name": "Ombor",
        "max_field": "max_warehouses",
        "model": Warehouse,
        "filters": lambda m: [m.is_deleted == False],
    },
}


def check_limit(
    db: Session,
    tenant_id: int,
    limit_type: LimitType,
) -> Tuple[bool, Optional[str]]:
    """
    Check if tenant has reached its limit for a resource.
    
    Returns:
        (True, None) — limit not reached, can create
        (False, "error message") — limit reached
    """
    config = _LIMIT_CONFIG[limit_type]
    
    # Get tenant
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        return False, "Kompaniya topilmadi"
    
    max_allowed = getattr(tenant, config["max_field"], 0)
    
    # 0 or negative = unlimited
    if max_allowed <= 0:
        return True, None
    
    # Count current items
    model = config["model"]
    query = db.query(func.count(model.id)).filter(model.tenant_id == tenant_id)
    for f in config["filters"](model):
        query = query.filter(f)
    
    current_count = query.scalar() or 0
    
    if current_count >= max_allowed:
        name = config["name"]
        return False, (
            f"{name} limiti tugadi: {current_count}/{max_allowed}. "
            f"Tarif oshirish uchun administrator bilan bog'laning."
        )
    
    return True, None


def get_tenant_usage(db: Session, tenant_id: int) -> dict:
    """
    Get current usage vs limits for a tenant.
    Useful for dashboards and info endpoints.
    """
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        return {}
    
    usage = {}
    for lt, config in _LIMIT_CONFIG.items():
        model = config["model"]
        query = db.query(func.count(model.id)).filter(model.tenant_id == tenant_id)
        for f in config["filters"](model):
            query = query.filter(f)
        
        current = query.scalar() or 0
        max_val = getattr(tenant, config["max_field"], 0)
        
        usage[lt.value] = {
            "current": current,
            "max": max_val,
            "unlimited": max_val <= 0,
            "remaining": max(0, max_val - current) if max_val > 0 else -1,
            "percentage": round((current / max_val) * 100) if max_val > 0 else 0,
        }
    
    return usage
