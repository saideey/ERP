"""
Tenant context management for multi-tenant SaaS.

Automatic tenant isolation via SQLAlchemy events:
1. Auto-filter: All SELECT queries get WHERE tenant_id=X automatically
2. Auto-set: New TenantBaseModel instances get tenant_id automatically  
3. Existing service code needs ZERO changes for reads/writes
"""

from contextvars import ContextVar
from typing import Optional

from sqlalchemy import event
from sqlalchemy.orm import Session, with_loader_criteria

from database.base import TenantBaseModel


# ==================== CONTEXT VARIABLES ====================

_current_tenant_id: ContextVar[Optional[int]] = ContextVar('current_tenant_id', default=None)
_bypass_tenant_filter: ContextVar[bool] = ContextVar('bypass_tenant_filter', default=False)


def set_current_tenant(tenant_id: int):
    _current_tenant_id.set(tenant_id)

def get_current_tenant_id() -> Optional[int]:
    return _current_tenant_id.get()

def clear_current_tenant():
    _current_tenant_id.set(None)

def set_bypass_tenant_filter(bypass: bool = True):
    _bypass_tenant_filter.set(bypass)

def is_tenant_filter_bypassed() -> bool:
    return _bypass_tenant_filter.get()


# ==================== SETUP (call once at startup) ====================

def setup_tenant_events():
    """
    Register SQLAlchemy events for automatic tenant isolation.
    Call once at app startup.
    """
    
    # Auto-filter all SELECT queries by tenant_id
    @event.listens_for(Session, "do_orm_execute")
    def _auto_filter_tenant(orm_execute_state):
        if not orm_execute_state.is_select:
            return
        if _bypass_tenant_filter.get():
            return
        tenant_id = _current_tenant_id.get()
        if tenant_id is None:
            return
        
        # with_loader_criteria on TenantBaseModel applies to ALL subclasses
        # This adds WHERE tenant_id=X to every query on tenant-scoped models
        orm_execute_state.statement = orm_execute_state.statement.options(
            with_loader_criteria(
                TenantBaseModel,
                lambda cls: cls.tenant_id == tenant_id,
                include_aliases=True,
            )
        )
    
    # Auto-set tenant_id on new model instances
    @event.listens_for(TenantBaseModel, "init", propagate=True)
    def _auto_set_tenant(target, args, kwargs):
        if 'tenant_id' not in kwargs or kwargs.get('tenant_id') is None:
            tenant_id = _current_tenant_id.get()
            if tenant_id is not None:
                target.tenant_id = tenant_id
    
    print("✅ Tenant auto-filtering registered")
