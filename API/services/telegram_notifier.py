"""
Telegram Notification Client for API — Multi-Tenant SaaS

Sends notifications to the Telegram Bot service via HTTP.
Each notification includes tenant context (company name, phone, director IDs, group_chat_id).
"""
import os
import logging
import httpx
from datetime import datetime
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

TELEGRAM_BOT_URL = os.getenv("TELEGRAM_BOT_URL", "http://telegram_bot:8081")


def get_tenant_telegram_config(tenant_id: int) -> Dict[str, Any]:
    """Fetch tenant's Telegram config from database."""
    try:
        from database.connection import db
        from database.models import Tenant, SystemSetting

        session = db.get_session_direct()
        try:
            tenant = session.query(Tenant).filter(Tenant.id == tenant_id).first()
            if not tenant:
                return {"tenant_name": "Unknown", "tenant_phone": "", "director_ids": [], "group_chat_id": ""}

            keys = ["director_telegram_ids", "telegram_group_chat_id"]
            settings = {}
            for s in session.query(SystemSetting).filter(
                SystemSetting.tenant_id == tenant_id,
                SystemSetting.key.in_(keys)
            ).all():
                settings[s.key] = s.value

            director_ids = []
            if settings.get("director_telegram_ids"):
                director_ids = [x.strip() for x in settings["director_telegram_ids"].split(",") if x.strip()]

            return {
                "tenant_name": tenant.name,
                "tenant_phone": tenant.phone or "",
                "director_ids": director_ids,
                "group_chat_id": settings.get("telegram_group_chat_id", ""),
            }
        finally:
            session.close()
    except Exception as e:
        logger.error(f"Error fetching tenant telegram config: {e}")
        return {"tenant_name": "Unknown", "tenant_phone": "", "director_ids": [], "group_chat_id": ""}


class TelegramNotifier:
    """Client for sending notifications to Telegram Bot service."""

    def __init__(self, base_url: str = None):
        self.base_url = base_url or TELEGRAM_BOT_URL
        self.timeout = 30.0

    async def send_purchase_notification(
        self, tenant_id: int,
        customer_telegram_id: Optional[str],
        customer_name: str, customer_phone: str,
        sale_number: str, sale_date: datetime,
        items: List[Dict], total_amount: float,
        paid_amount: float, debt_amount: float,
        operator_name: str = "Kassir",
    ) -> Dict[str, Any]:
        cfg = get_tenant_telegram_config(tenant_id)
        payload = {
            "tenant_name": cfg["tenant_name"],
            "tenant_phone": cfg["tenant_phone"],
            "director_ids": cfg["director_ids"],
            "group_chat_id": cfg["group_chat_id"],
            "customer_telegram_id": customer_telegram_id,
            "customer_name": customer_name,
            "customer_phone": customer_phone,
            "sale_number": sale_number,
            "sale_date": sale_date.isoformat() if isinstance(sale_date, datetime) else str(sale_date),
            "items": items,
            "total_amount": float(total_amount),
            "paid_amount": float(paid_amount),
            "debt_amount": float(debt_amount),
            "operator_name": operator_name,
        }
        return await self._post("/notify/purchase", payload, cfg["tenant_name"])

    async def send_payment_notification(
        self, tenant_id: int,
        customer_telegram_id: Optional[str],
        customer_name: str, customer_phone: str,
        payment_date: datetime, payment_amount: float,
        payment_type: str, previous_debt: float,
        current_debt: float, operator_name: str = "Kassir",
    ) -> Dict[str, Any]:
        cfg = get_tenant_telegram_config(tenant_id)
        payload = {
            "tenant_name": cfg["tenant_name"],
            "tenant_phone": cfg["tenant_phone"],
            "director_ids": cfg["director_ids"],
            "group_chat_id": cfg["group_chat_id"],
            "customer_telegram_id": customer_telegram_id,
            "customer_name": customer_name,
            "customer_phone": customer_phone,
            "payment_date": payment_date.isoformat() if isinstance(payment_date, datetime) else str(payment_date),
            "payment_amount": float(payment_amount),
            "payment_type": payment_type,
            "previous_debt": float(previous_debt),
            "current_debt": float(current_debt),
            "operator_name": operator_name,
        }
        return await self._post("/notify/payment", payload, cfg["tenant_name"])

    async def send_daily_report(self, tenant_id: int, report_data: dict) -> Dict[str, Any]:
        cfg = get_tenant_telegram_config(tenant_id)
        if not cfg["group_chat_id"]:
            return {"success": False, "error": "No group_chat_id configured"}
        payload = {
            "tenant_name": cfg["tenant_name"],
            "chat_id": cfg["group_chat_id"],
            "report_data": report_data,
        }
        return await self._post("/notify/daily-report", payload, cfg["tenant_name"])

    async def send_test_message(self, tenant_id: int, chat_id: str, message: str = "Test") -> bool:
        cfg = get_tenant_telegram_config(tenant_id)
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(f"{self.base_url}/test", json={
                    "chat_id": chat_id, "message": message, "tenant_name": cfg["tenant_name"]
                })
                return resp.status_code == 200
        except:
            return False

    async def send_custom_message(self, chat_id: str, message: str) -> bool:
        """Send custom HTML message to any chat_id."""
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(f"{self.base_url}/notify/custom", json={
                    "chat_id": chat_id, "message": message
                })
                return resp.status_code == 200 and resp.json().get("success")
        except:
            return False

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                return (await client.get(f"{self.base_url}/health")).status_code == 200
        except:
            return False

    async def _post(self, path: str, payload: dict, tenant_name: str = "?") -> Dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(f"{self.base_url}{path}", json=payload)
                if resp.status_code == 200:
                    return resp.json()
                return {"success": False, "error": f"HTTP {resp.status_code}"}
        except httpx.ConnectError:
            logger.warning(f"[{tenant_name}] Bot service unavailable")
            return {"success": False, "error": "Bot unavailable"}
        except Exception as e:
            logger.error(f"[{tenant_name}] Notification error: {e}")
            return {"success": False, "error": str(e)}


telegram_notifier = TelegramNotifier()


# ==================== SYNC HELPERS (for background threads) ====================

def send_purchase_notification_sync(
    tenant_id: int, customer_telegram_id: Optional[str],
    customer_name: str, customer_phone: str,
    sale_number: str, sale_date: datetime,
    items: List[Dict], total_amount: float,
    paid_amount: float, debt_amount: float,
    operator_name: str = "Kassir"
) -> None:
    import asyncio, threading
    def run():
        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(telegram_notifier.send_purchase_notification(
                tenant_id=tenant_id, customer_telegram_id=customer_telegram_id,
                customer_name=customer_name, customer_phone=customer_phone,
                sale_number=sale_number, sale_date=sale_date, items=items,
                total_amount=total_amount, paid_amount=paid_amount,
                debt_amount=debt_amount, operator_name=operator_name,
            ))
        finally:
            loop.close()
    threading.Thread(target=run, daemon=True).start()


def send_payment_notification_sync(
    tenant_id: int, customer_telegram_id: Optional[str],
    customer_name: str, customer_phone: str,
    payment_date: datetime, payment_amount: float,
    payment_type: str, previous_debt: float,
    current_debt: float, operator_name: str = "Kassir"
) -> None:
    import asyncio, threading
    def run():
        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(telegram_notifier.send_payment_notification(
                tenant_id=tenant_id, customer_telegram_id=customer_telegram_id,
                customer_name=customer_name, customer_phone=customer_phone,
                payment_date=payment_date, payment_amount=payment_amount,
                payment_type=payment_type, previous_debt=previous_debt,
                current_debt=current_debt, operator_name=operator_name,
            ))
        finally:
            loop.close()
    threading.Thread(target=run, daemon=True).start()
