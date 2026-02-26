"""
Subscription Plans — Centralized Plan Definitions

All plan limits, features, and pricing defined in one place.
Super admin selects plan → limits auto-applied to tenant.

Usage:
    from core.subscription_plans import PLANS, get_plan, apply_plan_to_tenant
    
    plan = get_plan("business")
    apply_plan_to_tenant(tenant, "business")
"""

from typing import Dict, Optional


# ==================== PLAN DEFINITIONS ====================

PLANS: Dict[str, dict] = {
    "starter": {
        "name": "Starter",
        "name_uz": "Boshlang'ich",
        "description": "Kichik biznes uchun",
        "price_monthly": 0,
        "price_yearly": 0,
        "max_users": 3,
        "max_products": 500,
        "max_warehouses": 1,
        "features": {
            "telegram_notifications": False,
            "daily_reports": False,
            "stock_transfers": False,
            "multi_warehouse": False,
            "excel_export": True,
            "customer_debt_tracking": True,
        },
        "color": "#6B7280",  # gray
        "icon": "🆓",
        "sort_order": 1,
    },
    "business": {
        "name": "Business",
        "name_uz": "Biznes",
        "description": "O'rta biznes uchun",
        "price_monthly": 200_000,  # so'm
        "price_yearly": 2_000_000,
        "max_users": 10,
        "max_products": 2000,
        "max_warehouses": 2,
        "features": {
            "telegram_notifications": True,
            "daily_reports": True,
            "stock_transfers": True,
            "multi_warehouse": True,
            "excel_export": True,
            "customer_debt_tracking": True,
        },
        "color": "#2563EB",  # blue
        "icon": "💼",
        "sort_order": 2,
    },
    "premium": {
        "name": "Premium",
        "name_uz": "Premium",
        "description": "Katta biznes uchun",
        "price_monthly": 500_000,
        "price_yearly": 5_000_000,
        "max_users": 50,
        "max_products": 10000,
        "max_warehouses": 5,
        "features": {
            "telegram_notifications": True,
            "daily_reports": True,
            "stock_transfers": True,
            "multi_warehouse": True,
            "excel_export": True,
            "customer_debt_tracking": True,
        },
        "color": "#7C3AED",  # purple
        "icon": "👑",
        "sort_order": 3,
    },
    "enterprise": {
        "name": "Enterprise",
        "name_uz": "Korporativ",
        "description": "Cheksiz imkoniyatlar",
        "price_monthly": 1_000_000,
        "price_yearly": 10_000_000,
        "max_users": 0,        # 0 = unlimited
        "max_products": 0,     # 0 = unlimited
        "max_warehouses": 0,   # 0 = unlimited
        "features": {
            "telegram_notifications": True,
            "daily_reports": True,
            "stock_transfers": True,
            "multi_warehouse": True,
            "excel_export": True,
            "customer_debt_tracking": True,
        },
        "color": "#DC2626",  # red
        "icon": "🏢",
        "sort_order": 4,
    },
}


def get_plan(plan_key: str) -> Optional[dict]:
    """Get plan by key."""
    return PLANS.get(plan_key)


def get_plan_limits(plan_key: str) -> dict:
    """Get just the limits for a plan."""
    plan = PLANS.get(plan_key)
    if not plan:
        plan = PLANS["starter"]
    return {
        "max_users": plan["max_users"],
        "max_products": plan["max_products"],
        "max_warehouses": plan["max_warehouses"],
    }


def apply_plan_to_tenant(tenant, plan_key: str) -> bool:
    """
    Apply plan limits to a tenant object.
    Does NOT commit — caller must commit.
    """
    plan = PLANS.get(plan_key)
    if not plan:
        return False
    
    tenant.subscription_plan = plan_key
    tenant.max_users = plan["max_users"]
    tenant.max_products = plan["max_products"]
    tenant.max_warehouses = plan["max_warehouses"]
    return True


def get_all_plans() -> list:
    """Get all plans for API response."""
    result = []
    for key, plan in PLANS.items():
        result.append({
            "key": key,
            "name": plan["name"],
            "name_uz": plan["name_uz"],
            "description": plan["description"],
            "price_monthly": plan["price_monthly"],
            "price_yearly": plan["price_yearly"],
            "max_users": plan["max_users"],
            "max_products": plan["max_products"],
            "max_warehouses": plan["max_warehouses"],
            "features": plan["features"],
            "color": plan["color"],
            "icon": plan["icon"],
            "unlimited_users": plan["max_users"] <= 0,
            "unlimited_products": plan["max_products"] <= 0,
            "unlimited_warehouses": plan["max_warehouses"] <= 0,
        })
    result.sort(key=lambda x: PLANS[x["key"]]["sort_order"])
    return result
