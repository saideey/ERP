"""
SuperAdmin model for global system administration.
SuperAdmins are NOT tied to any tenant - they manage all tenants.
"""

from sqlalchemy import (
    Column, String, Integer, Boolean, Text, DateTime, Index
)

from ..base import BaseModel


class SuperAdmin(BaseModel):
    """
    Super Admin - global system administrator.
    
    Separate from regular User model because:
    - Not tied to any tenant
    - Has global access to all tenants
    - Different auth flow (/super/login)
    - Cannot access tenant-level features (POS, sales, etc.)
    - Can only manage tenants, view stats, manage subscriptions
    """
    
    __tablename__ = 'super_admins'
    
    # Credentials
    username = Column(String(100), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=True, index=True)
    password_hash = Column(String(255), nullable=False)
    
    # Personal info
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    phone = Column(String(20), nullable=True)
    
    # Status
    is_active = Column(Boolean, default=True, nullable=False)
    
    # Security
    last_login = Column(String(50), nullable=True)
    failed_login_attempts = Column(Integer, default=0)
    locked_until = Column(DateTime, nullable=True)
    security_pin = Column(String(255), nullable=True)  # Hashed 6-digit PIN
    security_code = Column(String(255), nullable=True)  # Hashed passphrase (4th step)
    
    __table_args__ = (
        Index('ix_super_admins_is_active', 'is_active'),
    )
    
    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"
    
    def __repr__(self):
        return f"<SuperAdmin(id={self.id}, username='{self.username}')>"
