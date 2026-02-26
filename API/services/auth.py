"""
Authentication service.
Handles login, logout, token management.
Multi-tenant: authenticates users within their tenant scope.
"""

from datetime import datetime, timedelta
from typing import Optional, Tuple
from sqlalchemy.orm import Session

from database.models import User, UserSession, AuditLog, Tenant
from core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    verify_refresh_token,
    TokenData,
)
from core.config import settings
from schemas.auth import LoginRequest, TokenResponse, UserInfo
from utils.helpers import get_tashkent_now


class AuthService:
    """Authentication service class."""
    
    def __init__(self, db: Session):
        self.db = db
    
    def authenticate_user(self, username: str, password: str, tenant_id: int) -> Optional[User]:
        """
        Authenticate user with username and password within a tenant.
        
        Args:
            username: Username
            password: Plain text password
            tenant_id: Tenant ID (from URL path)
        """
        user = self.db.query(User).filter(
            User.username == username.lower().strip(),
            User.tenant_id == tenant_id,
            User.is_deleted == False
        ).first()
        
        if not user:
            return None
        
        if not verify_password(password, user.password_hash):
            user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
            self.db.commit()
            return None
        
        # Reset failed attempts on successful login
        user.failed_login_attempts = 0
        user.last_login = get_tashkent_now().isoformat()
        self.db.commit()
        
        return user
    
    def create_tokens(self, user: User, tenant_id: int) -> TokenResponse:
        """
        Create access and refresh tokens for user.
        Now includes tenant_id in the JWT payload.
        """
        token_data = TokenData(
            user_id=user.id,
            tenant_id=tenant_id,
            username=user.username,
            role_id=user.role_id,
            role_type=user.role.role_type.value if user.role.role_type else "unknown"
        )
        
        access_token = create_access_token(token_data.to_dict())
        refresh_token = create_refresh_token(token_data.to_dict())
        
        # Store session
        self._create_session(user.id, tenant_id, refresh_token)
        
        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            expires_in=settings.access_token_expire_minutes * 60
        )
    
    def refresh_tokens(self, refresh_token: str, tenant_id: int) -> Optional[TokenResponse]:
        """Refresh access token using refresh token."""
        payload = verify_refresh_token(refresh_token)
        if not payload:
            return None
        
        user_id = payload.get("sub")
        token_tenant_id = payload.get("tenant_id")
        
        if not user_id or not token_tenant_id:
            return None
        
        # Verify tenant matches
        if int(token_tenant_id) != tenant_id:
            return None
        
        user = self.db.query(User).filter(
            User.id == int(user_id),
            User.tenant_id == tenant_id,
            User.is_active == True,
            User.is_deleted == False
        ).first()
        
        if not user:
            return None
        
        # Invalidate old session
        self._invalidate_session(refresh_token)
        
        # Create new tokens
        return self.create_tokens(user, tenant_id)
    
    def logout(self, user_id: int, token: str) -> bool:
        """Logout user and invalidate all sessions."""
        self.db.query(UserSession).filter(
            UserSession.user_id == user_id,
            UserSession.is_active == True
        ).update({"is_active": False})
        
        self.db.commit()
        return True
    
    def get_user_info(self, user: User, tenant: Tenant = None) -> UserInfo:
        """Get user info for response. Includes tenant info."""
        return UserInfo(
            id=user.id,
            username=user.username,
            email=user.email,
            first_name=user.first_name,
            last_name=user.last_name,
            phone=user.phone,
            avatar_url=user.avatar_url,
            role_id=user.role_id,
            role_name=user.role.display_name,
            role_type=user.role.role_type.value if user.role.role_type else "unknown",
            permissions=user.role.permissions or [],
            max_discount_percent=user.role.max_discount_percent,
            assigned_warehouse_id=user.assigned_warehouse_id,
            assigned_warehouse_name=user.assigned_warehouse.name if user.assigned_warehouse else None,
            tenant_id=user.tenant_id,
            tenant_name=tenant.name if tenant else None,
            tenant_slug=tenant.slug if tenant else None,
            tenant_logo_url=tenant.logo_url if tenant else None,
            payment_required=tenant.payment_required if tenant else False,
            payment_message=tenant.payment_message if tenant else None,
            tenant_features=tenant.settings.get('features', {}) if tenant and tenant.settings else {},
        )
    
    def change_password(
        self,
        user: User,
        current_password: str,
        new_password: str
    ) -> Tuple[bool, str]:
        """Change user password."""
        if not verify_password(current_password, user.password_hash):
            return False, "Joriy parol noto'g'ri"
        
        user.password_hash = get_password_hash(new_password)
        user.password_changed_at = get_tashkent_now().isoformat()
        
        self._log_action(user.id, user.tenant_id, "password_change", "users", user.id)
        
        self.db.commit()
        return True, "Parol muvaffaqiyatli o'zgartirildi"
    
    def _create_session(self, user_id: int, tenant_id: int, token: str) -> UserSession:
        """Create user session record."""
        session = UserSession(
            user_id=user_id,
            tenant_id=tenant_id,
            token_hash=token[:50],
            expires_at=(get_tashkent_now() + timedelta(days=settings.refresh_token_expire_days)).isoformat(),
            is_active=True
        )
        self.db.add(session)
        self.db.commit()
        return session
    
    def _invalidate_session(self, token: str) -> None:
        """Invalidate session by token."""
        self.db.query(UserSession).filter(
            UserSession.token_hash == token[:50]
        ).update({"is_active": False})
        self.db.commit()
    
    def _log_action(
        self,
        user_id: int,
        tenant_id: int,
        action: str,
        table_name: str,
        record_id: int,
        description: str = None
    ) -> None:
        """Log user action for audit."""
        log = AuditLog(
            user_id=user_id,
            tenant_id=tenant_id,
            action=action,
            table_name=table_name,
            record_id=record_id,
            description=description
        )
        self.db.add(log)
