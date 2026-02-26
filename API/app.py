"""
X ERP SYSTEM System - Main Application

Multi-tenant ERP system with path-based tenant routing:
- /api/v1/{tenant_slug}/...  → Tenant-scoped API
- /api/v1/super/...          → Super Admin API
- /api/v1/tenant/{slug}/info → Public tenant info (for login page)
"""

import os
from contextlib import asynccontextmanager
from fastapi import APIRouter, FastAPI, Request, Path, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from loguru import logger
from sqlalchemy.orm import Session

from database import init_db, db, get_db
from database.seed import seed_super_admin
from database.models import Tenant
from core.config import settings
from schemas.tenant import TenantPublicInfo

# Tenant-scoped routers
from routers import (
    auth_router, users_router, products_router,
    customers_router, warehouse_router, sales_router,
    reports_router, sms_router
)
from routers.settings import router as settings_router
from routers.sync import router as sync_router
from routers import printers

# Super Admin routers
from routers.super_admin import (
    super_auth_router, super_tenants_router, super_dashboard_router, super_billing_router
)
from routers.super_admin.telegram import router as super_telegram_router
from routers.super_admin.users import router as super_users_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    logger.info("🚀 Starting X ERP SYSTEM API...")

    try:
        init_db()
        logger.info("✅ Database initialized")

        # Setup tenant auto-filtering events
        from core.tenant import setup_tenant_events
        setup_tenant_events()
        logger.info("✅ Tenant events registered")

        # Seed super admin (first run only)
        with db.get_session() as session:
            seed_super_admin(session)
        logger.info("✅ Super admin seeded")

    except Exception as e:
        logger.error(f"❌ Database initialization failed: {e}")
        raise

    logger.info("✅ X ERP SYSTEM API started successfully!")
    
    # Start daily report scheduler (background task)
    import asyncio
    from services.daily_report_scheduler import scheduler
    scheduler_task = asyncio.create_task(scheduler.run())
    logger.info("📅 Daily report scheduler started")
    
    yield
    
    # Shutdown
    scheduler.stop()
    scheduler_task.cancel()
    logger.info("👋 Shutting down X ERP SYSTEM API...")


# Create FastAPI application
app = FastAPI(
    title="X ERP SYSTEM API",
    description="""
    Multi-tenant SaaS ERP tizimi qurilish mollari do'konlari uchun.
    
    ## Tenant API: /api/v1/{tenant_slug}/...
    * **Auth** - Kirish, chiqish, token yangilash
    * **Users** - Foydalanuvchilar boshqaruvi
    * **Products** - Tovarlar, kategoriyalar, narxlar
    * **Warehouse** - Qoldiq, kirim-chiqim, inventarizatsiya
    * **Sales** - Sotuv, chegirmalar, qarzga sotish
    * **Customers** - Mijozlar, VIP, qarz hisobi
    * **Reports** - Hisobotlar, eksport
    
    ## Super Admin API: /api/v1/super/...
    * **Tenants** - Kompaniyalar boshqaruvi
    * **Dashboard** - Umumiy statistika
    """,
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Geo-blocking middleware (Uzbekistan only)
from middleware.geo_block import GeoBlockMiddleware
app.add_middleware(GeoBlockMiddleware)

# Serve uploaded files (logos, etc.)
os.makedirs("/app/uploads/logos", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="/app/uploads"), name="uploads")


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "message": "Internal server error",
            "detail": str(exc) if settings.debug else None
        }
    )


# ==================== HEALTH & PUBLIC ENDPOINTS ====================

@app.get("/", tags=["Health"])
async def root():
    return {
        "message": "X ERP SYSTEM API",
        "version": "2.0.0",
        "status": "running"
    }


@app.get("/health", tags=["Health"])
async def health_check():
    from sqlalchemy import text
    try:
        with db.get_session() as session:
            session.execute(text("SELECT 1"))
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "database": "disconnected", "error": str(e)}
        )


@app.get(
    "/api/v1/tenant/{tenant_slug}/info",
    response_model=TenantPublicInfo,
    tags=["Public"]
)
async def get_tenant_public_info(
    tenant_slug: str = Path(..., description="Kompaniya slug"),
    db_session: Session = Depends(get_db)
):
    """
    Get public tenant info for login page.
    Only returns name, slug, and logo - no sensitive data.
    Used by frontend to show company name on login page.
    """
    tenant = db_session.query(Tenant).filter(
        Tenant.slug == tenant_slug,
        Tenant.is_active == True
    ).first()
    
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Kompaniya topilmadi"
        )
    
    return TenantPublicInfo(
        name=tenant.name,
        slug=tenant.slug,
        logo_url=tenant.logo_url,
        payment_required=tenant.payment_required,
        payment_message=tenant.payment_message
    )


# ==================== INTERNAL ENDPOINTS (Bot → API) ====================

@app.post("/api/v1/internal/telegram/link", tags=["Internal"])
async def telegram_link_director(
    request: Request,
    db_session: Session = Depends(get_db)
):
    """
    Called by Telegram Bot when a director clicks a deep link.
    Registers their telegram_id in SystemSetting for the tenant.
    """
    from database.models import SystemSetting
    
    data = await request.json()
    slug = data.get("tenant_slug", "")
    tg_id = data.get("telegram_id", "")
    tg_name = data.get("telegram_name", "")
    
    if not slug or not tg_id:
        raise HTTPException(400, "tenant_slug and telegram_id required")
    
    tenant = db_session.query(Tenant).filter(Tenant.slug == slug, Tenant.is_active == True).first()
    if not tenant:
        raise HTTPException(404, "Kompaniya topilmadi yoki faol emas")
    
    # Get or create director_telegram_ids setting
    setting = db_session.query(SystemSetting).filter(
        SystemSetting.tenant_id == tenant.id,
        SystemSetting.key == "director_telegram_ids"
    ).first()
    
    if setting:
        existing_ids = [x.strip() for x in setting.value.split(",") if x.strip()]
        if tg_id not in existing_ids:
            existing_ids.append(tg_id)
            setting.value = ",".join(existing_ids)
    else:
        db_session.add(SystemSetting(
            tenant_id=tenant.id,
            key="director_telegram_ids",
            value=tg_id,
            description=f"Telegram: director IDs",
            category="telegram"
        ))
    
    db_session.commit()
    
    return {
        "success": True,
        "tenant_name": tenant.name,
        "message": f"{tg_name} ({tg_id}) ulandi — {tenant.name}"
    }


# ==================== SUPER ADMIN ROUTES ====================

app.include_router(
    super_auth_router, 
    prefix="/api/v1/super/auth", 
    tags=["Super Admin - Auth"]
)
app.include_router(
    super_tenants_router, 
    prefix="/api/v1/super/tenants", 
    tags=["Super Admin - Tenants"]
)
app.include_router(
    super_dashboard_router, 
    prefix="/api/v1/super/dashboard", 
    tags=["Super Admin - Dashboard"]
)
app.include_router(
    super_telegram_router, 
    prefix="/api/v1/super/telegram", 
    tags=["Super Admin - Telegram"]
)
app.include_router(
    super_users_router, 
    prefix="/api/v1/super/tenants", 
    tags=["Super Admin - Users"]
)
app.include_router(
    super_billing_router,
    prefix="/api/v1/super/billing",
    tags=["Super Admin - Billing"]
)


# ==================== TENANT-SCOPED ROUTES ====================
# All tenant routes include {tenant_slug} in the path
# The resolve_tenant dependency in each router handles tenant resolution

TENANT_PREFIX = "/api/v1/{tenant_slug}"

app.include_router(auth_router, prefix=f"{TENANT_PREFIX}/auth", tags=["Authentication"])
app.include_router(users_router, prefix=f"{TENANT_PREFIX}/users", tags=["Users"])
app.include_router(products_router, prefix=f"{TENANT_PREFIX}/products", tags=["Products"])
app.include_router(customers_router, prefix=f"{TENANT_PREFIX}/customers", tags=["Customers"])
app.include_router(warehouse_router, prefix=f"{TENANT_PREFIX}/warehouse", tags=["Warehouse"])
app.include_router(sales_router, prefix=f"{TENANT_PREFIX}/sales", tags=["Sales"])
app.include_router(reports_router, prefix=f"{TENANT_PREFIX}/reports", tags=["Reports"])
app.include_router(sms_router, prefix=f"{TENANT_PREFIX}/sms", tags=["SMS"])
app.include_router(settings_router, prefix=f"{TENANT_PREFIX}/settings", tags=["Settings"])
app.include_router(sync_router, prefix=f"{TENANT_PREFIX}/sync", tags=["Sync"])
app.include_router(printers.router, prefix=f"{TENANT_PREFIX}/printers", tags=["Printers"])

from routers.cross_transfer import router as cross_transfer_router
app.include_router(cross_transfer_router, prefix=f"{TENANT_PREFIX}/partners", tags=["Partners & Cross-Transfer"])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug
    )
