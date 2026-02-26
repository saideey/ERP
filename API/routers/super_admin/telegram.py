"""
Super Admin — Telegram Bot Management

Manage telegram settings per tenant:
- Director Telegram IDs
- Group chat ID for daily reports
- Daily report schedule
- Test notifications
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List

from database import get_db
from database.models import Tenant, SystemSetting
from core.dependencies import get_current_super_admin

router = APIRouter()


# === Schemas ===

class TelegramSettings(BaseModel):
    director_telegram_ids: str = ""      # Comma-separated
    group_chat_id: str = ""              # -100123456789
    daily_report_enabled: bool = False
    daily_report_time: str = "19:00"     # 24-hour format

class TelegramSettingsResponse(BaseModel):
    tenant_id: int
    tenant_name: str
    tenant_slug: str
    director_telegram_ids: str
    group_chat_id: str
    daily_report_enabled: bool
    daily_report_time: str

class TestMessageRequest(BaseModel):
    chat_id: str
    message: str = "Test xabar — X ERP SYSTEM"


# === Endpoints ===

@router.get(
    "/tenants/{tenant_id}/telegram",
    response_model=TelegramSettingsResponse,
    summary="Kompaniya Telegram sozlamalari"
)
async def get_telegram_settings(
    tenant_id: int,
    admin=Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    """Get telegram settings for a tenant."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Kompaniya topilmadi")
    
    settings = {}
    for s in db.query(SystemSetting).filter(
        SystemSetting.tenant_id == tenant_id,
        SystemSetting.key.in_([
            "director_telegram_ids",
            "telegram_group_chat_id",
            "telegram_daily_report_enabled",
            "telegram_daily_report_time"
        ])
    ).all():
        settings[s.key] = s.value
    
    return TelegramSettingsResponse(
        tenant_id=tenant.id,
        tenant_name=tenant.name,
        tenant_slug=tenant.slug,
        director_telegram_ids=settings.get("director_telegram_ids", ""),
        group_chat_id=settings.get("telegram_group_chat_id", ""),
        daily_report_enabled=settings.get("telegram_daily_report_enabled", "false").lower() == "true",
        daily_report_time=settings.get("telegram_daily_report_time", "19:00"),
    )


@router.put(
    "/tenants/{tenant_id}/telegram",
    summary="Telegram sozlamalarini yangilash"
)
async def update_telegram_settings(
    tenant_id: int,
    data: TelegramSettings,
    admin=Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    """Update telegram settings for a tenant."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Kompaniya topilmadi")
    
    setting_map = {
        "director_telegram_ids": data.director_telegram_ids,
        "telegram_group_chat_id": data.group_chat_id,
        "telegram_daily_report_enabled": str(data.daily_report_enabled).lower(),
        "telegram_daily_report_time": data.daily_report_time,
    }
    
    for key, value in setting_map.items():
        existing = db.query(SystemSetting).filter(
            SystemSetting.tenant_id == tenant_id,
            SystemSetting.key == key
        ).first()
        
        if existing:
            existing.value = value
        else:
            db.add(SystemSetting(
                tenant_id=tenant_id,
                key=key,
                value=value,
                description=f"Telegram: {key}"
            ))
    
    db.commit()
    
    return {
        "success": True,
        "message": f"{tenant.name} Telegram sozlamalari yangilandi"
    }


@router.post(
    "/tenants/{tenant_id}/telegram/test",
    summary="Test xabar yuborish"
)
async def send_test_message(
    tenant_id: int,
    data: TestMessageRequest,
    admin=Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    """Send a test message to verify bot connection."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Kompaniya topilmadi")
    
    from services.telegram_notifier import telegram_notifier
    success = await telegram_notifier.send_test_message(
        tenant_id=tenant_id,
        chat_id=data.chat_id,
        message=data.message
    )
    
    if success:
        return {"success": True, "message": "Test xabar yuborildi ✅"}
    else:
        raise HTTPException(status_code=500, detail="Xabar yuborilmadi. Bot token yoki chat_id ni tekshiring.")


@router.get(
    "/overview",
    summary="Barcha kompaniyalar Telegram holati"
)
async def telegram_overview(
    admin=Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    """Overview of telegram settings for all tenants."""
    tenants = db.query(Tenant).filter(Tenant.is_active == True).all()
    
    result = []
    for tenant in tenants:
        settings = {}
        for s in db.query(SystemSetting).filter(
            SystemSetting.tenant_id == tenant.id,
            SystemSetting.key.in_(["director_telegram_ids", "telegram_group_chat_id", "telegram_daily_report_enabled"])
        ).all():
            settings[s.key] = s.value
        
        director_ids = settings.get("director_telegram_ids", "")
        group_chat = settings.get("telegram_group_chat_id", "")
        report_enabled = settings.get("telegram_daily_report_enabled", "false").lower() == "true"
        
        result.append({
            "tenant_id": tenant.id,
            "tenant_name": tenant.name,
            "tenant_slug": tenant.slug,
            "has_directors": bool(director_ids),
            "directors_count": len([d for d in director_ids.split(",") if d.strip()]) if director_ids else 0,
            "has_group_chat": bool(group_chat),
            "daily_report_enabled": report_enabled,
        })
    
    return {"tenants": result, "total": len(result)}


@router.get(
    "/bot-info",
    summary="Telegram bot ma'lumotlari"
)
async def get_bot_info(
    admin=Depends(get_current_super_admin),
):
    """Get bot username for generating deep links."""
    import os
    import httpx
    
    bot_url = os.getenv("TELEGRAM_BOT_URL", "http://telegram_bot:8081")
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    
    username = ""
    if bot_token:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(f"https://api.telegram.org/bot{bot_token}/getMe")
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("ok"):
                        username = data["result"].get("username", "")
        except Exception:
            pass
    
    # Health check
    bot_healthy = False
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            resp = await client.get(f"{bot_url}/health")
            bot_healthy = resp.status_code == 200
    except Exception:
        pass
    
    return {
        "username": username,
        "healthy": bot_healthy,
        "bot_url": bot_url,
    }
