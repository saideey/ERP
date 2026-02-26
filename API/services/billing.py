"""
Billing service — manage tenant subscription payments, revenue reports,
and expiration alerts.
"""

from datetime import date, timedelta
from decimal import Decimal
from typing import Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, and_

from database.models import Tenant, TenantBilling


class BillingService:
    def __init__(self, db: Session):
        self.db = db

    # ==================== PAYMENTS CRUD ====================

    def add_payment(
        self, tenant_id: int, amount: float, period_type: str,
        period_start: date, period_end: date, payment_date: date,
        payment_method: str = 'cash', notes: str = None,
        admin_id: int = None,
    ) -> Tuple[bool, str, Optional[TenantBilling]]:
        tenant = self.db.query(Tenant).filter(Tenant.id == tenant_id).first()
        if not tenant:
            return False, "Kompaniya topilmadi", None

        billing = TenantBilling(
            tenant_id=tenant_id,
            amount=Decimal(str(amount)),
            period_type=period_type,
            period_start=period_start,
            period_end=period_end,
            payment_date=payment_date,
            payment_method=payment_method,
            notes=notes,
            status='paid',
            created_by_admin_id=admin_id,
        )
        self.db.add(billing)

        # Update tenant subscription
        tenant.subscription_status = 'active'
        tenant.subscription_ends_at = period_end
        tenant.payment_required = False
        tenant.payment_message = None

        self.db.commit()
        self.db.refresh(billing)
        return True, "To'lov qayd etildi", billing

    def update_payment(
        self, billing_id: int, amount: float = None,
        period_start: date = None, period_end: date = None,
        payment_date: date = None, payment_method: str = None,
        notes: str = None, status: str = None,
    ) -> Tuple[bool, str]:
        billing = self.db.query(TenantBilling).filter(
            TenantBilling.id == billing_id
        ).first()
        if not billing:
            return False, "To'lov topilmadi"

        if amount is not None:
            billing.amount = Decimal(str(amount))
        if period_start is not None:
            billing.period_start = period_start
        if period_end is not None:
            billing.period_end = period_end
            # Also update tenant subscription_ends_at if this is the latest payment
            latest = self.db.query(TenantBilling).filter(
                TenantBilling.tenant_id == billing.tenant_id,
                TenantBilling.status == 'paid',
            ).order_by(TenantBilling.period_end.desc()).first()
            if latest and latest.id == billing.id:
                tenant = self.db.query(Tenant).filter(Tenant.id == billing.tenant_id).first()
                if tenant:
                    tenant.subscription_ends_at = period_end
        if payment_date is not None:
            billing.payment_date = payment_date
        if payment_method is not None:
            billing.payment_method = payment_method
        if notes is not None:
            billing.notes = notes
        if status is not None:
            billing.status = status

        self.db.commit()
        return True, "To'lov yangilandi"

    def delete_payment(self, billing_id: int) -> Tuple[bool, str]:
        billing = self.db.query(TenantBilling).filter(
            TenantBilling.id == billing_id
        ).first()
        if not billing:
            return False, "To'lov topilmadi"

        tenant_id = billing.tenant_id
        self.db.delete(billing)
        self.db.commit()

        # Recalculate tenant subscription_ends_at
        latest = self.db.query(TenantBilling).filter(
            TenantBilling.tenant_id == tenant_id,
            TenantBilling.status == 'paid',
        ).order_by(TenantBilling.period_end.desc()).first()

        tenant = self.db.query(Tenant).filter(Tenant.id == tenant_id).first()
        if tenant:
            tenant.subscription_ends_at = latest.period_end if latest else None
            self.db.commit()

        return True, "To'lov o'chirildi"

    # ==================== QUERIES ====================

    def get_tenant_payments(
        self, tenant_id: int,
        date_from: date = None, date_to: date = None,
    ) -> list:
        q = self.db.query(TenantBilling).filter(
            TenantBilling.tenant_id == tenant_id
        )
        if date_from:
            q = q.filter(TenantBilling.payment_date >= date_from)
        if date_to:
            q = q.filter(TenantBilling.payment_date <= date_to)

        return [self._to_dict(b) for b in q.order_by(TenantBilling.payment_date.desc()).all()]

    def get_tenant_billing_summary(self, tenant_id: int) -> dict:
        """Full billing overview for one tenant."""
        tenant = self.db.query(Tenant).filter(Tenant.id == tenant_id).first()
        if not tenant:
            return {}

        payments = self.db.query(TenantBilling).filter(
            TenantBilling.tenant_id == tenant_id,
            TenantBilling.status == 'paid',
        ).order_by(TenantBilling.period_end.desc()).all()

        total_paid = sum(float(p.amount) for p in payments)
        last_payment = payments[0] if payments else None

        days_left = None
        if tenant.subscription_ends_at:
            ends = tenant.subscription_ends_at
            if hasattr(ends, 'date'):
                ends = ends.date()
            days_left = (ends - date.today()).days

        return {
            "tenant_id": tenant.id,
            "tenant_name": tenant.name,
            "subscription_plan": tenant.subscription_plan,
            "subscription_status": tenant.subscription_status,
            "subscription_ends_at": str(tenant.subscription_ends_at) if tenant.subscription_ends_at else None,
            "days_left": days_left,
            "total_paid": total_paid,
            "payments_count": len(payments),
            "last_payment": self._to_dict(last_payment) if last_payment else None,
            "created_at": str(tenant.created_at),
        }

    # ==================== ALL TENANTS OVERVIEW ====================

    def get_all_tenants_billing(self) -> list:
        """Overview of all tenants with billing info."""
        tenants = self.db.query(Tenant).filter(
            Tenant.is_active == True
        ).order_by(Tenant.name).all()

        result = []
        for t in tenants:
            last_payment = self.db.query(TenantBilling).filter(
                TenantBilling.tenant_id == t.id,
                TenantBilling.status == 'paid',
            ).order_by(TenantBilling.payment_date.desc()).first()

            total_paid = self.db.query(func.sum(TenantBilling.amount)).filter(
                TenantBilling.tenant_id == t.id,
                TenantBilling.status == 'paid',
            ).scalar() or 0

            payments_count = self.db.query(func.count(TenantBilling.id)).filter(
                TenantBilling.tenant_id == t.id,
                TenantBilling.status == 'paid',
            ).scalar() or 0

            days_left = None
            next_payment_due = None
            if t.subscription_ends_at:
                ends = t.subscription_ends_at
                if hasattr(ends, 'date'):
                    ends = ends.date()
                days_left = (ends - date.today()).days
                next_payment_due = str(ends)

            result.append({
                "tenant_id": t.id,
                "tenant_name": t.name,
                "tenant_slug": t.slug,
                "subscription_plan": t.subscription_plan,
                "subscription_status": t.subscription_status,
                "subscription_ends_at": str(t.subscription_ends_at) if t.subscription_ends_at else None,
                "days_left": days_left,
                "next_payment_due": next_payment_due,
                "total_paid": float(total_paid),
                "payments_count": int(payments_count),
                "last_payment_date": str(last_payment.payment_date) if last_payment else None,
                "last_payment_amount": float(last_payment.amount) if last_payment else None,
                "created_at": str(t.created_at),
            })

        return result

    # ==================== EXPIRING ALERTS ====================

    def get_expiring_tenants(self, days_ahead: int = 7) -> list:
        """Get tenants whose subscription expires within N days."""
        today = date.today()
        threshold = today + timedelta(days=days_ahead)

        tenants = self.db.query(Tenant).filter(
            Tenant.is_active == True,
            Tenant.subscription_ends_at != None,
            Tenant.subscription_ends_at <= threshold,
            Tenant.subscription_status.in_(['active', 'trial']),
        ).order_by(Tenant.subscription_ends_at.asc()).all()

        result = []
        for t in tenants:
            ends = t.subscription_ends_at
            if hasattr(ends, 'date'):
                ends = ends.date()
            dl = (ends - today).days
            result.append({
                "tenant_id": t.id,
                "tenant_name": t.name,
                "tenant_slug": t.slug,
                "subscription_plan": t.subscription_plan,
                "subscription_ends_at": str(t.subscription_ends_at),
                "days_left": dl,
                "status": "expired" if dl < 0 else "today" if dl == 0 else f"{dl} kun",
                "is_urgent": dl <= 3,
            })
        return result

    # ==================== REVENUE REPORTS ====================

    def get_revenue_report(
        self, date_from: date = None, date_to: date = None,
        group_by: str = 'monthly',
    ) -> dict:
        """Revenue report with totals and per-tenant breakdown."""
        q = self.db.query(TenantBilling).filter(TenantBilling.status == 'paid')

        if date_from:
            q = q.filter(TenantBilling.payment_date >= date_from)
        if date_to:
            q = q.filter(TenantBilling.payment_date <= date_to)

        all_payments = q.order_by(TenantBilling.payment_date.desc()).all()

        # Total
        total = sum(float(p.amount) for p in all_payments)

        # Group by month/year
        grouped = {}
        for p in all_payments:
            if group_by == 'yearly':
                key = str(p.payment_date.year)
            else:
                key = f"{p.payment_date.year}-{p.payment_date.month:02d}"

            if key not in grouped:
                grouped[key] = 0
            grouped[key] += float(p.amount)

        chart_data = [{"period": k, "amount": v} for k, v in sorted(grouped.items())]

        # Per tenant
        per_tenant = {}
        for p in all_payments:
            tid = p.tenant_id
            if tid not in per_tenant:
                t = self.db.query(Tenant).filter(Tenant.id == tid).first()
                per_tenant[tid] = {
                    "tenant_id": tid,
                    "tenant_name": t.name if t else "?",
                    "total": 0,
                    "count": 0,
                }
            per_tenant[tid]["total"] += float(p.amount)
            per_tenant[tid]["count"] += 1

        tenants_list = sorted(per_tenant.values(), key=lambda x: x["total"], reverse=True)

        return {
            "total_revenue": total,
            "payments_count": len(all_payments),
            "chart": chart_data,
            "per_tenant": tenants_list,
            "date_from": str(date_from) if date_from else None,
            "date_to": str(date_to) if date_to else None,
        }

    # ==================== HELPERS ====================

    def _to_dict(self, b: TenantBilling) -> dict:
        return {
            "id": b.id,
            "tenant_id": b.tenant_id,
            "amount": float(b.amount),
            "currency": b.currency,
            "period_type": b.period_type,
            "period_start": str(b.period_start),
            "period_end": str(b.period_end),
            "payment_date": str(b.payment_date),
            "payment_method": b.payment_method,
            "notes": b.notes,
            "status": b.status,
            "created_at": str(b.created_at),
        }
