"""
Super Admin dashboard - global statistics.
Endpoint: /api/v1/super/dashboard/...
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
from database.models import (
    SuperAdmin, Tenant, User, Product, Sale,
    SubscriptionStatus
)
from core.dependencies import get_current_super_admin
from schemas.tenant import DashboardStats
from database.base import get_tashkent_now


router = APIRouter()


@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    admin: SuperAdmin = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    """Get global dashboard statistics."""
    
    total_tenants = db.query(func.count(Tenant.id)).filter(
        Tenant.is_active == True
    ).scalar() or 0
    
    active_tenants = db.query(func.count(Tenant.id)).filter(
        Tenant.is_active == True,
        Tenant.subscription_status.in_([
            'active',
            'trial'
        ])
    ).scalar() or 0
    
    suspended_tenants = db.query(func.count(Tenant.id)).filter(
        Tenant.subscription_status == 'suspended'
    ).scalar() or 0
    
    total_users = db.query(func.count(User.id)).filter(
        User.is_active == True,
        User.is_deleted == False
    ).scalar() or 0
    
    total_products = db.query(func.count(Product.id)).filter(
        Product.is_active == True,
        Product.is_deleted == False
    ).scalar() or 0
    
    # Today's sales count across all tenants
    today = get_tashkent_now().date()
    total_sales_today = db.query(func.count(Sale.id)).filter(
        func.date(Sale.created_at) == today
    ).scalar() or 0
    
    return DashboardStats(
        total_tenants=total_tenants,
        active_tenants=active_tenants,
        suspended_tenants=suspended_tenants,
        total_users=total_users,
        total_products=total_products,
        total_sales_today=total_sales_today
    )
