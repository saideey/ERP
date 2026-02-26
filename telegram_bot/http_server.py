"""
HTTP Server for receiving notifications from API.
Multi-tenant: each request carries tenant context.

Endpoints:
  POST /notify/purchase      — Purchase notification
  POST /notify/payment       — Payment notification
  POST /notify/daily-report  — Daily report with Excel
  POST /notify/custom        — Custom message to any chat_id
  POST /test                 — Test message
  GET  /health               — Health check
"""
import logging
from datetime import datetime
from aiohttp import web
from aiogram import Bot

logger = logging.getLogger(__name__)


class HTTPServer:
    def __init__(self, notification_service, bot: Bot = None):
        self.ns = notification_service
        self.bot = bot
        self.app = web.Application()
        self._setup_routes()

    def _setup_routes(self):
        r = self.app.router
        r.add_post('/notify/purchase', self.handle_purchase)
        r.add_post('/notify/payment', self.handle_payment)
        r.add_post('/notify/daily-report', self.handle_daily_report)
        r.add_post('/notify/custom', self.handle_custom)
        r.add_post('/test', self.test_notification)
        r.add_get('/health', self.health_check)

    # ---------- Health ----------

    async def health_check(self, request: web.Request) -> web.Response:
        return web.json_response({
            "status": "ok",
            "service": "telegram-bot-saas",
            "bot_active": self.bot is not None,
            "timestamp": datetime.now().isoformat()
        })

    # ---------- Test ----------

    async def test_notification(self, request: web.Request) -> web.Response:
        try:
            data = await request.json()
            chat_id = data.get('chat_id')
            message = data.get('message', 'Test — Metall Basa SaaS Bot')
            tenant_name = data.get('tenant_name', 'Test')

            if not chat_id:
                return web.json_response({"success": False, "error": "chat_id required"}, status=400)

            success = await self.ns.send_test_message(chat_id, f"🧪 [{tenant_name}] {message}")
            return web.json_response({"success": success})
        except Exception as e:
            logger.error(f"Test error: {e}")
            return web.json_response({"success": False, "error": str(e)}, status=500)

    # ---------- Purchase ----------

    async def handle_purchase(self, request: web.Request) -> web.Response:
        """
        POST /notify/purchase
        {
            "tenant_name": "...", "tenant_phone": "...",
            "director_ids": ["123", "456"],
            "group_chat_id": "-100...",
            "customer_telegram_id": "789",
            "customer_name": "...", "customer_phone": "...",
            "sale_number": "S-001", "sale_date": "...",
            "items": [...], "total_amount": 0, "paid_amount": 0, "debt_amount": 0,
            "operator_name": "..."
        }
        """
        try:
            data = await request.json()
            if 'sale_number' not in data or 'items' not in data:
                return web.json_response({"success": False, "error": "sale_number and items required"}, status=400)

            result = await self.ns.send_purchase_notification(
                tenant_name=data.get('tenant_name', 'Kompaniya'),
                tenant_phone=data.get('tenant_phone', ''),
                director_ids=data.get('director_ids', []),
                group_chat_id=data.get('group_chat_id', ''),
                customer_telegram_id=data.get('customer_telegram_id'),
                customer_name=data.get('customer_name', "Noma'lum"),
                customer_phone=data.get('customer_phone', ''),
                sale_number=data['sale_number'],
                sale_date=data.get('sale_date'),
                items=data['items'],
                total_amount=float(data.get('total_amount', 0)),
                paid_amount=float(data.get('paid_amount', 0)),
                debt_amount=float(data.get('debt_amount', 0)),
                operator_name=data.get('operator_name', 'Kassir'),
            )
            return web.json_response(result)
        except Exception as e:
            logger.error(f"Purchase error: {e}")
            return web.json_response({"success": False, "error": str(e)}, status=500)

    # ---------- Payment ----------

    async def handle_payment(self, request: web.Request) -> web.Response:
        try:
            data = await request.json()
            result = await self.ns.send_payment_notification(
                tenant_name=data.get('tenant_name', 'Kompaniya'),
                tenant_phone=data.get('tenant_phone', ''),
                director_ids=data.get('director_ids', []),
                group_chat_id=data.get('group_chat_id', ''),
                customer_telegram_id=data.get('customer_telegram_id'),
                customer_name=data.get('customer_name', "Noma'lum"),
                customer_phone=data.get('customer_phone', ''),
                payment_date=data.get('payment_date'),
                payment_amount=float(data.get('payment_amount', 0)),
                payment_type=data.get('payment_type', 'CASH'),
                previous_debt=float(data.get('previous_debt', 0)),
                current_debt=float(data.get('current_debt', 0)),
                operator_name=data.get('operator_name', 'Kassir'),
            )
            return web.json_response(result)
        except Exception as e:
            logger.error(f"Payment error: {e}")
            return web.json_response({"success": False, "error": str(e)}, status=500)

    # ---------- Daily Report ----------

    async def handle_daily_report(self, request: web.Request) -> web.Response:
        try:
            data = await request.json()
            tenant_name = data.get('tenant_name', 'Kompaniya')
            chat_id = data.get('chat_id')
            report_data = data.get('report_data', {})

            if not chat_id:
                return web.json_response({"success": False, "error": "chat_id required"}, status=400)

            success = await self.ns.send_daily_report_with_excel(
                tenant_name=tenant_name, chat_id=chat_id, report_data=report_data
            )
            return web.json_response({"success": success})
        except Exception as e:
            logger.error(f"Daily report error: {e}")
            return web.json_response({"success": False, "error": str(e)}, status=500)

    # ---------- Custom Message ----------

    async def handle_custom(self, request: web.Request) -> web.Response:
        """
        POST /notify/custom
        {"chat_id": "...", "message": "HTML text", "tenant_name": "..."}
        """
        try:
            data = await request.json()
            chat_id = data.get('chat_id')
            message = data.get('message', '')
            if not chat_id or not message:
                return web.json_response({"success": False, "error": "chat_id and message required"}, status=400)

            success = await self.ns.send_custom_message(chat_id, message)
            return web.json_response({"success": success})
        except Exception as e:
            logger.error(f"Custom msg error: {e}")
            return web.json_response({"success": False, "error": str(e)}, status=500)

    def get_app(self) -> web.Application:
        return self.app
