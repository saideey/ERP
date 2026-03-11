"""
Public Shop API — no authentication required.
Allows anyone to view store products and prices.
Controlled by online_shop feature toggle per tenant.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
from database.models import Tenant, Product, Category, UnitOfMeasure, Stock, ShopView, ShopLike
from core.ip_security import extract_client_ip

router = APIRouter()


def _safe_count(db, model, tenant_id, product_id=None):
    """Safely count views/likes — returns 0 if table doesn't exist yet."""
    try:
        q = db.query(func.count(model.id)).filter(model.tenant_id == tenant_id)
        if product_id is None:
            q = q.filter(model.product_id == None)
        else:
            q = q.filter(model.product_id == product_id)
        return q.scalar() or 0
    except Exception:
        return 0


# ==================== MARKETPLACE (all shops) ====================

@router.get("/")
async def marketplace_shops(
    search: Optional[str] = None,
    category_id: Optional[int] = None,
    region: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """List all tenants with online_shop enabled — public marketplace."""
    # Try loading shop categories (table may not exist yet)
    all_cats = []
    try:
        from database.models import ShopCategoryModel
        all_cats = db.query(ShopCategoryModel).filter(ShopCategoryModel.is_active == True).order_by(ShopCategoryModel.sort_order).all()
    except Exception:
        pass

    tenants = db.query(Tenant).filter(Tenant.is_active == True).all()

    shops = []
    regions_set = set()
    for t in tenants:
        if not t.is_subscription_active:
            continue
        settings = t.settings or {}
        features = settings.get("features", {})
        if not features.get("online_shop", False):
            continue

        if search and search.strip():
            term = search.strip().lower()
            if term not in (t.name or '').lower() and term not in (t.address or '').lower():
                continue

        # Safely read new fields (may not exist before migration)
        t_lat = getattr(t, 'latitude', None)
        t_lng = getattr(t, 'longitude', None)
        t_region = getattr(t, 'region', None)
        t_district = getattr(t, 'district', None)
        t_cat_id = getattr(t, 'shop_category_id', None)

        if category_id and t_cat_id != category_id:
            continue
        if region and (t_region or '').lower() != region.lower():
            continue
        if t_region:
            regions_set.add(t_region)

        product_count = db.query(func.count(Product.id)).filter(
            Product.tenant_id == t.id, Product.is_active == True, Product.is_deleted == False,
        ).scalar() or 0

        category_count = db.query(func.count(Category.id)).filter(
            Category.tenant_id == t.id, Category.is_active == True,
        ).scalar() or 0

        view_count = 0
        like_count = 0
        try:
            view_count = db.query(func.count(ShopView.id)).filter(ShopView.tenant_id == t.id, ShopView.product_id == None).scalar() or 0
            like_count = db.query(func.count(ShopLike.id)).filter(ShopLike.tenant_id == t.id, ShopLike.product_id == None).scalar() or 0
        except Exception:
            pass

        cat_name = None
        cat_icon = None
        if t_cat_id:
            for c in all_cats:
                if c.id == t_cat_id:
                    cat_name = c.name
                    cat_icon = c.icon
                    break

        shops.append({
            "slug": t.slug,
            "name": t.name,
            "logo_url": t.logo_url,
            "phone": t.phone,
            "address": t.address,
            "product_count": product_count,
            "category_count": category_count,
            "view_count": view_count,
            "like_count": like_count,
            "latitude": float(t_lat) if t_lat else None,
            "longitude": float(t_lng) if t_lng else None,
            "region": t_region,
            "district": t_district,
            "shop_category_id": t_cat_id,
            "shop_category_name": cat_name,
            "shop_category_icon": cat_icon,
        })

    return {
        "shops": shops,
        "total": len(shops),
        "categories": [{"id": c.id, "name": c.name, "icon": c.icon} for c in all_cats],
        "regions": sorted(list(regions_set)),
    }


def _get_shop_tenant(slug: str, db: Session) -> Tenant:
    """Get tenant with online_shop enabled. Raises 404 if not found or disabled."""
    tenant = db.query(Tenant).filter(
        Tenant.slug == slug,
        Tenant.is_active == True,
    ).first()

    if not tenant:
        raise HTTPException(404, "Do'kon topilmadi")

    if not tenant.is_subscription_active:
        raise HTTPException(404, "Do'kon topilmadi")

    # Check online_shop feature
    settings = tenant.settings or {}
    features = settings.get("features", {})
    if not features.get("online_shop", False):
        raise HTTPException(404, "Do'kon topilmadi")

    return tenant


@router.get("/{slug}/info")
async def shop_info(slug: str, db: Session = Depends(get_db)):
    """Public store info: name, logo, phone, address."""
    tenant = _get_shop_tenant(slug, db)

    # Count products
    product_count = db.query(func.count(Product.id)).filter(
        Product.tenant_id == tenant.id,
        Product.is_active == True,
        Product.is_deleted == False,
    ).scalar() or 0

    # Count categories
    category_count = db.query(func.count(Category.id)).filter(
        Category.tenant_id == tenant.id,
        Category.is_active == True,
    ).scalar() or 0

    shop_settings = (tenant.settings or {}).get("shop", {})
    tenant_settings = tenant.settings or {}

    return {
        "name": tenant.name,
        "slug": tenant.slug,
        "logo_url": tenant.logo_url,
        "phone": tenant.phone,
        "email": tenant.email,
        "address": tenant.address,
        "product_count": product_count,
        "category_count": category_count,
        "working_hours": shop_settings.get("working_hours", "09:00 — 18:00"),
        "description": shop_settings.get("description", ""),
        "telegram": tenant_settings.get("telegram_username", ""),
        "whatsapp": tenant_settings.get("whatsapp_number", tenant.phone or ""),
        "view_count": _safe_count(db, ShopView, tenant.id),
        "like_count": _safe_count(db, ShopLike, tenant.id),
    }


@router.get("/{slug}/categories")
async def shop_categories(slug: str, db: Session = Depends(get_db)):
    """Public categories list."""
    tenant = _get_shop_tenant(slug, db)

    categories = db.query(Category).filter(
        Category.tenant_id == tenant.id,
        Category.is_active == True,
    ).order_by(Category.sort_order, Category.name).all()

    # Count products per category
    result = []
    for cat in categories:
        count = db.query(func.count(Product.id)).filter(
            Product.tenant_id == tenant.id,
            Product.category_id == cat.id,
            Product.is_active == True,
            Product.is_deleted == False,
        ).scalar() or 0

        if count > 0:
            result.append({
                "id": cat.id,
                "name": cat.name,
                "image_url": cat.image_url if hasattr(cat, 'image_url') else None,
                "product_count": count,
            })

    return {"categories": result, "total": len(result)}


@router.get("/{slug}/products")
async def shop_products(
    slug: str,
    category_id: Optional[int] = None,
    search: Optional[str] = None,
    sort: Optional[str] = Query("name", regex="^(name|price_asc|price_desc)$"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """Public products list with filtering and sorting."""
    tenant = _get_shop_tenant(slug, db)

    query = db.query(Product).filter(
        Product.tenant_id == tenant.id,
        Product.is_active == True,
        Product.is_deleted == False,
    )

    # Filter by category
    if category_id:
        query = query.filter(Product.category_id == category_id)

    # Search
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            (Product.name.ilike(term)) |
            (Product.article.ilike(term)) |
            (Product.barcode.ilike(term))
        )

    # Count total
    total = query.count()

    # Sort
    if sort == "price_asc":
        query = query.order_by(Product.sale_price.asc())
    elif sort == "price_desc":
        query = query.order_by(Product.sale_price.desc())
    else:
        query = query.order_by(Product.sort_order, Product.name)

    # Paginate
    products = query.offset((page - 1) * per_page).limit(per_page).all()

    # Get stock availability and like counts
    product_ids = [p.id for p in products]
    stock_map = {}
    like_map = {}
    view_map = {}
    if product_ids:
        stocks = db.query(
            Stock.product_id,
            func.sum(Stock.quantity).label('total_qty')
        ).filter(Stock.product_id.in_(product_ids)).group_by(Stock.product_id).all()
        stock_map = {s.product_id: float(s.total_qty) > 0 for s in stocks}

        likes = db.query(
            ShopLike.product_id,
            func.count(ShopLike.id).label('cnt')
        ).filter(ShopLike.product_id.in_(product_ids)).group_by(ShopLike.product_id).all()
        like_map = {l.product_id: l.cnt for l in likes}

        views = db.query(
            ShopView.product_id,
            func.count(ShopView.id).label('cnt')
        ).filter(ShopView.product_id.in_(product_ids)).group_by(ShopView.product_id).all()
        view_map = {v.product_id: v.cnt for v in views}

    items = []
    for p in products:
        # Get UOM
        uom = db.query(UnitOfMeasure).filter(UnitOfMeasure.id == p.base_uom_id).first()

        items.append({
            "id": p.id,
            "name": p.name,
            "article": p.article,
            "category_id": p.category_id,
            "category_name": p.category.name if p.category else None,
            "sale_price": float(p.sale_price or 0),
            "sale_price_usd": float(p.sale_price_usd) if p.sale_price_usd else None,
            "image_url": p.image_url,
            "images": p.images.split(",") if p.images else [],
            "uom": uom.symbol if uom else "dona",
            "in_stock": stock_map.get(p.id, False),
            "color": p.color,
            "view_count": view_map.get(p.id, 0),
            "like_count": like_map.get(p.id, 0),
        })

    return {
        "products": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page,
    }


@router.get("/{slug}/products/{product_id}")
async def shop_product_detail(
    slug: str,
    product_id: int,
    db: Session = Depends(get_db)
):
    """Public single product detail."""
    tenant = _get_shop_tenant(slug, db)

    product = db.query(Product).filter(
        Product.id == product_id,
        Product.tenant_id == tenant.id,
        Product.is_active == True,
        Product.is_deleted == False,
    ).first()

    if not product:
        raise HTTPException(404, "Tovar topilmadi")

    uom = db.query(UnitOfMeasure).filter(UnitOfMeasure.id == product.base_uom_id).first()

    # Stock availability
    total_stock = db.query(func.sum(Stock.quantity)).filter(
        Stock.product_id == product.id,
    ).scalar() or 0

    return {
        "id": product.id,
        "name": product.name,
        "article": product.article,
        "barcode": product.barcode,
        "description": product.description,
        "category_id": product.category_id,
        "category_name": product.category.name if product.category else None,
        "sale_price": float(product.sale_price or 0),
        "sale_price_usd": float(product.sale_price_usd) if product.sale_price_usd else None,
        "image_url": product.image_url,
        "images": product.images.split(",") if product.images else [],
        "uom": uom.symbol if uom else "dona",
        "uom_name": uom.name if uom else "Dona",
        "in_stock": float(total_stock) > 0,
        "color": product.color,
        "view_count": db.query(func.count(ShopView.id)).filter(ShopView.product_id == product.id).scalar() or 0,
        "like_count": db.query(func.count(ShopLike.id)).filter(ShopLike.product_id == product.id).scalar() or 0,
    }


# ==================== ANALYTICS ENDPOINTS ====================

@router.post("/{slug}/view")
async def record_shop_view(slug: str, request: Request, db: Session = Depends(get_db)):
    """Record a shop page view (IP-based, every visit counts)."""
    tenant = _get_shop_tenant(slug, db)
    ip = extract_client_ip(request)
    view = ShopView(tenant_id=tenant.id, product_id=None, ip_address=ip, user_agent=(request.headers.get("user-agent") or "")[:500])
    db.add(view)
    db.commit()
    count = db.query(func.count(ShopView.id)).filter(ShopView.tenant_id == tenant.id, ShopView.product_id == None).scalar()
    return {"view_count": count}


@router.post("/{slug}/products/{product_id}/view")
async def record_product_view(slug: str, product_id: int, request: Request, db: Session = Depends(get_db)):
    """Record a product view."""
    tenant = _get_shop_tenant(slug, db)
    ip = extract_client_ip(request)
    view = ShopView(tenant_id=tenant.id, product_id=product_id, ip_address=ip, user_agent=(request.headers.get("user-agent") or "")[:500])
    db.add(view)
    db.commit()
    count = db.query(func.count(ShopView.id)).filter(ShopView.product_id == product_id).scalar()
    return {"view_count": count}


@router.post("/{slug}/like")
async def toggle_shop_like(slug: str, request: Request, db: Session = Depends(get_db)):
    """Toggle shop like. One like per IP. Returns new state."""
    tenant = _get_shop_tenant(slug, db)
    ip = extract_client_ip(request)
    existing = db.query(ShopLike).filter(ShopLike.tenant_id == tenant.id, ShopLike.product_id == None, ShopLike.ip_address == ip).first()
    if existing:
        db.delete(existing)
        db.commit()
        liked = False
    else:
        db.add(ShopLike(tenant_id=tenant.id, product_id=None, ip_address=ip))
        db.commit()
        liked = True
    count = db.query(func.count(ShopLike.id)).filter(ShopLike.tenant_id == tenant.id, ShopLike.product_id == None).scalar()
    return {"liked": liked, "like_count": count}


@router.post("/{slug}/products/{product_id}/like")
async def toggle_product_like(slug: str, product_id: int, request: Request, db: Session = Depends(get_db)):
    """Toggle product like."""
    tenant = _get_shop_tenant(slug, db)
    ip = extract_client_ip(request)
    existing = db.query(ShopLike).filter(ShopLike.tenant_id == tenant.id, ShopLike.product_id == product_id, ShopLike.ip_address == ip).first()
    if existing:
        db.delete(existing)
        db.commit()
        liked = False
    else:
        db.add(ShopLike(tenant_id=tenant.id, product_id=product_id, ip_address=ip))
        db.commit()
        liked = True
    count = db.query(func.count(ShopLike.id)).filter(ShopLike.product_id == product_id).scalar()
    return {"liked": liked, "like_count": count}


@router.get("/{slug}/my-likes")
async def get_my_likes(slug: str, request: Request, db: Session = Depends(get_db)):
    """Get list of product IDs liked by this IP."""
    tenant = _get_shop_tenant(slug, db)
    ip = extract_client_ip(request)
    likes = db.query(ShopLike.product_id).filter(ShopLike.tenant_id == tenant.id, ShopLike.ip_address == ip).all()
    shop_liked = db.query(ShopLike).filter(ShopLike.tenant_id == tenant.id, ShopLike.product_id == None, ShopLike.ip_address == ip).first() is not None
    return {
        "shop_liked": shop_liked,
        "liked_product_ids": [l.product_id for l in likes if l.product_id],
    }
