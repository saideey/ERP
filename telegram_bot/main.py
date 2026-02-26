"""
Metall Basa SaaS Telegram Bot — Multi-Tenant

Single bot process serves ALL tenants.

Architecture:
  1. Aiogram Dispatcher — handles /start, /myid, /help commands
  2. HTTP Server — receives notifications from API (purchase, payment, daily report)
  3. Deep Linking — directors click t.me/BOT?start=link_SLUG to self-register

Commands:
  /start          — Welcome + show Telegram ID
  /start link_XXX — Deep link: auto-register director for tenant XXX
  /myid           — Show Telegram ID (for manual setup)
  /help           — Instructions

HTTP Endpoints (from API):
  POST /notify/purchase      — Purchase notification (tenant-aware)
  POST /notify/payment       — Payment notification (tenant-aware)
  POST /notify/daily-report  — Daily report with Excel (tenant-aware)
  POST /notify/custom        — Custom message to any chat
  POST /test                 — Test notification
  GET  /health               — Health check
"""
import asyncio
import logging
import sys
from datetime import datetime
from aiohttp import web
from aiogram import Bot, Dispatcher, Router
from aiogram.enums import ParseMode
from aiogram.types import Message
from aiogram.filters import Command, CommandStart
from aiogram.client.default import DefaultBotProperties

from config import config
from notification_service import NotificationService
from http_server import HTTPServer

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)-7s | %(name)s | %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

# ==================== COMMAND HANDLERS ====================

cmd_router = Router()


@cmd_router.message(CommandStart(deep_link=True))
async def cmd_start_deep_link(message: Message):
    """Handle /start with deep link: /start link_gayrat-stroy"""
    args = message.text.split(maxsplit=1)
    param = args[1] if len(args) > 1 else ""

    if param.startswith("link_"):
        slug = param[5:]
        user = message.from_user
        tg_id = str(user.id)
        name = f"{user.first_name or ''} {user.last_name or ''}".strip() or user.username or tg_id

        import httpx
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(f"{config.API_URL}/api/v1/internal/telegram/link", json={
                    "tenant_slug": slug,
                    "telegram_id": tg_id,
                    "telegram_name": name,
                })
                data = resp.json()

                if resp.status_code == 200 and data.get("success"):
                    tenant_name = data.get("tenant_name", slug)
                    await message.answer(
                        f"✅ <b>Muvaffaqiyatli ulandi!</b>\n\n"
                        f"🏢 Kompaniya: <b>{tenant_name}</b>\n"
                        f"👤 Ism: {name}\n"
                        f"🆔 Telegram ID: <code>{tg_id}</code>\n\n"
                        f"Endi siz xabarlar olasiz:\n"
                        f"• 📦 Harid xabarlari\n"
                        f"• 💰 To'lov xabarlari\n"
                        f"• 📊 Kunlik hisobotlar",
                        parse_mode=ParseMode.HTML
                    )
                    logger.info(f"[{tenant_name}] Director linked: {name} ({tg_id})")
                else:
                    error = data.get("detail", data.get("error", "Xatolik"))
                    await message.answer(
                        f"❌ <b>Ulanib bo'lmadi</b>\n\n{error}\n\n"
                        f"Sizning Telegram ID: <code>{tg_id}</code>",
                        parse_mode=ParseMode.HTML
                    )
        except httpx.ConnectError:
            await message.answer(
                f"⚠️ Server bilan aloqa yo'q.\nTelegram ID: <code>{message.from_user.id}</code>",
                parse_mode=ParseMode.HTML
            )
        except Exception as e:
            logger.error(f"Deep link error: {e}")
            await message.answer(f"❌ Xatolik. ID: <code>{message.from_user.id}</code>", parse_mode=ParseMode.HTML)
        return

    await cmd_start(message)


@cmd_router.message(CommandStart())
async def cmd_start(message: Message):
    """Handle /start without parameters."""
    user = message.from_user
    await message.answer(
        f"👋 <b>Salom, {user.first_name or 'foydalanuvchi'}!</b>\n\n"
        f"Bu <b>Metall Basa SaaS</b> ERP bildirishnoma botidir.\n\n"
        f"🆔 Sizning Telegram ID: <code>{user.id}</code>\n\n"
        f"<b>Nima qiladi?</b>\n"
        f"📦 Harid xabarlari\n💰 To'lov xabarlari\n📊 Kunlik hisobotlar\n\n"
        f"<b>Qanday ulash?</b>\n"
        f"Admin sizga maxsus havola beradi — bosing va avtomatik ulanasiz.\n"
        f"Yoki ID ni adminstratorga bering.\n\n"
        f"/myid — ID ko'rish | /help — Yordam",
        parse_mode=ParseMode.HTML
    )


@cmd_router.message(Command("myid"))
async def cmd_myid(message: Message):
    """Show Telegram ID."""
    u = message.from_user
    await message.answer(
        f"🆔 <b>Sizning Telegram ID:</b>\n\n<code>{u.id}</code>\n\n"
        f"👤 {u.first_name or ''} {u.last_name or ''}\n"
        f"📱 @{u.username or '—'}\n\n"
        f"Bu ID ni ERP administratoriga yuboring.",
        parse_mode=ParseMode.HTML
    )


@cmd_router.message(Command("help"))
async def cmd_help(message: Message):
    """Help."""
    await message.answer(
        f"📚 <b>Yordam</b>\n\n"
        f"/start — Boshlash\n/myid — Telegram ID\n/help — Yordam\n\n"
        f"<b>Ulash:</b> Admin bergan linkni bosing.\n"
        f"<b>Xabarlar:</b> 📦 Harid | 💰 To'lov | 📊 Hisobot\n\n"
        f"Muammo? ERP administratori bilan bog'laning.",
        parse_mode=ParseMode.HTML
    )


# ==================== MOCK SERVICE ====================

class MockNotificationService:
    async def send_purchase_notification(self, **kw):
        logger.info(f"[MOCK] Purchase: {kw.get('tenant_name')} — {kw.get('sale_number')}"); return {"success": True, "mock": True}
    async def send_payment_notification(self, **kw):
        logger.info(f"[MOCK] Payment: {kw.get('tenant_name')}"); return {"success": True, "mock": True}
    async def send_test_message(self, chat_id, message=""):
        logger.info(f"[MOCK] Test → {chat_id}"); return True
    async def send_daily_report(self, chat_id, message):
        logger.info(f"[MOCK] Report → {chat_id}"); return True
    async def send_daily_report_with_excel(self, **kw):
        logger.info(f"[MOCK] Report+Excel: {kw.get('tenant_name')}"); return True
    async def send_custom_message(self, chat_id, message):
        logger.info(f"[MOCK] Custom → {chat_id}"); return True


# ==================== MAIN ====================

async def main():
    try:
        config.validate()
    except ValueError as e:
        logger.warning(f"⚠️ {e} — MOCK mode")

    bot = None
    dp = None
    if config.BOT_TOKEN:
        bot = Bot(token=config.BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
        dp = Dispatcher()
        dp.include_router(cmd_router)
        logger.info("✅ Bot initialized with command handlers")
    else:
        logger.warning("⚠️ No BOT_TOKEN — MOCK mode")

    notification_service = NotificationService(bot) if bot else MockNotificationService()
    http_server = HTTPServer(notification_service, bot)

    http_runner = web.AppRunner(http_server.get_app())
    await http_runner.setup()
    site = web.TCPSite(http_runner, config.HTTP_HOST, config.HTTP_PORT)
    await site.start()

    logger.info(f"🚀 Bot started on {config.HTTP_HOST}:{config.HTTP_PORT}")
    logger.info("🤖 Commands: /start, /myid, /help  |  🔗 Deep link: /start link_SLUG")

    try:
        if dp and bot:
            await dp.start_polling(bot, handle_signals=False)
        else:
            while True:
                await asyncio.sleep(3600)
    except asyncio.CancelledError:
        pass
    finally:
        if bot:
            await bot.session.close()
        await http_runner.cleanup()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Stopped")
    except Exception as e:
        logger.error(f"Fatal: {e}")
        sys.exit(1)
