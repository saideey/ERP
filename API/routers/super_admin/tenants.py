"""
Super Admin - Tenant (Company) management router.
Endpoint: /api/v1/super/tenants/...
"""

import os
import uuid
import shutil
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from sqlalchemy.orm import Session

from database import get_db
from database.models import Tenant, SuperAdmin
from core.dependencies import get_current_super_admin
from schemas.tenant import (
    TenantCreate, TenantUpdate, TenantResponse, 
    TenantListResponse, TenantPublicInfo
)
from services.tenant import TenantService


router = APIRouter()


@router.get("", response_model=TenantListResponse)
async def list_tenants(
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    subscription_status: Optional[str] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    admin: SuperAdmin = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    """List all tenants with filtering and pagination."""
    service = TenantService(db)
    tenants, total = service.list_tenants(
        search=search,
        is_active=is_active,
        subscription_status=subscription_status,
        page=page,
        per_page=per_page
    )
    
    return TenantListResponse(
        data=[service.to_response(t) for t in tenants],
        total=total
    )


@router.post("", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
async def create_tenant(
    data: TenantCreate,
    admin: SuperAdmin = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    """
    Create new tenant (company) with initial admin user.
    
    This will:
    1. Create the tenant record
    2. Create default roles (Director, Seller, Warehouse Manager, Accountant)
    3. Create default UOMs (kg, tonna, dona, metr, m²)
    4. Create default warehouse
    5. Create admin user (director role)
    """
    service = TenantService(db)
    
    # Check slug uniqueness
    if service.slug_exists(data.slug):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"'{data.slug}' slug allaqachon band"
        )
    
    tenant = service.create_tenant(data)
    return service.to_response(tenant)


# ==================== SUBSCRIPTION PLANS (must be before /{tenant_id}) ====================

@router.get("/plans/all")
async def get_subscription_plans(
    admin: SuperAdmin = Depends(get_current_super_admin),
):
    """Get all available subscription plans."""
    from core.subscription_plans import get_all_plans
    return {"plans": get_all_plans()}


@router.get("/{tenant_id}", response_model=TenantResponse)
async def get_tenant(
    tenant_id: int,
    admin: SuperAdmin = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    """Get tenant details by ID."""
    service = TenantService(db)
    tenant = service.get_tenant(tenant_id)
    
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Kompaniya topilmadi"
        )
    
    return service.to_response(tenant)


@router.put("/{tenant_id}", response_model=TenantResponse)
async def update_tenant(
    tenant_id: int,
    data: TenantUpdate,
    admin: SuperAdmin = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    """Update tenant info."""
    service = TenantService(db)
    tenant = service.update_tenant(tenant_id, data)
    
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Kompaniya topilmadi"
        )
    
    return service.to_response(tenant)


@router.post("/{tenant_id}/suspend")
async def suspend_tenant(
    tenant_id: int,
    admin: SuperAdmin = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    """Suspend a tenant (disable access)."""
    service = TenantService(db)
    tenant = service.suspend_tenant(tenant_id)
    
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Kompaniya topilmadi"
        )
    
    return {"success": True, "message": f"'{tenant.name}' to'xtatildi"}


@router.post("/{tenant_id}/activate")
async def activate_tenant(
    tenant_id: int,
    admin: SuperAdmin = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    """Activate a suspended tenant."""
    service = TenantService(db)
    tenant = service.activate_tenant(tenant_id)
    
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Kompaniya topilmadi"
        )
    
    return {"success": True, "message": f"'{tenant.name}' faollashtirildi"}


@router.delete("/{tenant_id}")
async def delete_tenant(
    tenant_id: int,
    admin: SuperAdmin = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    """Soft delete a tenant."""
    service = TenantService(db)
    success = service.delete_tenant(tenant_id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Kompaniya topilmadi"
        )
    
    return {"success": True, "message": "Kompaniya o'chirildi"}


# ==================== LOGO UPLOAD ====================

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/svg+xml"}
MAX_LOGO_SIZE = 2 * 1024 * 1024  # 2MB


@router.post("/{tenant_id}/logo")
async def upload_logo(
    tenant_id: int,
    file: UploadFile = File(...),
    admin: SuperAdmin = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    """Upload company logo."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(404, "Kompaniya topilmadi")
    
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(400, "Faqat JPG, PNG, WebP, SVG formatlar qabul qilinadi")
    
    contents = await file.read()
    if len(contents) > MAX_LOGO_SIZE:
        raise HTTPException(400, "Fayl hajmi 2MB dan oshmasligi kerak")
    
    # Save file
    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "png"
    filename = f"{tenant.slug}_{uuid.uuid4().hex[:8]}.{ext}"
    filepath = f"/app/uploads/logos/{filename}"
    
    # Delete old logo
    if tenant.logo_url:
        old_path = f"/app{tenant.logo_url}"
        if os.path.exists(old_path):
            os.remove(old_path)
    
    with open(filepath, "wb") as f:
        f.write(contents)
    
    tenant.logo_url = f"/uploads/logos/{filename}"
    db.commit()
    
    return {"success": True, "logo_url": tenant.logo_url}


@router.delete("/{tenant_id}/logo")
async def delete_logo(
    tenant_id: int,
    admin: SuperAdmin = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    """Delete company logo."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(404, "Kompaniya topilmadi")
    
    if tenant.logo_url:
        old_path = f"/app{tenant.logo_url}"
        if os.path.exists(old_path):
            os.remove(old_path)
        tenant.logo_url = None
        db.commit()
    
    return {"success": True}


# ==================== PAYMENT NOTIFICATION ====================

@router.post("/{tenant_id}/payment-notify")
async def set_payment_notification(
    tenant_id: int,
    body: dict,
    admin: SuperAdmin = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    """
    Set payment notification for tenant.
    When enabled, all tenant users see a payment overlay.
    body: { "enabled": true/false, "message": "optional custom message" }
    """
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(404, "Kompaniya topilmadi")
    
    tenant.payment_required = body.get("enabled", False)
    tenant.payment_message = body.get("message", "")
    db.commit()
    
    state = "yoqildi" if tenant.payment_required else "o'chirildi"
    return {"success": True, "message": f"To'lov ogohlantirishi {state}"}


# ==================== SUBSCRIPTION PLANS ====================




@router.post("/{tenant_id}/change-plan")
async def change_tenant_plan(
    tenant_id: int,
    body: dict,
    admin: SuperAdmin = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    """
    Change tenant's subscription plan.
    Automatically updates all limits (max_users, max_products, max_warehouses).
    
    body: {"plan": "business"}
    """
    from core.subscription_plans import apply_plan_to_tenant, PLANS
    
    plan_key = body.get("plan", "")
    if plan_key not in PLANS:
        raise HTTPException(400, f"Noto'g'ri tarif: {plan_key}. Mavjud: {', '.join(PLANS.keys())}")
    
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(404, "Kompaniya topilmadi")
    
    old_plan = tenant.subscription_plan
    apply_plan_to_tenant(tenant, plan_key)
    db.commit()
    
    plan = PLANS[plan_key]
    return {
        "success": True,
        "message": f"Tarif o'zgartirildi: {old_plan} → {plan_key}",
        "plan": plan_key,
        "limits": {
            "max_users": plan["max_users"],
            "max_products": plan["max_products"],
            "max_warehouses": plan["max_warehouses"],
        }
    }


@router.get("/{tenant_id}/usage")
async def get_tenant_usage(
    tenant_id: int,
    admin: SuperAdmin = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    """Get tenant's current resource usage vs limits."""
    from services.tenant_limits import get_tenant_usage as get_usage
    
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(404, "Kompaniya topilmadi")
    
    usage = get_usage(db, tenant_id)
    return {
        "tenant_id": tenant_id,
        "tenant_name": tenant.name,
        "plan": tenant.subscription_plan,
        "usage": usage
    }


# ==================== FEATURE TOGGLES ====================

DEFAULT_FEATURES = {
    "partners": True,
    "customers": True,
    "daily_report": True,
    "reports": True,
}


@router.get("/{tenant_id}/features")
async def get_tenant_features(
    tenant_id: int,
    admin: SuperAdmin = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    """Get tenant's feature toggles."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(404, "Kompaniya topilmadi")

    settings = tenant.settings or {}
    features = {**DEFAULT_FEATURES, **(settings.get('features', {}))}
    return {"tenant_id": tenant_id, "features": features}


@router.put("/{tenant_id}/features")
async def update_tenant_features(
    tenant_id: int,
    body: dict,
    admin: SuperAdmin = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    """Update tenant's feature toggles. Body: { "partners": true/false, ... }"""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(404, "Kompaniya topilmadi")

    settings = dict(tenant.settings) if tenant.settings else {}
    current_features = settings.get('features', {})
    # Only allow known features
    for key in DEFAULT_FEATURES:
        if key in body:
            current_features[key] = bool(body[key])

    settings['features'] = current_features
    tenant.settings = settings
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(tenant, 'settings')
    db.commit()

    return {"success": True, "features": current_features}


# ==================== TENANT IP WHITELIST ====================

@router.get("/{tenant_id}/allowed-ips")
async def get_tenant_allowed_ips(
    tenant_id: int,
    admin: SuperAdmin = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    """Get tenant's IP whitelist."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(404, "Kompaniya topilmadi")

    settings = tenant.settings or {}
    return {
        "tenant_id": tenant_id,
        "allowed_ips": settings.get("allowed_ips", []),
        "ip_restriction_enabled": bool(settings.get("allowed_ips"))
    }


@router.put("/{tenant_id}/allowed-ips")
async def update_tenant_allowed_ips(
    tenant_id: int,
    body: dict,
    admin: SuperAdmin = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    """
    Update tenant's IP whitelist.
    Body: { "allowed_ips": ["203.0.113.50", "10.0.0.0/8", "192.168.1.*"] }
    Empty list = no restriction.
    """
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(404, "Kompaniya topilmadi")

    allowed_ips = body.get("allowed_ips", [])
    # Validate each entry
    import ipaddress as _ipa
    validated = []
    for entry in allowed_ips:
        entry = str(entry).strip()
        if not entry:
            continue
        # Allow wildcards
        if "*" in entry:
            validated.append(entry)
            continue
        # Allow CIDR
        if "/" in entry:
            try:
                _ipa.ip_network(entry, strict=False)
                validated.append(entry)
            except ValueError:
                raise HTTPException(400, f"Noto'g'ri IP format: {entry}")
            continue
        # Exact IP
        try:
            _ipa.ip_address(entry)
            validated.append(entry)
        except ValueError:
            raise HTTPException(400, f"Noto'g'ri IP format: {entry}")

    from sqlalchemy.orm.attributes import flag_modified
    settings = dict(tenant.settings) if tenant.settings else {}
    settings["allowed_ips"] = validated
    tenant.settings = settings
    flag_modified(tenant, 'settings')
    db.commit()

    return {
        "success": True,
        "allowed_ips": validated,
        "ip_restriction_enabled": bool(validated)
    }
