"""
FastAPI dependencies for authentication and authorization.
Supports multi-tenant and super admin authentication.
"""

from typing import Optional, List
from fastapi import Depends, HTTPException, status, Path, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from database import get_db
from database.models import User, Role, PermissionType, RoleType, Tenant, SuperAdmin
from .security import verify_access_token, is_super_admin_token, TokenData
from .tenant import set_current_tenant, get_current_tenant_id


# HTTP Bearer token scheme
security = HTTPBearer()
optional_security = HTTPBearer(auto_error=False)


from .ip_security import is_ip_in_whitelist, extract_client_ip


# ==================== TENANT RESOLUTION ====================

async def resolve_tenant(
    request: Request,
    tenant_slug: str = Path(..., description="Kompaniya slug (URL identifier)"),
    db: Session = Depends(get_db)
) -> Tenant:
    """
    Resolve tenant from URL path parameter.
    Also checks IP whitelist if configured.
    """
    tenant = db.query(Tenant).filter(
        Tenant.slug == tenant_slug,
        Tenant.is_active == True
    ).first()
    
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Kompaniya topilmadi"
        )
    
    if not tenant.is_subscription_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Kompaniya obunasi faol emas"
        )
    
    # IP whitelist check
    settings_data = tenant.settings or {}
    allowed_ips = settings_data.get("allowed_ips", [])
    if allowed_ips:
        client_ip = extract_client_ip(request)
        if not is_ip_in_whitelist(client_ip, allowed_ips):
            # Generic error — does NOT reveal IP blocking
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Noto'g'ri ma'lumot"
            )
    
    # Set tenant context for this request
    set_current_tenant(tenant.id)
    
    return tenant


# ==================== TENANT USER AUTH ====================

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    tenant: Tenant = Depends(resolve_tenant),
    db: Session = Depends(get_db)
) -> User:
    """
    Get current authenticated user within a tenant context.
    Validates JWT token and ensures user belongs to the resolved tenant.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token yaroqsiz yoki muddati tugagan",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    token = credentials.credentials
    payload = verify_access_token(token)
    
    if payload is None:
        raise credentials_exception
    
    # Ensure this is not a super admin token
    if is_super_admin_token(payload):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super admin tokeni bilan tenant API ga kirish mumkin emas"
        )
    
    user_id = payload.get("sub")
    token_tenant_id = payload.get("tenant_id")
    
    if user_id is None or token_tenant_id is None:
        raise credentials_exception
    
    # Verify token tenant matches URL tenant
    if int(token_tenant_id) != tenant.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Token boshqa kompaniyaga tegishli"
        )
    
    user = db.query(User).filter(
        User.id == int(user_id),
        User.tenant_id == tenant.id
    ).first()
    
    if user is None:
        raise credentials_exception
    
    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """Get current active (non-blocked) user."""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Foydalanuvchi faol emas"
        )
    
    if current_user.is_blocked:
        reason = current_user.blocked_reason or "Sabab ko'rsatilmagan"
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Foydalanuvchi bloklangan: {reason}"
        )
    
    if current_user.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Foydalanuvchi o'chirilgan"
        )
    
    return current_user


# ==================== PERMISSION & ROLE CHECKS ====================

class PermissionChecker:
    """
    Permission checker dependency.
    
    Usage:
        @router.get("/products", dependencies=[Depends(PermissionChecker([PermissionType.PRODUCT_VIEW]))])
    """
    
    def __init__(self, required_permissions: List[PermissionType]):
        self.required_permissions = required_permissions
    
    async def __call__(
        self,
        current_user: User = Depends(get_current_active_user)
    ) -> User:
        if current_user.role.role_type == RoleType.DIRECTOR:
            return current_user
        
        for permission in self.required_permissions:
            if not current_user.has_permission(permission):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Ruxsat yo'q: {permission.value}"
                )
        
        return current_user


class RoleChecker:
    """
    Role checker dependency.
    
    Usage:
        @router.delete("/users/{id}", dependencies=[Depends(RoleChecker([RoleType.DIRECTOR]))])
    """
    
    def __init__(self, allowed_roles: List[RoleType]):
        self.allowed_roles = allowed_roles
    
    async def __call__(
        self,
        current_user: User = Depends(get_current_active_user)
    ) -> User:
        if current_user.role.role_type not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bu amalni bajarish uchun ruxsatingiz yo'q"
            )
        
        return current_user


# Convenience dependencies
async def get_director_user(
    current_user: User = Depends(get_current_active_user)
) -> User:
    """Require director role."""
    if current_user.role.role_type != RoleType.DIRECTOR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Faqat direktor uchun ruxsat berilgan"
        )
    return current_user


async def get_seller_or_above(
    current_user: User = Depends(get_current_active_user)
) -> User:
    """Require seller role or above."""
    allowed = [RoleType.DIRECTOR, RoleType.SELLER]
    if current_user.role.role_type not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Faqat sotuvchi yoki direktor uchun"
        )
    return current_user


async def get_warehouse_manager_or_above(
    current_user: User = Depends(get_current_active_user)
) -> User:
    """Require warehouse manager role or above."""
    allowed = [RoleType.DIRECTOR, RoleType.WAREHOUSE_MANAGER]
    if current_user.role.role_type not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Faqat omborchi yoki direktor uchun"
        )
    return current_user


# ==================== SUPER ADMIN AUTH ====================

async def get_current_super_admin(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> SuperAdmin:
    """
    Get current authenticated super admin.
    Used for /api/v1/super/* endpoints only.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Super admin tokeni yaroqsiz",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    token = credentials.credentials
    payload = verify_access_token(token)
    
    if payload is None:
        raise credentials_exception
    
    if not is_super_admin_token(payload):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Faqat super admin uchun"
        )
    
    admin_id = payload.get("sub")
    if admin_id is None:
        raise credentials_exception
    
    admin = db.query(SuperAdmin).filter(
        SuperAdmin.id == int(admin_id),
        SuperAdmin.is_active == True
    ).first()
    
    if admin is None:
        raise credentials_exception
    
    return admin


# ==================== OPTIONAL AUTH ====================

async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_security),
    db: Session = Depends(get_db)
) -> Optional[User]:
    """Get current user if authenticated, None otherwise."""
    if credentials is None:
        return None
    
    token = credentials.credentials
    payload = verify_access_token(token)
    
    if payload is None or is_super_admin_token(payload):
        return None
    
    user_id = payload.get("sub")
    tenant_id = payload.get("tenant_id")
    if user_id is None or tenant_id is None:
        return None
    
    user = db.query(User).filter(
        User.id == int(user_id),
        User.tenant_id == int(tenant_id),
        User.is_active == True,
        User.is_deleted == False
    ).first()
    
    return user
