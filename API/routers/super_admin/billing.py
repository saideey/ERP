"""
Super Admin — Billing & Revenue management.
Endpoint: /api/v1/super/billing/...
"""

from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from database.models import SuperAdmin
from core.dependencies import get_current_super_admin
from services.billing import BillingService

router = APIRouter(tags=["Super Admin Billing"])


# ==================== SCHEMAS ====================

class AddPaymentBody(BaseModel):
    tenant_id: int
    amount: float
    period_type: str = "monthly"  # monthly, yearly
    period_start: str  # YYYY-MM-DD
    period_end: str
    payment_date: str
    payment_method: str = "cash"
    notes: Optional[str] = None


class UpdatePaymentBody(BaseModel):
    amount: Optional[float] = None
    period_start: Optional[str] = None
    period_end: Optional[str] = None
    payment_date: Optional[str] = None
    payment_method: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None


# ==================== ENDPOINTS ====================

@router.get("/overview")
async def get_all_tenants_billing(
    admin: SuperAdmin = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Overview of all tenants with billing status."""
    service = BillingService(db)
    data = service.get_all_tenants_billing()
    return {"data": data, "count": len(data)}


@router.get("/expiring")
async def get_expiring_tenants(
    days: int = Query(7, description="Days ahead to check"),
    admin: SuperAdmin = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Get tenants with expiring subscriptions."""
    service = BillingService(db)
    data = service.get_expiring_tenants(days)
    return {"data": data, "count": len(data)}


@router.get("/revenue")
async def get_revenue_report(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    group_by: str = Query("monthly"),
    admin: SuperAdmin = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Revenue report with chart data and per-tenant breakdown."""
    service = BillingService(db)
    df = _parse_date(date_from)
    dt = _parse_date(date_to)
    return service.get_revenue_report(df, dt, group_by)


@router.get("/tenant/{tenant_id}")
async def get_tenant_billing(
    tenant_id: int,
    admin: SuperAdmin = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Get billing summary for a specific tenant."""
    service = BillingService(db)
    return service.get_tenant_billing_summary(tenant_id)


@router.get("/tenant/{tenant_id}/payments")
async def get_tenant_payments(
    tenant_id: int,
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    admin: SuperAdmin = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Get payment history for a tenant."""
    service = BillingService(db)
    df = _parse_date(date_from)
    dt = _parse_date(date_to)
    return {"data": service.get_tenant_payments(tenant_id, df, dt)}


@router.post("/payments")
async def add_payment(
    body: AddPaymentBody,
    admin: SuperAdmin = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Record a new payment for a tenant."""
    service = BillingService(db)
    ok, msg, billing = service.add_payment(
        tenant_id=body.tenant_id,
        amount=body.amount,
        period_type=body.period_type,
        period_start=_parse_date(body.period_start),
        period_end=_parse_date(body.period_end),
        payment_date=_parse_date(body.payment_date),
        payment_method=body.payment_method,
        notes=body.notes,
        admin_id=admin.id,
    )
    if not ok:
        raise HTTPException(400, msg)
    return {"success": True, "message": msg, "id": billing.id}


@router.put("/payments/{billing_id}")
async def update_payment(
    billing_id: int,
    body: UpdatePaymentBody,
    admin: SuperAdmin = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Update an existing payment."""
    service = BillingService(db)
    kwargs = {}
    if body.amount is not None:
        kwargs['amount'] = body.amount
    if body.period_start:
        kwargs['period_start'] = _parse_date(body.period_start)
    if body.period_end:
        kwargs['period_end'] = _parse_date(body.period_end)
    if body.payment_date:
        kwargs['payment_date'] = _parse_date(body.payment_date)
    if body.payment_method:
        kwargs['payment_method'] = body.payment_method
    if body.notes is not None:
        kwargs['notes'] = body.notes
    if body.status:
        kwargs['status'] = body.status

    ok, msg = service.update_payment(billing_id, **kwargs)
    if not ok:
        raise HTTPException(400, msg)
    return {"success": True, "message": msg}


@router.delete("/payments/{billing_id}")
async def delete_payment(
    billing_id: int,
    admin: SuperAdmin = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Delete a payment record."""
    service = BillingService(db)
    ok, msg = service.delete_payment(billing_id)
    if not ok:
        raise HTTPException(400, msg)
    return {"success": True, "message": msg}


def _parse_date(s: Optional[str]) -> Optional[date]:
    if not s:
        return None
    try:
        return date.fromisoformat(s[:10])
    except Exception:
        return None
