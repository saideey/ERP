"""
Daily Report Scheduler — Multi-Tenant SaaS

Runs inside API process.
Checks each tenant's report settings and sends daily reports at configured time.
"""
import asyncio
import logging
from datetime import datetime, date
from typing import Optional

logger = logging.getLogger(__name__)


class DailyReportScheduler:
    """
    Checks all active tenants every 30 seconds.
    For each tenant with daily reports enabled, sends report at configured time.
    """
    
    def __init__(self):
        self.running = True
        self._sent_today: dict[int, date] = {}  # tenant_id -> last sent date
    
    async def run(self):
        """Main scheduler loop."""
        logger.info("📅 Multi-tenant daily report scheduler started")
        
        while self.running:
            try:
                await self._check_all_tenants()
            except Exception as e:
                logger.error(f"Scheduler error: {e}")
            
            await asyncio.sleep(30)
    
    async def _check_all_tenants(self):
        """Check all tenants and send reports if it's time."""
        from database.connection import db
        from database.models import Tenant, SystemSetting
        
        
        session = db.get_session_direct()
        try:
            # Get all active tenants
            tenants = session.query(Tenant).filter(
                Tenant.is_active == True,
                Tenant.subscription_status.in_([
                    'active', 
                    'trial'
                ])
            ).all()
            
            now = datetime.now()
            today = now.date()
            
            for tenant in tenants:
                # Skip if already sent today
                if self._sent_today.get(tenant.id) == today:
                    continue
                
                # Check tenant's report settings
                settings = {}
                for s in session.query(SystemSetting).filter(
                    SystemSetting.tenant_id == tenant.id,
                    SystemSetting.key.in_([
                        "telegram_daily_report_enabled",
                        "telegram_daily_report_time",
                        "telegram_group_chat_id"
                    ])
                ).all():
                    settings[s.key] = s.value
                
                is_enabled = settings.get("telegram_daily_report_enabled", "false").lower() == "true"
                report_time = settings.get("telegram_daily_report_time", "19:00")
                group_chat_id = settings.get("telegram_group_chat_id", "")
                
                if not is_enabled or not group_chat_id:
                    continue
                
                # Parse time
                try:
                    hour, minute = map(int, report_time.split(":"))
                except (ValueError, AttributeError):
                    hour, minute = 19, 0
                
                # Check if it's time
                if now.hour == hour and now.minute == minute:
                    logger.info(f"⏰ [{tenant.name}] Sending daily report...")
                    
                    success = await self._send_report(tenant.id, tenant.name)
                    if success:
                        self._sent_today[tenant.id] = today
                        logger.info(f"✅ [{tenant.name}] Daily report sent")
                    else:
                        logger.error(f"❌ [{tenant.name}] Failed to send daily report")
        
        except Exception as e:
            logger.error(f"Error checking tenants: {e}")
        finally:
            session.close()
    
    async def _send_report(self, tenant_id: int, tenant_name: str) -> bool:
        """Fetch report data and send via telegram."""
        try:
            report_data = await self._get_report_data(tenant_id)
            if not report_data:
                logger.warning(f"[{tenant_name}] No report data")
                return False
            
            from services.telegram_notifier import telegram_notifier
            result = await telegram_notifier.send_daily_report(
                tenant_id=tenant_id,
                report_data=report_data
            )
            return result.get("success", False)
        except Exception as e:
            logger.error(f"[{tenant_name}] Report error: {e}")
            return False
    
    async def _get_report_data(self, tenant_id: int) -> Optional[dict]:
        """Fetch daily report data for a tenant."""
        from database.connection import db
        from database.models import Sale, SaleItem, Payment, Customer, Stock, Product, User
        from sqlalchemy import func, and_
        from datetime import date as date_type
        
        session = db.get_session_direct()
        try:
            today = date_type.today()
            
            # Total sales
            sales_query = session.query(Sale).filter(
                Sale.tenant_id == tenant_id,
                func.date(Sale.created_at) == today,
                Sale.is_cancelled == False
            )
            
            total_sales = sales_query.count()
            total_amount = float(session.query(func.coalesce(func.sum(Sale.total_amount), 0)).filter(
                Sale.tenant_id == tenant_id,
                func.date(Sale.created_at) == today,
                Sale.is_cancelled == False
            ).scalar() or 0)
            
            total_paid = float(session.query(func.coalesce(func.sum(Sale.paid_amount), 0)).filter(
                Sale.tenant_id == tenant_id,
                func.date(Sale.created_at) == today,
                Sale.is_cancelled == False
            ).scalar() or 0)
            
            total_debt = float(session.query(func.coalesce(func.sum(Sale.debt_amount), 0)).filter(
                Sale.tenant_id == tenant_id,
                func.date(Sale.created_at) == today,
                Sale.is_cancelled == False
            ).scalar() or 0)
            
            total_discount = float(session.query(func.coalesce(func.sum(Sale.discount_amount), 0)).filter(
                Sale.tenant_id == tenant_id,
                func.date(Sale.created_at) == today,
                Sale.is_cancelled == False
            ).scalar() or 0)
            
            # Payment types
            payments = session.query(
                Payment.payment_type,
                func.sum(Payment.amount)
            ).filter(
                Payment.tenant_id == tenant_id,
                func.date(Payment.created_at) == today,
                Payment.is_cancelled == False
            ).group_by(Payment.payment_type).all()
            
            payment_totals = {p[0]: float(p[1] or 0) for p in payments}
            
            # Cashiers
            cashiers_data = session.query(
                User.id,
                func.concat(User.first_name, ' ', User.last_name).label('name'),
                func.count(Sale.id).label('count'),
                func.sum(Sale.total_amount).label('total'),
                func.sum(Sale.paid_amount).label('paid'),
                func.sum(Sale.debt_amount).label('debt')
            ).join(Sale, Sale.created_by == User.id).filter(
                Sale.tenant_id == tenant_id,
                func.date(Sale.created_at) == today,
                Sale.is_cancelled == False
            ).group_by(User.id).all()
            
            cashiers = [{
                "name": c.name, "sales_count": c.count,
                "total_amount": float(c.total or 0),
                "paid_amount": float(c.paid or 0),
                "debt_amount": float(c.debt or 0)
            } for c in cashiers_data]
            
            # Total all debt
            total_all_debt = float(session.query(
                func.coalesce(func.sum(Customer.current_debt), 0)
            ).filter(
                Customer.tenant_id == tenant_id,
                Customer.current_debt > 0
            ).scalar() or 0)
            
            # Low stock
            low_stock_data = session.query(Stock, Product).join(Product).filter(
                Stock.tenant_id == tenant_id,
                Product.is_deleted == False,
                Product.track_stock == True,
                Product.min_stock_level > 0,
                Stock.quantity < Product.min_stock_level
            ).all()
            
            low_stock = [{
                "name": p.name,
                "quantity": float(s.quantity),
                "uom": p.unit_of_measure.symbol if p.unit_of_measure else ""
            } for s, p in low_stock_data]
            
            return {
                "total_sales_count": total_sales,
                "total_amount": total_amount,
                "total_paid": total_paid,
                "total_debt": total_debt,
                "total_discount": total_discount,
                "cash_amount": payment_totals.get("CASH", 0),
                "card_amount": payment_totals.get("CARD", 0),
                "transfer_amount": payment_totals.get("TRANSFER", 0),
                "cashiers": cashiers,
                "total_all_debt": total_all_debt,
                "low_stock": low_stock,
            }
        except Exception as e:
            logger.error(f"Report data error: {e}")
            return None
        finally:
            session.close()
    
    def stop(self):
        self.running = False


# Global instance
scheduler = DailyReportScheduler()
