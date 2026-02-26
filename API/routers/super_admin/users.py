"""
Super Admin - Tenant Users management.
Endpoint: /api/v1/super/tenants/{tenant_id}/users/...

Allows super admin to view and manage all users of any tenant.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from database.models import Tenant, User, Role, SuperAdmin
from core.dependencies import get_current_super_admin
from core.security import get_password_hash


router = APIRouter()


class TenantUserInfo(BaseModel):
    id: int
    username: str
    first_name: str
    last_name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    role_name: str
    role_type: Optional[str] = None
    is_active: bool
    is_blocked: bool
    created_at: Optional[str] = None

    model_config = {"from_attributes": True}


class TenantUsersResponse(BaseModel):
    tenant_id: int
    tenant_name: str
    users: list[TenantUserInfo]
    total: int


class UpdateUserCredentials(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    is_active: Optional[bool] = None
    is_blocked: Optional[bool] = None


def _get_tenant_or_404(db: Session, tenant_id: int) -> Tenant:
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(404, "Kompaniya topilmadi")
    return tenant


@router.get("/{tenant_id}/users", response_model=TenantUsersResponse)
async def list_tenant_users(
    tenant_id: int,
    admin: SuperAdmin = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    """List all users of a specific tenant with their credentials."""
    tenant = _get_tenant_or_404(db, tenant_id)

    users = (
        db.query(User)
        .filter(User.tenant_id == tenant_id, User.is_deleted == False)
        .order_by(User.id)
        .all()
    )

    return TenantUsersResponse(
        tenant_id=tenant.id,
        tenant_name=tenant.name,
        total=len(users),
        users=[
            TenantUserInfo(
                id=u.id,
                username=u.username,
                first_name=u.first_name,
                last_name=u.last_name,
                phone=u.phone,
                email=u.email,
                role_name=u.role.display_name if u.role else "—",
                role_type=u.role.role_type.value if u.role and u.role.role_type else None,
                is_active=u.is_active,
                is_blocked=u.is_blocked,
                created_at=u.created_at.isoformat() if u.created_at else None,
            )
            for u in users
        ],
    )


@router.put("/{tenant_id}/users/{user_id}")
async def update_tenant_user(
    tenant_id: int,
    user_id: int,
    data: UpdateUserCredentials,
    admin: SuperAdmin = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    """Update user credentials (username, password, etc.)."""
    _get_tenant_or_404(db, tenant_id)

    user = (
        db.query(User)
        .filter(User.id == user_id, User.tenant_id == tenant_id, User.is_deleted == False)
        .first()
    )
    if not user:
        raise HTTPException(404, "Foydalanuvchi topilmadi")

    if data.username is not None:
        # Check uniqueness within tenant
        exists = (
            db.query(User)
            .filter(
                User.tenant_id == tenant_id,
                User.username == data.username,
                User.id != user_id,
                User.is_deleted == False,
            )
            .first()
        )
        if exists:
            raise HTTPException(409, f"'{data.username}' username band")
        user.username = data.username

    if data.password is not None:
        if len(data.password) < 4:
            raise HTTPException(400, "Parol kamida 4 ta belgidan iborat bo'lishi kerak")
        user.password_hash = get_password_hash(data.password)

    if data.first_name is not None:
        user.first_name = data.first_name
    if data.last_name is not None:
        user.last_name = data.last_name
    if data.phone is not None:
        user.phone = data.phone
    if data.is_active is not None:
        user.is_active = data.is_active
    if data.is_blocked is not None:
        user.is_blocked = data.is_blocked

    db.commit()

    return {
        "success": True,
        "message": f"'{user.first_name} {user.last_name}' ma'lumotlari yangilandi",
    }
