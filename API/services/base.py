"""
Base service class with tenant filtering support.
All tenant-scoped services should inherit from TenantServiceBase.
"""

from sqlalchemy.orm import Session, Query
from core.tenant import get_current_tenant_id


class TenantServiceBase:
    """
    Base service class that provides automatic tenant filtering.
    
    Usage:
        class ProductService(TenantServiceBase):
            def get_products(self):
                return self._q(Product).filter(Product.is_active == True).all()
    
    self._q(Model) is equivalent to:
        self.db.query(Model).filter(Model.tenant_id == current_tenant_id)
    """
    
    def __init__(self, db: Session, tenant_id: int = None):
        self.db = db
        self._tenant_id = tenant_id
    
    @property
    def tenant_id(self) -> int:
        """Get tenant_id - from parameter or context."""
        if self._tenant_id:
            return self._tenant_id
        return get_current_tenant_id()
    
    def _q(self, model) -> Query:
        """
        Create a tenant-filtered query.
        
        Automatically adds WHERE tenant_id = :current_tenant_id
        for models that have tenant_id column.
        """
        query = self.db.query(model)
        tid = self.tenant_id
        if tid and hasattr(model, 'tenant_id'):
            query = query.filter(model.tenant_id == tid)
        return query
