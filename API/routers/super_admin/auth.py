"""
Super Admin FORTIFIED authentication.
4-step: Username -> Password -> PIN -> Security Code
"""
import time
from datetime import datetime, timedelta
from collections import defaultdict
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from database import get_db
from database.models import SuperAdmin
from database.models.login_log import SuperAdminLoginLog
from core.security import verify_password, create_access_token, create_refresh_token, SuperAdminTokenData, get_password_hash
from core.config import settings
from core.dependencies import get_current_super_admin
from schemas.tenant import SuperAdminInfo
from utils.helpers import get_tashkent_now

router = APIRouter()

_ip_attempts: dict = defaultdict(list)
MAX_IP_ATTEMPTS = 10
IP_WINDOW = 300
MAX_FAIL = 5
LOCKOUT_MIN = 15

def _rate_ok(ip: str) -> bool:
    now = time.time()
    _ip_attempts[ip] = [t for t in _ip_attempts[ip] if now - t < IP_WINDOW]
    if len(_ip_attempts[ip]) >= MAX_IP_ATTEMPTS:
        return False
    _ip_attempts[ip].append(now)
    return True

def _log(db, username, ip, ua, step, ok, reason=None):
    db.add(SuperAdminLoginLog(username=username or '?', ip_address=ip, user_agent=(ua or '')[:500], step_reached=step, success=ok, failure_reason=reason))
    db.commit()

def _ip(r: Request) -> str:
    f = r.headers.get('x-forwarded-for')
    return f.split(',')[0].strip() if f else (r.client.host if r.client else 'unknown')

class Step1Req(BaseModel):
    username: str

class Step2Req(BaseModel):
    username: str
    password: str

class Step3Req(BaseModel):
    username: str
    password: str
    pin: str

class Step4Req(BaseModel):
    username: str
    password: str
    pin: str
    security_code: str

def _get_admin(db, username):
    from sqlalchemy import func
    return db.query(SuperAdmin).filter(func.lower(SuperAdmin.username) == username.strip().lower(), SuperAdmin.is_active == True).first()

def _check_lock(admin, db, username, ip, ua):
    if admin.locked_until:
        lt = admin.locked_until
        if isinstance(lt, str):
            lt = datetime.fromisoformat(lt)
        if datetime.utcnow() < lt:
            rem = int((lt - datetime.utcnow()).total_seconds() / 60) + 1
            _log(db, username, ip, ua, 0, False, f'locked_{rem}min')
            raise HTTPException(423, f"Hisob bloklangan. {rem} daqiqa kutib turing.")
        admin.locked_until = None
        admin.failed_login_attempts = 0
        db.commit()

def _fail(admin, db):
    if admin:
        admin.failed_login_attempts = (admin.failed_login_attempts or 0) + 1
        if admin.failed_login_attempts >= MAX_FAIL:
            admin.locked_until = datetime.utcnow() + timedelta(minutes=LOCKOUT_MIN)
        db.commit()

@router.post("/verify-step1")
async def step1(data: Step1Req, request: Request, db: Session = Depends(get_db)):
    ip, ua = _ip(request), request.headers.get('user-agent', '')
    if not _rate_ok(ip):
        _log(db, data.username, ip, ua, 1, False, 'rate_limited')
        raise HTTPException(429, "Juda ko'p urinish. 5 daqiqa kutib turing.")
    time.sleep(0.3)
    admin = _get_admin(db, data.username)
    if not admin:
        _log(db, data.username, ip, ua, 1, False, 'user_not_found')
        raise HTTPException(401, "Noto'g'ri ma'lumot")
    _check_lock(admin, db, data.username, ip, ua)
    return {"success": True, "step": 1}

@router.post("/verify-step2")
async def step2(data: Step2Req, request: Request, db: Session = Depends(get_db)):
    ip, ua = _ip(request), request.headers.get('user-agent', '')
    if not _rate_ok(ip):
        _log(db, data.username, ip, ua, 2, False, 'rate_limited')
        raise HTTPException(429, "Juda ko'p urinish.")
    time.sleep(0.3)
    admin = _get_admin(db, data.username)
    if not admin or not verify_password(data.password, admin.password_hash):
        _fail(admin, db)
        _log(db, data.username, ip, ua, 2, False, 'wrong_password')
        raise HTTPException(401, "Noto'g'ri ma'lumot")
    _check_lock(admin, db, data.username, ip, ua)
    return {"success": True, "step": 2, "has_pin": bool(admin.security_pin), "has_code": bool(admin.security_code)}

@router.post("/verify-step3")
async def step3(data: Step3Req, request: Request, db: Session = Depends(get_db)):
    ip, ua = _ip(request), request.headers.get('user-agent', '')
    if not _rate_ok(ip):
        _log(db, data.username, ip, ua, 3, False, 'rate_limited')
        raise HTTPException(429, "Juda ko'p urinish.")
    time.sleep(0.2)
    admin = _get_admin(db, data.username)
    if not admin or not verify_password(data.password, admin.password_hash):
        _log(db, data.username, ip, ua, 3, False, 'invalid')
        raise HTTPException(401, "Noto'g'ri ma'lumot")
    if admin.security_pin and not verify_password(data.pin, admin.security_pin):
        _fail(admin, db)
        _log(db, data.username, ip, ua, 3, False, 'wrong_pin')
        raise HTTPException(401, "Noto'g'ri PIN kod")
    return {"success": True, "step": 3}

@router.post("/verify-step4")
async def step4(data: Step4Req, request: Request, db: Session = Depends(get_db)):
    ip, ua = _ip(request), request.headers.get('user-agent', '')
    if not _rate_ok(ip):
        _log(db, data.username, ip, ua, 4, False, 'rate_limited')
        raise HTTPException(429, "Juda ko'p urinish.")
    time.sleep(0.2)
    admin = _get_admin(db, data.username)
    if not admin or not verify_password(data.password, admin.password_hash):
        _log(db, data.username, ip, ua, 4, False, 'invalid')
        raise HTTPException(401, "Noto'g'ri ma'lumot")
    if admin.security_pin and not verify_password(data.pin, admin.security_pin):
        _log(db, data.username, ip, ua, 4, False, 'invalid_pin')
        raise HTTPException(401, "Noto'g'ri ma'lumot")
    if admin.security_code and not verify_password(data.security_code, admin.security_code):
        _fail(admin, db)
        _log(db, data.username, ip, ua, 4, False, 'wrong_code')
        raise HTTPException(401, "Noto'g'ri xavfsizlik kodi")

    token_data = SuperAdminTokenData(admin_id=admin.id, username=admin.username)
    access_token = create_access_token(token_data.to_dict())
    refresh_token = create_refresh_token(token_data.to_dict())
    admin.last_login = get_tashkent_now().isoformat()
    admin.failed_login_attempts = 0
    admin.locked_until = None
    db.commit()
    _log(db, data.username, ip, ua, 4, True, None)
    return {
        "success": True, "message": "Muvaffaqiyatli kirdingiz",
        "admin": SuperAdminInfo.model_validate(admin).model_dump(),
        "access_token": access_token, "refresh_token": refresh_token,
        "token_type": "bearer", "expires_in": settings.access_token_expire_minutes * 60,
    }

class SetupSecurityReq(BaseModel):
    current_password: str
    pin: Optional[str] = None
    security_code: Optional[str] = None

@router.post("/setup-security")
async def setup_security(data: SetupSecurityReq, admin: SuperAdmin = Depends(get_current_super_admin), db: Session = Depends(get_db)):
    if not verify_password(data.current_password, admin.password_hash):
        raise HTTPException(401, "Parol noto'g'ri")
    if data.pin:
        if len(data.pin) < 4:
            raise HTTPException(400, "PIN kamida 4 ta belgi bo'lishi kerak")
        admin.security_pin = get_password_hash(data.pin)
    if data.security_code:
        if len(data.security_code) < 4:
            raise HTTPException(400, "Xavfsizlik kodi kamida 4 belgi")
        admin.security_code = get_password_hash(data.security_code)
    db.commit()
    return {"success": True, "message": "Xavfsizlik sozlamalari saqlandi"}

@router.get("/login-logs")
async def get_login_logs(admin: SuperAdmin = Depends(get_current_super_admin), db: Session = Depends(get_db)):
    logs = db.query(SuperAdminLoginLog).order_by(SuperAdminLoginLog.created_at.desc()).limit(100).all()
    return {"data": [{"id": l.id, "username": l.username, "ip_address": l.ip_address, "user_agent": (l.user_agent or '')[:100], "step_reached": l.step_reached, "success": l.success, "failure_reason": l.failure_reason, "created_at": str(l.created_at)} for l in logs]}

@router.get("/me")
async def get_me(admin: SuperAdmin = Depends(get_current_super_admin)):
    return {**SuperAdminInfo.model_validate(admin).model_dump(), "has_pin": bool(admin.security_pin), "has_security_code": bool(admin.security_code)}
