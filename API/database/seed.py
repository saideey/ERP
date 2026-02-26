"""
Database seed for SaaS — creates super admin on first run.
"""
import os
from sqlalchemy.orm import Session
from .models import SuperAdmin


def seed_super_admin(session: Session):
    """Create default super admin if none exists."""
    from core.security import get_password_hash
    
    try:
        existing = session.query(SuperAdmin).first()
        if existing:
            # Ensure security fields exist (for upgrades)
            changed = False
            if not existing.security_pin:
                existing.security_pin = get_password_hash(os.getenv('SUPER_ADMIN_PIN', 'IFTIHOR52'))
                changed = True
            if not existing.security_code:
                existing.security_code = get_password_hash(os.getenv('SUPER_ADMIN_CODE', 'LALAKU5lik'))
                changed = True
            if changed:
                session.commit()
                print("✅ Super admin security codes updated")
            else:
                print("ℹ️  Super admin already exists")
            return
    except Exception:
        print("⚠️  super_admins table not ready, skipping seed")
        return
    
    password = os.getenv('SUPER_ADMIN_PASSWORD', 'ERP937431011')
    pin = os.getenv('SUPER_ADMIN_PIN', 'IFTIHOR52')
    code = os.getenv('SUPER_ADMIN_CODE', 'LALAKU5lik')
    
    session.add(SuperAdmin(
        username="SuperTuzik",
        email="admin@metall-saas.uz",
        password_hash=get_password_hash(password),
        first_name="Super",
        last_name="Admin",
        is_active=True,
        security_pin=get_password_hash(pin),
        security_code=get_password_hash(code),
    ))
    session.commit()
    print(f"✅ Super admin created (username=SuperTuzik)")
    print(f"   PIN: {pin}")
    print(f"   Security code: {code}")


def seed_all(session: Session):
    """Main seed entry point."""
    seed_super_admin(session)
