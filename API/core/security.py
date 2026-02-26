"""
Security utilities for authentication.
JWT token management and password hashing.
Supports both tenant users and super admins.
"""

from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext

from .config import settings


# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Generate password hash."""
    return pwd_context.hash(password)


def create_access_token(
    data: dict,
    expires_delta: Optional[timedelta] = None
) -> str:
    """
    Create JWT access token.
    
    For tenant users: data = {"sub": user_id, "tenant_id": tenant_id, ...}
    For super admins: data = {"sub": admin_id, "is_super_admin": True, ...}
    """
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    
    to_encode.update({
        "exp": expire,
        "type": "access"
    })
    
    encoded_jwt = jwt.encode(
        to_encode,
        settings.secret_key,
        algorithm=settings.algorithm
    )
    return encoded_jwt


def create_refresh_token(
    data: dict,
    expires_delta: Optional[timedelta] = None
) -> str:
    """Create JWT refresh token."""
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days)
    
    to_encode.update({
        "exp": expire,
        "type": "refresh"
    })
    
    encoded_jwt = jwt.encode(
        to_encode,
        settings.secret_key,
        algorithm=settings.algorithm
    )
    return encoded_jwt


def decode_token(token: str) -> Optional[dict]:
    """Decode and validate JWT token."""
    try:
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.algorithm]
        )
        return payload
    except JWTError:
        return None


def verify_access_token(token: str) -> Optional[dict]:
    """Verify access token and return payload."""
    payload = decode_token(token)
    if payload and payload.get("type") == "access":
        return payload
    return None


def verify_refresh_token(token: str) -> Optional[dict]:
    """Verify refresh token and return payload."""
    payload = decode_token(token)
    if payload and payload.get("type") == "refresh":
        return payload
    return None


def is_super_admin_token(payload: dict) -> bool:
    """Check if token belongs to a super admin."""
    return payload.get("is_super_admin", False) is True


class TokenData:
    """Token payload data class for tenant users."""
    
    def __init__(self, user_id: int, tenant_id: int, username: str, role_id: int, role_type: str):
        self.user_id = user_id
        self.tenant_id = tenant_id
        self.username = username
        self.role_id = role_id
        self.role_type = role_type
    
    def to_dict(self) -> dict:
        """Convert to dictionary for JWT payload."""
        return {
            "sub": str(self.user_id),
            "tenant_id": self.tenant_id,
            "username": self.username,
            "role_id": self.role_id,
            "role_type": self.role_type
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> "TokenData":
        """Create TokenData from dictionary."""
        return cls(
            user_id=int(data.get("sub", 0)),
            tenant_id=data.get("tenant_id", 0),
            username=data.get("username", ""),
            role_id=data.get("role_id", 0),
            role_type=data.get("role_type", "")
        )


class SuperAdminTokenData:
    """Token payload data class for super admins."""
    
    def __init__(self, admin_id: int, username: str):
        self.admin_id = admin_id
        self.username = username
    
    def to_dict(self) -> dict:
        return {
            "sub": str(self.admin_id),
            "username": self.username,
            "is_super_admin": True
        }
