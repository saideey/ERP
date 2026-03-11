"""
Expenses router — CRUD for expense categories and expenses + Net Profit report.
"""

import os
from typing import Optional
from decimal import Decimal
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, case, and_, extract

from database import get_db
from database.models import (
    User, PermissionType, ExpenseCategory,
    CashTransaction, TransactionType, CashRegister, Sale, SaleItem
)
from core.dependencies import get_current_active_user, PermissionChecker

router = APIRouter()


def get_tashkent_today():
    from datetime import timezone
    tz = timezone(timedelta(hours=5))
    return datetime.now(tz).date()


# ==================== EXPENSE CATEGORIES ====================

@router.get(
    "/categories",
    summary="Chiqim kategoriyalari",
    dependencies=[Depends(PermissionChecker([PermissionType.FINANCE_VIEW]))]
)
async def list_expense_categories(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    cats = db.query(ExpenseCategory).filter(
        ExpenseCategory.tenant_id == current_user.tenant_id,
        ExpenseCategory.is_active == True,
    ).order_by(ExpenseCategory.name).all()

    return {
        "categories": [
            {"id": c.id, "name": c.name, "description": c.description}
            for c in cats
        ]
    }


@router.post(
    "/categories",
    summary="Yangi kategoriya",
    dependencies=[Depends(PermissionChecker([PermissionType.FINANCE_MANAGE]))]
)
async def create_expense_category(
    body: dict,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "Nom kiritilmagan")

    existing = db.query(ExpenseCategory).filter(
        ExpenseCategory.tenant_id == current_user.tenant_id,
        ExpenseCategory.name == name,
    ).first()
    if existing:
        raise HTTPException(409, "Bu kategoriya allaqachon mavjud")

    cat = ExpenseCategory(
        tenant_id=current_user.tenant_id,
        name=name,
        description=body.get("description", ""),
    )
    db.add(cat)
    db.commit()
    return {"success": True, "id": cat.id, "name": cat.name}


@router.delete(
    "/categories/{cat_id}",
    summary="Kategoriya o'chirish",
    dependencies=[Depends(PermissionChecker([PermissionType.FINANCE_MANAGE]))]
)
async def delete_expense_category(
    cat_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    cat = db.query(ExpenseCategory).filter(
        ExpenseCategory.id == cat_id,
        ExpenseCategory.tenant_id == current_user.tenant_id,
    ).first()
    if not cat:
        raise HTTPException(404, "Kategoriya topilmadi")
    cat.is_active = False
    db.commit()
    return {"success": True}


# ==================== EXPENSES (Cash Transactions) ====================

@router.get(
    "",
    summary="Chiqimlar ro'yxati",
    dependencies=[Depends(PermissionChecker([PermissionType.FINANCE_VIEW]))]
)
async def list_expenses(
    category_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(30, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """List expenses (CashTransactions with type EXPENSE, SALARY, SUPPLIER_PAYMENT)."""
    expense_types = [
        TransactionType.EXPENSE,
        TransactionType.SALARY,
        TransactionType.SUPPLIER_PAYMENT,
    ]

    query = db.query(CashTransaction).join(CashRegister).filter(
        CashRegister.tenant_id == current_user.tenant_id,
        CashTransaction.transaction_type.in_(expense_types),
    )

    if category_id:
        query = query.filter(CashTransaction.category_id == category_id)

    if start_date:
        query = query.filter(CashTransaction.created_at >= start_date)
    if end_date:
        query = query.filter(CashTransaction.created_at <= end_date + " 23:59:59")

    total = query.count()

    expenses = query.order_by(CashTransaction.created_at.desc())\
        .offset((page - 1) * per_page).limit(per_page).all()

    # Category totals
    totals_query = db.query(
        func.sum(func.abs(CashTransaction.amount))
    ).join(CashRegister).filter(
        CashRegister.tenant_id == current_user.tenant_id,
        CashTransaction.transaction_type.in_(expense_types),
    )
    if start_date:
        totals_query = totals_query.filter(CashTransaction.created_at >= start_date)
    if end_date:
        totals_query = totals_query.filter(CashTransaction.created_at <= end_date + " 23:59:59")

    total_amount = float(totals_query.scalar() or 0)

    return {
        "expenses": [
            {
                "id": e.id,
                "amount": float(abs(e.amount)),
                "description": e.description,
                "transaction_type": e.transaction_type.value,
                "category_id": e.category_id,
                "category_name": e.category.name if e.category else None,
                "created_at": str(e.created_at),
                "created_by": e.created_by.first_name + " " + e.created_by.last_name if e.created_by else None,
            }
            for e in expenses
        ],
        "total": total,
        "total_amount": total_amount,
        "page": page,
        "per_page": per_page,
    }


@router.post(
    "",
    summary="Yangi chiqim qo'shish",
    dependencies=[Depends(PermissionChecker([PermissionType.FINANCE_MANAGE]))]
)
async def create_expense(
    body: dict,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    amount = float(body.get("amount", 0))
    if amount <= 0:
        raise HTTPException(400, "Summa 0 dan katta bo'lishi kerak")

    description = (body.get("description") or "").strip()
    category_id = body.get("category_id")
    expense_type = body.get("type", "expense")

    type_map = {
        "expense": TransactionType.EXPENSE,
        "salary": TransactionType.SALARY,
        "supplier_payment": TransactionType.SUPPLIER_PAYMENT,
    }
    tx_type = type_map.get(expense_type, TransactionType.EXPENSE)

    # Get or create default cash register
    register = db.query(CashRegister).filter(
        CashRegister.tenant_id == current_user.tenant_id,
        CashRegister.is_active == True,
    ).first()

    if not register:
        from database.models import Warehouse
        warehouse = db.query(Warehouse).filter(
            Warehouse.tenant_id == current_user.tenant_id,
            Warehouse.is_active == True,
        ).first()
        if not warehouse:
            raise HTTPException(400, "Ombor topilmadi. Avval ombor yarating.")

        register = CashRegister(
            tenant_id=current_user.tenant_id,
            name="Asosiy kassa",
            warehouse_id=warehouse.id,
            is_active=True,
            current_balance=Decimal("0"),
        )
        db.add(register)
        db.flush()

    balance_before = register.current_balance or Decimal("0")
    register.current_balance = balance_before - Decimal(str(amount))

    tx = CashTransaction(
        tenant_id=current_user.tenant_id,
        cash_register_id=register.id,
        transaction_type=tx_type,
        amount=-Decimal(str(amount)),
        balance_before=balance_before,
        balance_after=register.current_balance,
        description=description,
        category_id=category_id,
        created_by_id=current_user.id,
    )
    db.add(tx)
    db.commit()

    return {
        "success": True,
        "id": tx.id,
        "amount": amount,
        "balance_after": float(register.current_balance),
    }


@router.delete(
    "/{expense_id}",
    summary="Chiqimni o'chirish",
    dependencies=[Depends(PermissionChecker([PermissionType.FINANCE_MANAGE]))]
)
async def delete_expense(
    expense_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    tx = db.query(CashTransaction).join(CashRegister).filter(
        CashTransaction.id == expense_id,
        CashRegister.tenant_id == current_user.tenant_id,
    ).first()
    if not tx:
        raise HTTPException(404, "Chiqim topilmadi")

    # Restore balance
    register = tx.cash_register
    register.current_balance = (register.current_balance or Decimal("0")) + abs(tx.amount)
    db.delete(tx)
    db.commit()
    return {"success": True}


# ==================== NET PROFIT REPORT ====================

@router.get(
    "/net-profit",
    summary="Sof foyda hisoboti",
    dependencies=[Depends(PermissionChecker([PermissionType.REPORT_PROFIT]))]
)
async def net_profit_report(
    period: str = Query("month", regex="^(today|week|month|year|custom)$"),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Net profit = Gross Profit - Total Expenses
    Gross Profit = Total Revenue - Cost of Goods Sold (COGS)
    """
    tenant_id = current_user.tenant_id
    today = get_tashkent_today()

    if period == "today":
        d_start = today
        d_end = today
    elif period == "week":
        d_start = today - timedelta(days=today.weekday())
        d_end = today
    elif period == "month":
        d_start = today.replace(day=1)
        d_end = today
    elif period == "year":
        d_start = today.replace(month=1, day=1)
        d_end = today
    else:
        d_start = date.fromisoformat(start_date) if start_date else today.replace(day=1)
        d_end = date.fromisoformat(end_date) if end_date else today

    start_str = d_start.isoformat()
    end_str = d_end.isoformat() + " 23:59:59"

    # 1. Sales revenue & COGS
    sales_data = db.query(
        func.sum(Sale.total_amount).label('revenue'),
        func.count(Sale.id).label('sales_count'),
    ).filter(
        Sale.tenant_id == tenant_id,
        Sale.created_at >= start_str,
        Sale.created_at <= end_str,
        Sale.is_cancelled == False,
    ).first()

    revenue = float(sales_data.revenue or 0)
    sales_count = int(sales_data.sales_count or 0)

    # COGS from sale items
    cogs = db.query(
        func.sum(SaleItem.unit_cost * SaleItem.base_quantity)
    ).join(Sale).filter(
        Sale.tenant_id == tenant_id,
        Sale.created_at >= start_str,
        Sale.created_at <= end_str,
        Sale.is_cancelled == False,
    ).scalar()
    cogs = float(cogs or 0)

    gross_profit = revenue - cogs

    # 2. Expenses
    expense_types = [
        TransactionType.EXPENSE,
        TransactionType.SALARY,
        TransactionType.SUPPLIER_PAYMENT,
    ]

    expenses_by_category = db.query(
        ExpenseCategory.name,
        func.sum(func.abs(CashTransaction.amount)).label('total'),
    ).join(
        CashTransaction, CashTransaction.category_id == ExpenseCategory.id
    ).join(CashRegister).filter(
        CashRegister.tenant_id == tenant_id,
        CashTransaction.transaction_type.in_(expense_types),
        CashTransaction.created_at >= start_str,
        CashTransaction.created_at <= end_str,
    ).group_by(ExpenseCategory.name).all()

    # Uncategorized expenses
    uncategorized = db.query(
        func.sum(func.abs(CashTransaction.amount))
    ).join(CashRegister).filter(
        CashRegister.tenant_id == tenant_id,
        CashTransaction.transaction_type.in_(expense_types),
        CashTransaction.category_id == None,
        CashTransaction.created_at >= start_str,
        CashTransaction.created_at <= end_str,
    ).scalar()

    category_breakdown = [
        {"name": name, "amount": float(total)}
        for name, total in expenses_by_category
    ]
    if uncategorized and float(uncategorized) > 0:
        category_breakdown.append({"name": "Boshqa", "amount": float(uncategorized)})

    total_expenses = sum(c["amount"] for c in category_breakdown)
    net_profit = gross_profit - total_expenses

    # 3. Daily breakdown
    daily_data = []
    current = d_start
    while current <= d_end:
        day_str = current.isoformat()
        day_end = day_str + " 23:59:59"

        day_rev = db.query(func.sum(Sale.total_amount)).filter(
            Sale.tenant_id == tenant_id,
            Sale.created_at >= day_str,
            Sale.created_at <= day_end,
            Sale.is_cancelled == False,
        ).scalar()

        day_cogs = db.query(
            func.sum(SaleItem.unit_cost * SaleItem.base_quantity)
        ).join(Sale).filter(
            Sale.tenant_id == tenant_id,
            Sale.created_at >= day_str,
            Sale.created_at <= day_end,
            Sale.is_cancelled == False,
        ).scalar()

        day_exp = db.query(
            func.sum(func.abs(CashTransaction.amount))
        ).join(CashRegister).filter(
            CashRegister.tenant_id == tenant_id,
            CashTransaction.transaction_type.in_(expense_types),
            CashTransaction.created_at >= day_str,
            CashTransaction.created_at <= day_end,
        ).scalar()

        dr = float(day_rev or 0)
        dc = float(day_cogs or 0)
        de = float(day_exp or 0)

        if dr > 0 or de > 0:
            daily_data.append({
                "date": day_str,
                "revenue": dr,
                "cogs": dc,
                "gross_profit": dr - dc,
                "expenses": de,
                "net_profit": (dr - dc) - de,
            })

        current += timedelta(days=1)

    return {
        "period": {"start": d_start.isoformat(), "end": d_end.isoformat(), "type": period},
        "revenue": revenue,
        "cogs": cogs,
        "gross_profit": gross_profit,
        "total_expenses": total_expenses,
        "net_profit": net_profit,
        "margin_percent": round((net_profit / revenue * 100), 1) if revenue > 0 else 0,
        "sales_count": sales_count,
        "expense_breakdown": category_breakdown,
        "daily": daily_data,
    }
