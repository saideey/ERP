"""
Authentication router.
Handles login, logout, token refresh, password change.
All endpoints are tenant-scoped via URL path: /api/v1/{tenant_slug}/auth/...
"""

from fastapi import APIRouter, Depends, HTTPException, status, Path
from sqlalchemy.orm import Session

from database import get_db
from database.models import User, Tenant
from core.dependencies import get_current_active_user, resolve_tenant
from core.tenant import set_current_tenant
from schemas.auth import (
    LoginRequest,
    LoginResponse,
    TokenResponse,
    RefreshTokenRequest,
    ChangePasswordRequest,
    UserInfo,
    LogoutResponse,
)
from schemas.base import SuccessResponse, ErrorResponse
from services.auth import AuthService


router = APIRouter()


@router.post(
    "/login",
    response_model=LoginResponse,
    responses={
        401: {"model": ErrorResponse, "description": "Invalid credentials"},
        403: {"model": ErrorResponse, "description": "User blocked or inactive"},
    }
)
async def login(
    data: LoginRequest,
    tenant: Tenant = Depends(resolve_tenant),
    db: Session = Depends(get_db)
):
    """
    Login with username and password within a tenant context.
    Tenant is resolved from URL path: /api/v1/{tenant_slug}/auth/login
    """
    auth_service = AuthService(db)
    
    # Authenticate user within this tenant
    user = auth_service.authenticate_user(data.username, data.password, tenant.id)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Username yoki parol noto'g'ri"
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Foydalanuvchi faol emas"
        )
    
    if user.is_blocked:
        reason = user.blocked_reason or "Sabab ko'rsatilmagan"
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Foydalanuvchi bloklangan: {reason}"
        )
    
    tokens = auth_service.create_tokens(user, tenant.id)
    user_info = auth_service.get_user_info(user, tenant)
    
    return LoginResponse(
        success=True,
        message="Muvaffaqiyatli kirdingiz",
        user=user_info,
        tokens=tokens
    )


@router.post(
    "/refresh",
    response_model=TokenResponse,
    responses={
        401: {"model": ErrorResponse, "description": "Invalid refresh token"},
    }
)
async def refresh_token(
    data: RefreshTokenRequest,
    tenant: Tenant = Depends(resolve_tenant),
    db: Session = Depends(get_db)
):
    """Refresh access token using refresh token."""
    auth_service = AuthService(db)
    
    tokens = auth_service.refresh_tokens(data.refresh_token, tenant.id)
    
    if not tokens:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token yaroqsiz yoki muddati tugagan"
        )
    
    return tokens


@router.post(
    "/logout",
    response_model=LogoutResponse
)
async def logout(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Logout current user."""
    auth_service = AuthService(db)
    auth_service.logout(current_user.id, "")
    
    return LogoutResponse()


@router.get(
    "/me",
    response_model=UserInfo
)
async def get_current_user_info(
    current_user: User = Depends(get_current_active_user),
    tenant: Tenant = Depends(resolve_tenant),
    db: Session = Depends(get_db)
):
    """Get current authenticated user info."""
    auth_service = AuthService(db)
    return auth_service.get_user_info(current_user, tenant)


@router.post(
    "/change-password",
    response_model=SuccessResponse,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid current password"},
    }
)
async def change_password(
    data: ChangePasswordRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Change current user's password."""
    auth_service = AuthService(db)
    
    success, message = auth_service.change_password(
        current_user,
        data.current_password,
        data.new_password
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message
        )
    
    return SuccessResponse(message=message)
