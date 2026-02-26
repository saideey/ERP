"""
Super Admin login attempt log — tracks every login attempt
with IP, user agent, step reached, and result.
"""

from sqlalchemy import (
    Column, String, Integer, Boolean, Text, DateTime
)

from ..base import Base, TimestampMixin


class SuperAdminLoginLog(Base, TimestampMixin):
    """Logs every super admin login attempt."""

    __tablename__ = 'super_admin_login_logs'

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(100), nullable=True)
    ip_address = Column(String(50), nullable=True)
    user_agent = Column(Text, nullable=True)
    step_reached = Column(Integer, default=1)  # 1=username, 2=password, 3=pin, 4=code
    success = Column(Boolean, default=False)
    failure_reason = Column(String(200), nullable=True)
    country = Column(String(50), nullable=True)
