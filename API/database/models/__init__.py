"""
Database models package.
Export all models for easy importing.
"""

# Tenant (MUST be imported first - other models depend on it)
from .tenant import (
    Tenant,
    SubscriptionPlan,
    SubscriptionStatus,
)

# Super Admin (global, not tenant-scoped)
from .super_admin import (
    SuperAdmin,
)

# User and Authentication
from .user import (
    Role,
    RoleType,
    PermissionType,
    User,
    UserSession,
)

# Product and Catalog
from .product import (
    Category,
    UnitOfMeasure,
    Product,
    ProductUOMConversion,
    ProductPriceHistory,
)

# Warehouse and Stock
from .warehouse import (
    Warehouse,
    Stock,
    MovementType,
    StockMovement,
    InventoryCheckStatus,
    InventoryCheck,
    InventoryCheckItem,
    StockTransfer,
    StockTransferItem,
)

# Customer and CRM
from .customer import (
    CustomerType,
    Customer,
    CustomerDebt,
    CustomerGroup,
    CustomerGroupMember,
    LoyaltyPoints,
    CustomerAddress,
)

# Sales
from .sale import (
    PaymentStatus,
    PaymentType,
    Sale,
    SaleItem,
    Payment,
    SaleReturn,
    SaleReturnItem,
    Receipt,
)

# Supplier and Purchasing
from .supplier import (
    Supplier,
    PurchaseOrderStatus,
    PurchaseOrder,
    PurchaseOrderItem,
    SupplierPayment,
    SupplierPriceList,
)

# Finance
from .finance import (
    CashRegister,
    TransactionType,
    CashTransaction,
    ExpenseCategory,
    CashShift,
    BankAccount,
    BankTransaction,
    DailyReport,
)

# Settings and System
from .settings import (
    SystemSetting,
    AuditLog,
    SMSTemplate,
    SMSLog,
    Notification,
    StockAlert,
    ScheduledTask,
    FileAttachment,
    ReportExport,
)

# Printers
from .printer import (
    Printer,
    UserPrinter,
    PrintJob,
    PrinterType,
    ConnectionType,
    PrintJobStatus,
)

# Cross-Tenant Partnerships & Transfers
from .cross_transfer import (
    TenantPartnership,
    CrossTenantTransfer,
    CrossTenantTransferItem,
    PartnerPayment,
    PartnerNotification,
)

from .billing import TenantBilling

from .login_log import SuperAdminLoginLog


__all__ = [
    # Tenant
    'Tenant',
    'SubscriptionPlan',
    'SubscriptionStatus',
    
    # Super Admin
    'SuperAdmin',

    # User
    'Role',
    'RoleType',
    'PermissionType',
    'User',
    'UserSession',

    # Product
    'Category',
    'UnitOfMeasure',
    'Product',
    'ProductUOMConversion',
    'ProductPriceHistory',

    # Warehouse
    'Warehouse',
    'Stock',
    'MovementType',
    'StockMovement',
    'InventoryCheckStatus',
    'InventoryCheck',
    'InventoryCheckItem',
    'StockTransfer',
    'StockTransferItem',

    # Customer
    'CustomerType',
    'Customer',
    'CustomerDebt',
    'CustomerGroup',
    'CustomerGroupMember',
    'LoyaltyPoints',
    'CustomerAddress',

    # Sale
    'PaymentStatus',
    'PaymentType',
    'Sale',
    'SaleItem',
    'Payment',
    'SaleReturn',
    'SaleReturnItem',
    'Receipt',

    # Supplier
    'Supplier',
    'PurchaseOrderStatus',
    'PurchaseOrder',
    'PurchaseOrderItem',
    'SupplierPayment',
    'SupplierPriceList',

    # Finance
    'CashRegister',
    'TransactionType',
    'CashTransaction',
    'ExpenseCategory',
    'CashShift',
    'BankAccount',
    'BankTransaction',
    'DailyReport',

    # Settings
    'SystemSetting',
    'AuditLog',
    'SMSTemplate',
    'SMSLog',
    'Notification',
    'StockAlert',
    'ScheduledTask',
    'FileAttachment',
    'ReportExport',

    # Printers
    'Printer',
    'UserPrinter',
    'PrintJob',
    'PrinterType',
    'ConnectionType',
    'PrintJobStatus',
]
