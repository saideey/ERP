"""
Telegram Notification Service — Multi-Tenant SaaS

Each notification carries tenant context (company name, phone, director IDs, group_chat_id).
Sends to: customer, directors (personal), group chat.
"""
import io
import logging
from datetime import datetime, date
from typing import List, Dict, Any, Optional
from aiogram import Bot
from aiogram.types import BufferedInputFile
from aiogram.enums import ParseMode

from excel_generator import ExcelGenerator

logger = logging.getLogger(__name__)


class NotificationService:
    def __init__(self, bot: Bot):
        self.bot = bot
        self.excel = ExcelGenerator()

    def _fmt(self, amount: Any) -> str:
        try:
            return f"{float(amount or 0):,.0f}".replace(",", " ")
        except (ValueError, TypeError):
            return str(amount)

    async def _safe_send(self, chat_id: str, text: str, **kwargs) -> bool:
        """Send message with error handling."""
        try:
            await self.bot.send_message(chat_id=chat_id, text=text, parse_mode=ParseMode.HTML, **kwargs)
            return True
        except Exception as e:
            logger.error(f"Send to {chat_id} failed: {e}")
            return False

    async def _safe_send_doc(self, chat_id: str, doc_bytes: bytes, filename: str, caption: str = "") -> bool:
        try:
            await self.bot.send_document(
                chat_id=chat_id,
                document=BufferedInputFile(file=doc_bytes, filename=filename),
                caption=caption
            )
            return True
        except Exception as e:
            logger.error(f"Send doc to {chat_id} failed: {e}")
            return False

    # ==================== PURCHASE ====================

    async def send_purchase_notification(
        self, tenant_name="Kompaniya", tenant_phone="",
        director_ids=None, group_chat_id="",
        customer_telegram_id=None, customer_name="Noma'lum", customer_phone="",
        sale_number="", sale_date=None, items=None,
        total_amount=0, paid_amount=0, debt_amount=0, operator_name="Kassir",
    ) -> Dict[str, Any]:
        result = {"success": False, "customer_notified": False, "directors_notified": 0, "group_notified": False}
        items = items or []
        director_ids = [d.strip() for d in (director_ids or []) if d and d.strip()]

        if isinstance(sale_date, str):
            try: sale_date = datetime.fromisoformat(sale_date.replace('Z', '+00:00'))
            except: sale_date = datetime.now()
        sale_date = sale_date or datetime.now()
        date_str = sale_date.strftime('%d.%m.%Y %H:%M') if isinstance(sale_date, datetime) else str(sale_date)

        items_text = ""
        for i, item in enumerate(items, 1):
            items_text += f"  {i}. {item.get('product_name', '')} — {item.get('quantity', 0)} {item.get('uom_symbol', '')} = {self._fmt(item.get('total_price', 0))} so'm\n"

        debt_line = f"⚠️ <b>Qarz:</b> {self._fmt(debt_amount)} so'm" if debt_amount > 0 else "✅ <b>To'liq to'landi!</b>"

        # Customer message
        customer_msg = (
            f"📦 <b>YANGI HARID</b>\n\n"
            f"👤 {customer_name} | 📱 {customer_phone}\n"
            f"🧾 #{sale_number} | 📅 {date_str}\n"
            f"👨‍💼 Kassir: {operator_name}\n\n"
            f"<b>Tovarlar:</b>\n{items_text}\n"
            f"💰 <b>Jami:</b> {self._fmt(total_amount)} so'm\n"
            f"✅ <b>To'landi:</b> {self._fmt(paid_amount)} so'm\n"
            f"{debt_line}\n\n"
            f"━━━━━━━━━━━━━━━━━\n"
            f"🏪 <b>{tenant_name}</b> | 📞 {tenant_phone}"
        )

        # Excel
        excel_data = self.excel.generate_purchase(tenant_name, customer_name, customer_phone,
            sale_number, sale_date, items, total_amount, paid_amount, debt_amount, operator_name)
        excel_name = f"Harid_{sale_number}_{datetime.now().strftime('%Y%m%d')}.xlsx"

        # Send to customer
        if customer_telegram_id:
            if await self._safe_send(customer_telegram_id, customer_msg):
                result["customer_notified"] = True
                if excel_data:
                    await self._safe_send_doc(customer_telegram_id, excel_data, excel_name, "📊 Harid tafsilotlari")

        # Director message (includes extra info)
        tg_display = customer_telegram_id or "Yo'q"
        director_msg = (
            f"📊 <b>YANGI HARID</b> — {tenant_name}\n\n"
            f"👤 {customer_name} | 📱 {customer_phone}\n"
            f"🆔 TG: {tg_display}\n"
            f"🧾 #{sale_number} | 📅 {date_str} | 👨‍💼 {operator_name}\n\n"
            f"<b>Tovarlar:</b>\n{items_text}\n"
            f"💰 Jami: {self._fmt(total_amount)} | ✅ To'landi: {self._fmt(paid_amount)} so'm\n"
            f"{debt_line}\n"
            f"📤 Mijozga: {'✅' if result['customer_notified'] else '❌'}"
        )

        # Send to directors
        for did in director_ids:
            if await self._safe_send(did, director_msg):
                result["directors_notified"] += 1
                if excel_data:
                    await self._safe_send_doc(did, excel_data, excel_name, f"📊 {tenant_name}")

        # Send to group
        if group_chat_id:
            if await self._safe_send(group_chat_id, director_msg):
                result["group_notified"] = True
                if excel_data:
                    await self._safe_send_doc(group_chat_id, excel_data, excel_name, f"📊 {tenant_name}")

        result["success"] = result["customer_notified"] or result["directors_notified"] > 0 or result["group_notified"]
        logger.info(f"[{tenant_name}] Purchase #{sale_number}: customer={'✓' if result['customer_notified'] else '✗'}, "
                     f"directors={result['directors_notified']}, group={'✓' if result['group_notified'] else '✗'}")
        return result

    # ==================== PAYMENT ====================

    async def send_payment_notification(
        self, tenant_name="Kompaniya", tenant_phone="",
        director_ids=None, group_chat_id="",
        customer_telegram_id=None, customer_name="Noma'lum", customer_phone="",
        payment_date=None, payment_amount=0, payment_type="CASH",
        previous_debt=0, current_debt=0, operator_name="Kassir",
    ) -> Dict[str, Any]:
        result = {"success": False, "customer_notified": False, "directors_notified": 0, "group_notified": False}
        director_ids = [d.strip() for d in (director_ids or []) if d and d.strip()]

        if isinstance(payment_date, str):
            try: payment_date = datetime.fromisoformat(payment_date.replace('Z', '+00:00'))
            except: payment_date = datetime.now()
        payment_date = payment_date or datetime.now()

        pay_labels = {'CASH': '💵 Naqd', 'CARD': '💳 Plastik', 'TRANSFER': "🏦 O'tkazma", 'MIXED': '💱 Aralash'}
        pay_label = pay_labels.get(payment_type, payment_type)
        debt_line = "✅ Qarz to'liq to'landi!" if current_debt <= 0 else f"⚠️ Qolgan qarz: {self._fmt(current_debt)} so'm"

        customer_msg = (
            f"💰 <b>TO'LOV QABUL QILINDI</b>\n\n"
            f"👤 {customer_name} | 📱 {customer_phone}\n"
            f"📅 {payment_date.strftime('%d.%m.%Y %H:%M')} | 👨‍💼 {operator_name}\n\n"
            f"{pay_label}\n\n"
            f"💵 Oldingi qarz: {self._fmt(previous_debt)} so'm\n"
            f"✅ To'landi: {self._fmt(payment_amount)} so'm\n"
            f"{debt_line}\n\n"
            f"━━━━━━━━━━━━━━━━━\n"
            f"🏪 <b>{tenant_name}</b> | 📞 {tenant_phone}"
        )

        if customer_telegram_id:
            if await self._safe_send(customer_telegram_id, customer_msg):
                result["customer_notified"] = True

        director_msg = (
            f"💰 <b>TO'LOV</b> — {tenant_name}\n\n"
            f"👤 {customer_name} | 📱 {customer_phone}\n"
            f"📅 {payment_date.strftime('%d.%m.%Y %H:%M')} | 👨‍💼 {operator_name}\n"
            f"{pay_label}\n\n"
            f"💵 Oldingi: {self._fmt(previous_debt)} | ✅ To'landi: {self._fmt(payment_amount)} so'm\n"
            f"{debt_line}\n"
            f"📤 Mijozga: {'✅' if result['customer_notified'] else '❌'}"
        )

        for did in director_ids:
            if await self._safe_send(did, director_msg):
                result["directors_notified"] += 1

        if group_chat_id:
            if await self._safe_send(group_chat_id, director_msg):
                result["group_notified"] = True

        result["success"] = result["customer_notified"] or result["directors_notified"] > 0 or result["group_notified"]
        return result

    # ==================== DAILY REPORT ====================

    async def send_daily_report_with_excel(self, tenant_name: str, chat_id: str, report_data: dict) -> bool:
        try:
            today = date.today()
            f = self._fmt
            lines = [
                f"📊 <b>KUNLIK HISOBOT</b>",
                f"🏪 <b>{tenant_name}</b>  |  📅 {today.strftime('%d.%m.%Y')}",
                "", "═══════════════════",
                f"🛒 Sotuvlar: <b>{report_data.get('total_sales_count', 0)} ta</b>",
                f"💰 Jami: <b>{f(report_data.get('total_amount', 0))} so'm</b>",
                f"✅ To'langan: <b>{f(report_data.get('total_paid', 0))} so'm</b>",
                f"🔴 Qarz: <b>{f(report_data.get('total_debt', 0))} so'm</b>",
                "",
                f"💵 Naqd: {f(report_data.get('cash_amount', 0))} | 💳 Plastik: {f(report_data.get('card_amount', 0))}",
                f"🏦 O'tkazma: {f(report_data.get('transfer_amount', 0))}",
                "",
                f"📊 Umumiy qarzdorlik: <b>{f(report_data.get('total_all_debt', 0))} so'm</b>",
            ]

            low = report_data.get('low_stock', [])
            if low:
                lines.append(f"\n⚠️ Kam qolgan: <b>{len(low)} ta</b> tovar")

            lines.extend(["", "═══════════════════", f"🕐 {datetime.now().strftime('%H:%M')}", "📎 <i>Batafsil Excel faylda</i>"])

            await self._safe_send(chat_id, "\n".join(lines))

            excel_data = self.excel.generate_daily_report(tenant_name, report_data, today)
            if excel_data:
                await self._safe_send_doc(chat_id, excel_data,
                    f"{tenant_name.replace(' ', '_')}_hisobot_{today.strftime('%Y-%m-%d')}.xlsx",
                    f"📊 {tenant_name} — {today.strftime('%d.%m.%Y')}")

            logger.info(f"[{tenant_name}] Daily report → {chat_id}")
            return True
        except Exception as e:
            logger.error(f"[{tenant_name}] Daily report failed: {e}")
            return False

    # ==================== SIMPLE METHODS ====================

    async def send_test_message(self, chat_id: str, message: str = "Test") -> bool:
        return await self._safe_send(chat_id, message)

    async def send_daily_report(self, chat_id: str, message: str) -> bool:
        return await self._safe_send(chat_id, message)

    async def send_custom_message(self, chat_id: str, message: str) -> bool:
        return await self._safe_send(chat_id, message)
