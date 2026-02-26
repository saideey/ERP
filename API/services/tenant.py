"""
Tenant service - handles tenant (company) management.
Creates tenants with all initial data (roles, UOMs, warehouse, admin user).
"""

from typing import Optional, Tuple, List
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import func

from database.models import (
    Tenant,
    Role, RoleType, PermissionType,
    User, UnitOfMeasure, Warehouse,
    SystemSetting, ExpenseCategory
)
from core.security import get_password_hash
from schemas.tenant import TenantCreate, TenantUpdate, TenantResponse


class TenantService:
    """Tenant management service."""
    
    def __init__(self, db: Session):
        self.db = db
    
    def slug_exists(self, slug: str) -> bool:
        """Check if slug is already taken."""
        return self.db.query(Tenant).filter(Tenant.slug == slug).first() is not None
    
    def get_tenant(self, tenant_id: int) -> Optional[Tenant]:
        """Get tenant by ID."""
        return self.db.query(Tenant).filter(Tenant.id == tenant_id).first()
    
    def get_tenant_by_slug(self, slug: str) -> Optional[Tenant]:
        """Get tenant by slug."""
        return self.db.query(Tenant).filter(Tenant.slug == slug).first()
    
    def list_tenants(
        self,
        search: Optional[str] = None,
        is_active: Optional[bool] = None,
        subscription_status: Optional[str] = None,
        page: int = 1,
        per_page: int = 20
    ) -> Tuple[List[Tenant], int]:
        """List tenants with filtering and pagination."""
        query = self.db.query(Tenant)
        
        if search:
            query = query.filter(
                (Tenant.name.ilike(f"%{search}%")) |
                (Tenant.slug.ilike(f"%{search}%")) |
                (Tenant.phone.ilike(f"%{search}%"))
            )
        
        if is_active is not None:
            query = query.filter(Tenant.is_active == is_active)
        
        if subscription_status:
            query = query.filter(Tenant.subscription_status == subscription_status)
        
        total = query.count()
        tenants = query.order_by(Tenant.created_at.desc()).offset(
            (page - 1) * per_page
        ).limit(per_page).all()
        
        return tenants, total
    
    def create_tenant(self, data: TenantCreate) -> Tenant:
        """
        Create a new tenant with all initial data.
        
        Steps:
        1. Create Tenant record
        2. Create default roles
        3. Create default UOMs
        4. Create default warehouse
        5. Create admin user (director)
        6. Create default system settings
        7. Create default expense categories
        """
        # 1. Create tenant
        plan_map = {
            'free': 'starter',
            'starter': 'starter',
            'basic': 'business',
            'business': 'business',
            'pro': 'premium',
            'premium': 'premium',
            'enterprise': 'enterprise',
        }
        
        tenant = Tenant(
            name=data.name,
            slug=data.slug,
            phone=data.phone,
            email=data.email,
            address=data.address,
            subscription_plan=plan_map.get(data.subscription_plan, 'starter'),
            subscription_status='trial',
            max_users=data.max_users,
            max_products=data.max_products,
            max_warehouses=data.max_warehouses,
            notes=data.notes,
            is_active=True,
            settings={}
        )
        self.db.add(tenant)
        self.db.flush()  # Get tenant.id
        
        # 2. Create default roles
        director_role = self._create_default_roles(tenant.id)
        
        # 3. Create default UOMs
        self._create_default_uoms(tenant.id)
        
        # 4. Create default warehouse
        self._create_default_warehouse(tenant.id)
        
        # 5. Create admin user
        self._create_admin_user(
            tenant_id=tenant.id,
            role_id=director_role.id,
            username=data.admin_username,
            password=data.admin_password,
            first_name=data.admin_first_name,
            last_name=data.admin_last_name,
            phone=data.admin_phone
        )
        
        # 6. Create default system settings
        self._create_default_settings(tenant.id)
        
        # 7. Create default expense categories
        self._create_default_expense_categories(tenant.id)
        
        self.db.commit()
        return tenant
    
    def update_tenant(self, tenant_id: int, data: TenantUpdate) -> Optional[Tenant]:
        """Update tenant info."""
        tenant = self.get_tenant(tenant_id)
        if not tenant:
            return None
        
        update_data = data.model_dump(exclude_unset=True)
        
        # Handle subscription_plan enum
        if 'subscription_plan' in update_data and update_data['subscription_plan']:
            plan_map = {
                'free': 'starter',
                'starter': 'starter',
                'basic': 'business',
                'business': 'business',
                'pro': 'premium',
                'premium': 'premium',
                'enterprise': 'enterprise',
            }
            update_data['subscription_plan'] = plan_map.get(
                update_data['subscription_plan'], tenant.subscription_plan
            )
        
        # Handle subscription_status enum
        if 'subscription_status' in update_data and update_data['subscription_status']:
            status_map = {
                'active': 'active',
                'trial': 'trial',
                'suspended': 'suspended',
                'cancelled': 'cancelled',
                'expired': 'expired',
            }
            update_data['subscription_status'] = status_map.get(
                update_data['subscription_status'], tenant.subscription_status
            )
        
        for key, value in update_data.items():
            setattr(tenant, key, value)
        
        self.db.commit()
        return tenant
    
    def suspend_tenant(self, tenant_id: int) -> Optional[Tenant]:
        """Suspend a tenant."""
        tenant = self.get_tenant(tenant_id)
        if not tenant:
            return None
        
        tenant.subscription_status = 'suspended'
        self.db.commit()
        return tenant
    
    def activate_tenant(self, tenant_id: int) -> Optional[Tenant]:
        """Activate a tenant."""
        tenant = self.get_tenant(tenant_id)
        if not tenant:
            return None
        
        tenant.subscription_status = 'active'
        tenant.is_active = True
        self.db.commit()
        return tenant
    
    def delete_tenant(self, tenant_id: int) -> bool:
        """Soft delete a tenant (deactivate)."""
        tenant = self.get_tenant(tenant_id)
        if not tenant:
            return False
        
        tenant.is_active = False
        tenant.subscription_status = 'cancelled'
        self.db.commit()
        return True
    
    def to_response(self, tenant: Tenant) -> TenantResponse:
        """Convert tenant model to response schema with stats."""
        users_count = self.db.query(func.count(User.id)).filter(
            User.tenant_id == tenant.id,
            User.is_active == True,
            User.is_deleted == False
        ).scalar() or 0
        
        from database.models import Product
        products_count = self.db.query(func.count(Product.id)).filter(
            Product.tenant_id == tenant.id,
            Product.is_active == True,
            Product.is_deleted == False
        ).scalar() or 0
        
        from database.models import Warehouse
        warehouses_count = self.db.query(func.count(Warehouse.id)).filter(
            Warehouse.tenant_id == tenant.id,
            Warehouse.is_deleted == False
        ).scalar() or 0
        
        return TenantResponse(
            id=tenant.id,
            name=tenant.name,
            slug=tenant.slug,
            logo_url=tenant.logo_url,
            phone=tenant.phone,
            email=tenant.email,
            address=tenant.address,
            subscription_plan=tenant.subscription_plan,
            subscription_status=tenant.subscription_status,
            max_users=tenant.max_users,
            max_products=tenant.max_products,
            max_warehouses=tenant.max_warehouses,
            is_active=tenant.is_active,
            notes=tenant.notes,
            payment_required=tenant.payment_required,
            payment_message=tenant.payment_message,
            created_at=tenant.created_at,
            updated_at=tenant.updated_at,
            users_count=users_count,
            products_count=products_count,
            warehouses_count=warehouses_count,
        )
    
    # ==================== PRIVATE: Initial Data Creation ====================
    
    def _create_default_roles(self, tenant_id: int) -> Role:
        """Create default roles for a new tenant. Returns director role."""
        
        # Director - full access
        director = Role(
            tenant_id=tenant_id,
            name="director",
            display_name="Direktor",
            description="To'liq kirish huquqi",
            role_type=RoleType.DIRECTOR,
            permissions=[p.value for p in PermissionType],
            max_discount_percent=100,
            is_system=True,
            is_active=True,
        )
        
        # Seller
        seller_permissions = [
            PermissionType.PRODUCT_VIEW.value,
            PermissionType.WAREHOUSE_VIEW.value,
            PermissionType.SALE_VIEW.value,
            PermissionType.SALE_CREATE.value,
            PermissionType.SALE_DISCOUNT.value,
            PermissionType.SALE_DEBT.value,
            PermissionType.CUSTOMER_VIEW.value,
            PermissionType.CUSTOMER_CREATE.value,
            PermissionType.CUSTOMER_EDIT.value,
            PermissionType.REPORT_SALES.value,
        ]
        seller = Role(
            tenant_id=tenant_id,
            name="seller",
            display_name="Sotuvchi",
            description="Sotuv, qoldiq ko'rish, chegirma berish",
            role_type=RoleType.SELLER,
            permissions=seller_permissions,
            max_discount_percent=15,
            is_system=True,
            is_active=True,
        )
        
        # Warehouse Manager
        warehouse_permissions = [
            PermissionType.PRODUCT_VIEW.value,
            PermissionType.WAREHOUSE_VIEW.value,
            PermissionType.WAREHOUSE_INCOME.value,
            PermissionType.WAREHOUSE_OUTCOME.value,
            PermissionType.WAREHOUSE_TRANSFER.value,
            PermissionType.WAREHOUSE_INVENTORY.value,
            PermissionType.STOCK_VIEW.value,
            PermissionType.STOCK_INCOME.value,
            PermissionType.STOCK_OUTCOME.value,
            PermissionType.STOCK_TRANSFER.value,
            PermissionType.STOCK_ADJUSTMENT.value,
            PermissionType.REPORT_WAREHOUSE.value,
        ]
        warehouse_mgr = Role(
            tenant_id=tenant_id,
            name="warehouse_manager",
            display_name="Omborchi",
            description="Ombor boshqaruvi",
            role_type=RoleType.WAREHOUSE_MANAGER,
            permissions=warehouse_permissions,
            max_discount_percent=0,
            is_system=True,
            is_active=True,
        )
        
        # Accountant
        accountant_permissions = [
            PermissionType.REPORT_SALES.value,
            PermissionType.REPORT_WAREHOUSE.value,
            PermissionType.REPORT_FINANCE.value,
            PermissionType.REPORT_PROFIT.value,
            PermissionType.REPORT_EXPORT.value,
            PermissionType.FINANCE_VIEW.value,
            PermissionType.PAYMENT_VIEW.value,
            PermissionType.CUSTOMER_VIEW.value,
        ]
        accountant = Role(
            tenant_id=tenant_id,
            name="accountant",
            display_name="Buxgalter",
            description="Hisobotlar va moliya",
            role_type=RoleType.ACCOUNTANT,
            permissions=accountant_permissions,
            max_discount_percent=0,
            is_system=True,
            is_active=True,
        )
        
        self.db.add_all([director, seller, warehouse_mgr, accountant])
        self.db.flush()
        
        return director
    
    def _create_default_uoms(self, tenant_id: int):
        """Create default units of measure for a new tenant."""
        uoms = [
            UnitOfMeasure(tenant_id=tenant_id, name="Kilogramm", symbol="kg", uom_type="weight", base_factor=1, decimal_places=2),
            UnitOfMeasure(tenant_id=tenant_id, name="Tonna", symbol="t", uom_type="weight", base_factor=1000, decimal_places=3),
            UnitOfMeasure(tenant_id=tenant_id, name="Gramm", symbol="g", uom_type="weight", base_factor=Decimal("0.001"), decimal_places=0),
            UnitOfMeasure(tenant_id=tenant_id, name="Dona", symbol="dona", uom_type="piece", base_factor=1, decimal_places=0, is_integer_only=True),
            UnitOfMeasure(tenant_id=tenant_id, name="Metr", symbol="m", uom_type="length", base_factor=1, decimal_places=2),
            UnitOfMeasure(tenant_id=tenant_id, name="Kvadrat metr", symbol="m²", uom_type="area", base_factor=1, decimal_places=2),
            UnitOfMeasure(tenant_id=tenant_id, name="Litr", symbol="l", uom_type="volume", base_factor=1, decimal_places=2),
            UnitOfMeasure(tenant_id=tenant_id, name="Pochka", symbol="pochka", uom_type="package", base_factor=1, decimal_places=0, is_integer_only=True),
            UnitOfMeasure(tenant_id=tenant_id, name="Qop", symbol="qop", uom_type="package", base_factor=1, decimal_places=0, is_integer_only=True),
        ]
        self.db.add_all(uoms)
        self.db.flush()
    
    def _create_default_warehouse(self, tenant_id: int):
        """Create default warehouse for a new tenant."""
        warehouse = Warehouse(
            tenant_id=tenant_id,
            name="Asosiy ombor",
            code="WH-01",
            is_main=True,
            is_active=True
        )
        self.db.add(warehouse)
        self.db.flush()
    
    def _create_admin_user(
        self, tenant_id: int, role_id: int,
        username: str, password: str,
        first_name: str, last_name: str,
        phone: str = None
    ):
        """Create admin user (director) for a new tenant."""
        admin_user = User(
            tenant_id=tenant_id,
            username=username.lower().strip(),
            password_hash=get_password_hash(password),
            first_name=first_name,
            last_name=last_name,
            phone=phone,
            role_id=role_id,
            is_active=True,
            language='uz'
        )
        self.db.add(admin_user)
        self.db.flush()
    
    def _create_default_settings(self, tenant_id: int):
        """Create default system settings for a new tenant."""
        defaults = [
            ("currency", "UZS", "Asosiy valyuta"),
            ("usd_rate", "12800", "USD kursi"),
            ("company_name", "", "Kompaniya nomi"),
            ("company_phone", "", "Kompaniya telefoni"),
            ("max_discount_percent", "50", "Maksimal chegirma foizi"),
            ("receipt_header", "", "Chek header matni"),
            ("receipt_footer", "Xaridingiz uchun rahmat!", "Chek footer matni"),
        ]
        
        for key, value, desc in defaults:
            setting = SystemSetting(
                tenant_id=tenant_id,
                key=key,
                value=value,
                description=desc
            )
            self.db.add(setting)
        self.db.flush()
    
    def _create_default_expense_categories(self, tenant_id: int):
        """Create default expense categories for a new tenant."""
        categories = [
            ("Ijara", "Ofis/do'kon ijara to'lovi"),
            ("Elektr energiya", "Elektr to'lovi"),
            ("Internet/Telefon", "Aloqa xarajatlari"),
            ("Transport", "Yetkazib berish, benzin"),
            ("Maosh", "Xodimlar maoshi"),
            ("Boshqa", "Boshqa xarajatlar"),
        ]
        
        for name, desc in categories:
            cat = ExpenseCategory(
                tenant_id=tenant_id,
                name=name,
                description=desc,
                is_active=True
            )
            self.db.add(cat)
        self.db.flush()
