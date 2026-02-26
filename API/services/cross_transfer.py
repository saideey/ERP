"""
Cross-Tenant Partnership & Transfer Service.

Handles:
- Partner search, request, accept/reject
- Cross-tenant product transfers
- Stock updates on accept
"""

from typing import Optional, Tuple, List
from decimal import Decimal
from datetime import date
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func

from database.models import (
    Tenant, User, Warehouse, Stock, Product, UnitOfMeasure,
    StockMovement, MovementType,
)
from database.models.cross_transfer import (
    TenantPartnership,
    CrossTenantTransfer,
    CrossTenantTransferItem,
)
from database.base import get_tashkent_now


class PartnershipService:
    def __init__(self, db: Session):
        self.db = db

    def search_tenants(self, query: str, my_tenant_id: int) -> list:
        """Search tenants by name or slug (exclude self)."""
        results = self.db.query(Tenant).filter(
            Tenant.id != my_tenant_id,
            Tenant.is_active == True,
            or_(
                Tenant.name.ilike(f"%{query}%"),
                Tenant.slug.ilike(f"%{query}%"),
            )
        ).limit(20).all()

        return [{
            "id": t.id,
            "name": t.name,
            "slug": t.slug,
            "logo_url": t.logo_url,
            "phone": t.phone,
        } for t in results]

    def get_my_partners(self, tenant_id: int) -> list:
        """Get all partnerships for a tenant."""
        partnerships = self.db.query(TenantPartnership).filter(
            or_(
                TenantPartnership.requester_tenant_id == tenant_id,
                TenantPartnership.target_tenant_id == tenant_id,
            ),
            TenantPartnership.status.in_(['pending', 'accepted'])
        ).all()

        result = []
        for p in partnerships:
            is_requester = p.requester_tenant_id == tenant_id
            partner = p.target_tenant if is_requester else p.requester_tenant
            result.append({
                "id": p.id,
                "partner_id": partner.id,
                "partner_name": partner.name,
                "partner_slug": partner.slug,
                "partner_logo": partner.logo_url,
                "partner_phone": partner.phone,
                "status": p.status,
                "is_requester": is_requester,
                "created_at": str(p.created_at),
            })
        return result

    def send_request(self, from_tenant_id: int, to_tenant_id: int, notes: str = None) -> Tuple[bool, str]:
        """Send partnership request."""
        if from_tenant_id == to_tenant_id:
            return False, "O'zingizga so'rov yubora olmaysiz"

        # Check target exists
        target = self.db.query(Tenant).filter(Tenant.id == to_tenant_id, Tenant.is_active == True).first()
        if not target:
            return False, "Kompaniya topilmadi"

        # Check duplicate (both directions)
        existing = self.db.query(TenantPartnership).filter(
            or_(
                and_(TenantPartnership.requester_tenant_id == from_tenant_id,
                     TenantPartnership.target_tenant_id == to_tenant_id),
                and_(TenantPartnership.requester_tenant_id == to_tenant_id,
                     TenantPartnership.target_tenant_id == from_tenant_id),
            ),
            TenantPartnership.status.in_(['pending', 'accepted'])
        ).first()

        if existing:
            if existing.status == 'accepted':
                return False, f"'{target.name}' bilan allaqachon hamkorsiz"
            return False, f"'{target.name}' ga so'rov allaqachon yuborilgan"

        partnership = TenantPartnership(
            requester_tenant_id=from_tenant_id,
            target_tenant_id=to_tenant_id,
            status='pending',
            notes=notes,
        )
        self.db.add(partnership)
        self.db.flush()

        # Notify target
        ns = NotificationService(self.db)
        from_tenant = self.db.query(Tenant).filter(Tenant.id == from_tenant_id).first()
        ns.create(
            tenant_id=to_tenant_id,
            notification_type='partnership_request',
            title="Yangi hamkorlik so'rovi",
            message=f"{from_tenant.name if from_tenant else '?'} hamkorlik so'radi.",
            reference_type='partnership',
            reference_id=partnership.id,
            from_tenant_id=from_tenant_id,
        )

        self.db.commit()
        return True, f"'{target.name}' ga hamkorlik so'rovi yuborildi"

    def accept_request(self, partnership_id: int, tenant_id: int) -> Tuple[bool, str]:
        """Accept partnership request (only target can accept)."""
        p = self.db.query(TenantPartnership).filter(
            TenantPartnership.id == partnership_id,
            TenantPartnership.target_tenant_id == tenant_id,
            TenantPartnership.status == 'pending'
        ).first()
        if not p:
            return False, "So'rov topilmadi"

        p.status = 'accepted'

        ns = NotificationService(self.db)
        ns.create(
            tenant_id=p.requester_tenant_id,
            notification_type='partnership_accepted',
            title="Hamkorlik qabul qilindi!",
            message="So'rovingiz qabul qilindi.",
            reference_type='partnership',
            reference_id=p.id,
            from_tenant_id=tenant_id,
        )

        self.db.commit()
        return True, "Hamkorlik qabul qilindi"

    def reject_request(self, partnership_id: int, tenant_id: int) -> Tuple[bool, str]:
        """Reject partnership request."""
        p = self.db.query(TenantPartnership).filter(
            TenantPartnership.id == partnership_id,
            TenantPartnership.target_tenant_id == tenant_id,
            TenantPartnership.status == 'pending'
        ).first()
        if not p:
            return False, "So'rov topilmadi"

        p.status = 'rejected'

        ns = NotificationService(self.db)
        ns.create(
            tenant_id=p.requester_tenant_id,
            notification_type='partnership_rejected',
            title="Hamkorlik rad etildi",
            message="So'rovingiz rad etildi.",
            reference_type='partnership',
            reference_id=p.id,
            from_tenant_id=tenant_id,
        )

        self.db.commit()
        return True, "Hamkorlik rad etildi"

    def remove_partner(self, partnership_id: int, tenant_id: int) -> Tuple[bool, str]:
        """Remove partnership (either party can remove)."""
        p = self.db.query(TenantPartnership).filter(
            TenantPartnership.id == partnership_id,
            or_(
                TenantPartnership.requester_tenant_id == tenant_id,
                TenantPartnership.target_tenant_id == tenant_id,
            )
        ).first()
        if not p:
            return False, "Hamkorlik topilmadi"

        p.status = 'cancelled'
        self.db.commit()
        return True, "Hamkorlik bekor qilindi"

    def are_partners(self, tenant_a: int, tenant_b: int) -> bool:
        """Check if two tenants are active partners."""
        return self.db.query(TenantPartnership).filter(
            or_(
                and_(TenantPartnership.requester_tenant_id == tenant_a,
                     TenantPartnership.target_tenant_id == tenant_b),
                and_(TenantPartnership.requester_tenant_id == tenant_b,
                     TenantPartnership.target_tenant_id == tenant_a),
            ),
            TenantPartnership.status == 'accepted'
        ).first() is not None


class CrossTransferService:
    def __init__(self, db: Session):
        self.db = db

    def _gen_number(self) -> str:
        """Generate transfer number like CT-20260223-001."""
        today = date.today()
        prefix = f"CT-{today.strftime('%Y%m%d')}"
        last = self.db.query(CrossTenantTransfer).filter(
            CrossTenantTransfer.transfer_number.like(f"{prefix}%")
        ).order_by(CrossTenantTransfer.id.desc()).first()

        if last:
            num = int(last.transfer_number.split('-')[-1]) + 1
        else:
            num = 1
        return f"{prefix}-{num:03d}"

    def create_transfer(
        self,
        sender_tenant_id: int,
        sender_warehouse_id: int,
        sender_user_id: int,
        receiver_tenant_id: int,
        items: List[dict],
        notes: str = None,
    ) -> Tuple[Optional[CrossTenantTransfer], str]:
        """Create cross-tenant transfer. Sender's stock is deducted immediately."""

        # Validate partnership
        ps = PartnershipService(self.db)
        if not ps.are_partners(sender_tenant_id, receiver_tenant_id):
            return None, "Bu kompaniya bilan hamkorlik mavjud emas"

        # Validate sender warehouse
        wh = self.db.query(Warehouse).filter(
            Warehouse.id == sender_warehouse_id,
            Warehouse.tenant_id == sender_tenant_id
        ).first()
        if not wh:
            return None, "Ombor topilmadi"

        if not items:
            return None, "Kamida bitta mahsulot kerak"

        # Create transfer
        transfer = CrossTenantTransfer(
            transfer_number=self._gen_number(),
            sender_tenant_id=sender_tenant_id,
            sender_warehouse_id=sender_warehouse_id,
            sender_user_id=sender_user_id,
            receiver_tenant_id=receiver_tenant_id,
            status='pending',
            transfer_date=date.today(),
            notes=notes,
            last_edited_by_tenant_id=sender_tenant_id,
        )
        self.db.add(transfer)
        self.db.flush()

        # Process items — deduct from sender's stock
        for item_data in items:
            product = self.db.query(Product).filter(
                Product.id == item_data['product_id'],
                Product.tenant_id == sender_tenant_id
            ).first()
            if not product:
                self.db.rollback()
                return None, f"Mahsulot topilmadi: ID {item_data['product_id']}"

            qty = Decimal(str(item_data['quantity']))
            uom_id = item_data['uom_id']

            # Convert to base UOM
            base_qty = qty
            if uom_id != product.base_uom_id:
                from database.models import ProductUOMConversion
                conv = self.db.query(ProductUOMConversion).filter(
                    ProductUOMConversion.product_id == product.id,
                    ProductUOMConversion.uom_id == uom_id
                ).first()
                if conv:
                    base_qty = qty * conv.conversion_factor

            # Check stock
            stock = self.db.query(Stock).filter(
                Stock.product_id == product.id,
                Stock.warehouse_id == sender_warehouse_id,
                Stock.tenant_id == sender_tenant_id
            ).first()

            available = (stock.quantity - stock.reserved_quantity) if stock else Decimal("0")
            if available < base_qty:
                self.db.rollback()
                return None, f"'{product.name}' uchun yetarli qoldiq yo'q. Mavjud: {available}"

            # Deduct stock
            stock_before = stock.quantity
            stock.quantity -= base_qty

            # Record movement
            movement = StockMovement(
                product_id=product.id,
                warehouse_id=sender_warehouse_id,
                movement_type=MovementType.TRANSFER_OUT,
                quantity=base_qty,
                uom_id=product.base_uom_id,
                base_quantity=base_qty,
                stock_before=stock_before,
                stock_after=stock.quantity,
                reference_type='cross_transfer',
                reference_id=transfer.id,
                notes=f"Kompaniyaga yuborish: CT-{transfer.id}",
                created_by_id=sender_user_id,
                tenant_id=sender_tenant_id,
            )
            self.db.add(movement)

            # Create transfer item
            sale_price = Decimal(str(item_data.get('sale_price', 0)))
            sale_price_usd = Decimal(str(item_data['sale_price_usd'])) if item_data.get('sale_price_usd') else None

            ti = CrossTenantTransferItem(
                transfer_id=transfer.id,
                product_id=product.id,
                quantity=qty,
                uom_id=uom_id,
                base_quantity=base_qty,
                sale_price=sale_price,
                sale_price_usd=sale_price_usd,
                total_amount=sale_price * qty,
                notes=item_data.get('notes'),
            )
            self.db.add(ti)

        # Notify receiver
        ns = NotificationService(self.db)
        ns.create(
            tenant_id=transfer.receiver_tenant_id,
            notification_type='transfer_incoming',
            title=f"Yangi transfer: {transfer.transfer_number}",
            message=f"{len(items)} ta mahsulot yuborildi.",
            reference_type='transfer',
            reference_id=transfer.id,
            from_tenant_id=sender_tenant_id,
        )

        self.db.commit()
        self.db.refresh(transfer)
        return transfer, f"Transfer #{transfer.transfer_number} yaratildi"

    def accept_transfer(
        self,
        transfer_id: int,
        receiver_tenant_id: int,
        receiver_user_id: int,
        receiver_warehouse_id: int,
        product_mappings: dict = None,
    ) -> Tuple[bool, str]:
        """
        Accept cross-tenant transfer. Add stock to receiver's warehouse.
        
        product_mappings: {transfer_item_id: receiver_product_id}
        If receiver_product_id is set, stock goes to that existing product.
        If None or missing, auto-create new product from sender's product.
        """

        transfer = self.db.query(CrossTenantTransfer).filter(
            CrossTenantTransfer.id == transfer_id,
            CrossTenantTransfer.receiver_tenant_id == receiver_tenant_id,
            CrossTenantTransfer.status == 'pending'
        ).first()
        if not transfer:
            return False, "Transfer topilmadi"

        # Receiver cannot accept if they were the last editor — sender must confirm first
        if transfer.last_edited_by_tenant_id == receiver_tenant_id:
            return False, "Siz oxirgi tahrir qilgansiz. Yuboruvchi avval tasdiqlashi kerak."

        # Validate receiver warehouse
        wh = self.db.query(Warehouse).filter(
            Warehouse.id == receiver_warehouse_id,
            Warehouse.tenant_id == receiver_tenant_id
        ).first()
        if not wh:
            return False, "Ombor topilmadi"

        # Process items - add to receiver's stock
        items = self.db.query(CrossTenantTransferItem).filter(
            CrossTenantTransferItem.transfer_id == transfer.id
        ).all()

        for item in items:
            # IMPORTANT: bypass tenant filter to access sender's product data
            from core.tenant import set_bypass_tenant_filter
            set_bypass_tenant_filter(True)
            sender_product = self.db.query(Product).filter(Product.id == item.product_id).first()
            sender_uom_obj = self.db.query(UnitOfMeasure).filter(
                UnitOfMeasure.id == sender_product.base_uom_id
            ).first() if sender_product else None
            set_bypass_tenant_filter(False)

            if not sender_product:
                continue

            receiver_product = None

            # 1. Check if user mapped this item to an existing product
            if product_mappings and item.id in product_mappings:
                mapped_id = product_mappings[item.id]
                if mapped_id:
                    receiver_product = self.db.query(Product).filter(
                        Product.id == mapped_id,
                        Product.tenant_id == receiver_tenant_id,
                        Product.is_deleted == False
                    ).first()

            # 2. If no mapping, try to find by exact name
            if not receiver_product:
                receiver_product = self.db.query(Product).filter(
                    Product.tenant_id == receiver_tenant_id,
                    Product.name == sender_product.name,
                    Product.is_deleted == False
                ).first()

            # 3. If still not found, auto-create
            if not receiver_product:
                # Auto-create product in receiver tenant
                receiver_uom = None
                if sender_uom_obj:
                    receiver_uom = self.db.query(UnitOfMeasure).filter(
                        UnitOfMeasure.tenant_id == receiver_tenant_id,
                        UnitOfMeasure.symbol == sender_uom_obj.symbol
                    ).first()

                if not receiver_uom:
                    # Fallback: first UOM of receiver
                    receiver_uom = self.db.query(UnitOfMeasure).filter(
                        UnitOfMeasure.tenant_id == receiver_tenant_id
                    ).first()

                if not receiver_uom:
                    continue

                receiver_product = Product(
                    name=sender_product.name,
                    article=sender_product.article,
                    barcode=sender_product.barcode,
                    base_uom_id=receiver_uom.id,
                    cost_price=item.sale_price,
                    sale_price=Decimal("0"),
                    tenant_id=receiver_tenant_id,
                    is_active=True,
                )
                self.db.add(receiver_product)
                self.db.flush()

            # Add stock
            # Always update cost_price from transfer price
            receiver_product.cost_price = item.sale_price

            stock = self.db.query(Stock).filter(
                Stock.product_id == receiver_product.id,
                Stock.warehouse_id == receiver_warehouse_id,
                Stock.tenant_id == receiver_tenant_id
            ).first()

            if not stock:
                stock = Stock(
                    product_id=receiver_product.id,
                    warehouse_id=receiver_warehouse_id,
                    quantity=Decimal("0"),
                    reserved_quantity=Decimal("0"),
                    average_cost=Decimal("0"),
                    last_purchase_cost=Decimal("0"),
                    tenant_id=receiver_tenant_id,
                )
                self.db.add(stock)
                self.db.flush()

            stock_before = stock.quantity
            # Calculate new average cost
            old_total = stock.quantity * (stock.average_cost or Decimal("0"))
            new_total = old_total + (item.base_quantity * item.sale_price)
            stock.quantity += item.base_quantity
            stock.average_cost = new_total / stock.quantity if stock.quantity > 0 else item.sale_price
            stock.last_purchase_cost = item.sale_price

            # Record income movement
            movement = StockMovement(
                product_id=receiver_product.id,
                warehouse_id=receiver_warehouse_id,
                movement_type=MovementType.TRANSFER_IN,
                quantity=item.base_quantity,
                uom_id=receiver_product.base_uom_id,
                base_quantity=item.base_quantity,
                unit_cost=item.sale_price,
                total_cost=item.sale_price * item.quantity,
                stock_before=stock_before,
                stock_after=stock.quantity,
                reference_type='cross_transfer',
                reference_id=transfer.id,
                notes=f"Kompaniyadan qabul: CT-{transfer.id}",
                created_by_id=receiver_user_id,
                tenant_id=receiver_tenant_id,
            )
            self.db.add(movement)

        # Update transfer
        transfer.status = 'accepted'
        transfer.receiver_warehouse_id = receiver_warehouse_id
        transfer.receiver_user_id = receiver_user_id
        transfer.accepted_at = get_tashkent_now()

        # Notify sender
        ns = NotificationService(self.db)
        ns.create(
            tenant_id=transfer.sender_tenant_id,
            notification_type='transfer_accepted',
            title=f"Transfer qabul qilindi: {transfer.transfer_number}",
            message="Mahsulotlar muvaffaqiyatli qabul qilindi.",
            reference_type='transfer',
            reference_id=transfer.id,
            from_tenant_id=receiver_tenant_id,
        )

        self.db.commit()
        return True, "Transfer qabul qilindi. Mahsulotlar omborga qo'shildi."

    def edit_transfer(
        self, transfer_id: int, editor_tenant_id: int,
        items_updates: list, notes: str = None,
    ) -> Tuple[bool, str]:
        """Edit transfer items (prices). Sets last_edited_by so other party must confirm."""
        from core.tenant import set_bypass_tenant_filter
        set_bypass_tenant_filter(True)

        transfer = self.db.query(CrossTenantTransfer).filter(
            CrossTenantTransfer.id == transfer_id,
            CrossTenantTransfer.status == 'pending',
            or_(
                CrossTenantTransfer.sender_tenant_id == editor_tenant_id,
                CrossTenantTransfer.receiver_tenant_id == editor_tenant_id,
            )
        ).first()
        if not transfer:
            set_bypass_tenant_filter(False)
            return False, "Transfer topilmadi"

        # Update item prices
        for upd in items_updates:
            item = self.db.query(CrossTenantTransferItem).filter(
                CrossTenantTransferItem.id == upd['item_id'],
                CrossTenantTransferItem.transfer_id == transfer.id,
            ).first()
            if item and 'sale_price' in upd:
                item.sale_price = Decimal(str(upd['sale_price']))
                item.total_amount = item.sale_price * item.quantity

        if notes is not None:
            transfer.notes = notes

        transfer.last_edited_by_tenant_id = editor_tenant_id

        # Notify other party
        other_tid = transfer.receiver_tenant_id if editor_tenant_id == transfer.sender_tenant_id else transfer.sender_tenant_id
        ns = NotificationService(self.db)
        ns.create(
            tenant_id=other_tid,
            notification_type='transfer_edited',
            title=f"Transfer tahrirlandi: {transfer.transfer_number}",
            message="Narxlar o'zgartirildi. Tasdiqlash kerak.",
            reference_type='transfer',
            reference_id=transfer.id,
            from_tenant_id=editor_tenant_id,
        )

        set_bypass_tenant_filter(False)
        self.db.commit()
        return True, "Transfer tahrirlandi. Hamkor tasdiqlashi kerak."

    def confirm_edit(
        self, transfer_id: int, confirmer_tenant_id: int,
    ) -> Tuple[bool, str]:
        """Sender confirms receiver's edit (or vice versa). Sets last_edited_by to confirmer."""
        from core.tenant import set_bypass_tenant_filter
        set_bypass_tenant_filter(True)

        transfer = self.db.query(CrossTenantTransfer).filter(
            CrossTenantTransfer.id == transfer_id,
            CrossTenantTransfer.status == 'pending',
            or_(
                CrossTenantTransfer.sender_tenant_id == confirmer_tenant_id,
                CrossTenantTransfer.receiver_tenant_id == confirmer_tenant_id,
            )
        ).first()
        if not transfer:
            set_bypass_tenant_filter(False)
            return False, "Transfer topilmadi"

        # Can only confirm if the OTHER party last edited
        if transfer.last_edited_by_tenant_id == confirmer_tenant_id:
            set_bypass_tenant_filter(False)
            return False, "Siz oxirgi tahrir qilgansiz. Hamkor tasdiqlashi kerak."

        transfer.last_edited_by_tenant_id = confirmer_tenant_id

        # Notify other party
        other_tid = transfer.receiver_tenant_id if confirmer_tenant_id == transfer.sender_tenant_id else transfer.sender_tenant_id
        ns = NotificationService(self.db)
        ns.create(
            tenant_id=other_tid,
            notification_type='transfer_confirmed_edit',
            title=f"Tahrir tasdiqlandi: {transfer.transfer_number}",
            message="Hamkoringiz o'zgarishlarni tasdiqladi.",
            reference_type='transfer',
            reference_id=transfer.id,
            from_tenant_id=confirmer_tenant_id,
        )

        set_bypass_tenant_filter(False)
        self.db.commit()
        return True, "Tahrir tasdiqlandi!"

    def reject_transfer(
        self, transfer_id: int, receiver_tenant_id: int, reason: str = None
    ) -> Tuple[bool, str]:
        """Reject transfer — return stock to sender."""
        transfer = self.db.query(CrossTenantTransfer).filter(
            CrossTenantTransfer.id == transfer_id,
            CrossTenantTransfer.receiver_tenant_id == receiver_tenant_id,
            CrossTenantTransfer.status == 'pending'
        ).first()
        if not transfer:
            return False, "Transfer topilmadi"

        # Return stock to sender
        items = self.db.query(CrossTenantTransferItem).filter(
            CrossTenantTransferItem.transfer_id == transfer.id
        ).all()

        for item in items:
            # Bypass tenant filter to access sender's stock
            from core.tenant import set_bypass_tenant_filter
            set_bypass_tenant_filter(True)
            stock = self.db.query(Stock).filter(
                Stock.product_id == item.product_id,
                Stock.warehouse_id == transfer.sender_warehouse_id,
                Stock.tenant_id == transfer.sender_tenant_id
            ).first()
            if stock:
                stock.quantity += item.base_quantity
            set_bypass_tenant_filter(False)

        transfer.status = 'rejected'
        transfer.reject_reason = reason
        transfer.rejected_at = get_tashkent_now()

        # Notify sender
        ns = NotificationService(self.db)
        ns.create(
            tenant_id=transfer.sender_tenant_id,
            notification_type='transfer_rejected',
            title=f"Transfer rad etildi: {transfer.transfer_number}",
            message=reason or "Mahsulotlar qaytarildi.",
            reference_type='transfer',
            reference_id=transfer.id,
            from_tenant_id=receiver_tenant_id,
        )

        self.db.commit()
        return True, "Transfer rad etildi. Mahsulotlar qaytarildi."

    def get_outgoing(self, tenant_id: int) -> list:
        """Get transfers sent by this tenant."""
        transfers = self.db.query(CrossTenantTransfer).filter(
            CrossTenantTransfer.sender_tenant_id == tenant_id
        ).order_by(CrossTenantTransfer.created_at.desc()).limit(50).all()
        return [self._to_dict(t, 'outgoing') for t in transfers]

    def get_incoming(self, tenant_id: int) -> list:
        """Get transfers received by this tenant."""
        transfers = self.db.query(CrossTenantTransfer).filter(
            CrossTenantTransfer.receiver_tenant_id == tenant_id
        ).order_by(CrossTenantTransfer.created_at.desc()).limit(50).all()
        return [self._to_dict(t, 'incoming') for t in transfers]

    def get_transfer_detail(self, transfer_id: int, tenant_id: int) -> Optional[dict]:
        """Get transfer details (either sender or receiver)."""
        transfer = self.db.query(CrossTenantTransfer).filter(
            CrossTenantTransfer.id == transfer_id,
            or_(
                CrossTenantTransfer.sender_tenant_id == tenant_id,
                CrossTenantTransfer.receiver_tenant_id == tenant_id,
            )
        ).first()
        if not transfer:
            return None
        return self._to_dict(transfer, 'detail')

    def _to_dict(self, t: CrossTenantTransfer, context: str = 'list') -> dict:
        from core.tenant import set_bypass_tenant_filter
        set_bypass_tenant_filter(True)

        items_data = []
        items = self.db.query(CrossTenantTransferItem).filter(
            CrossTenantTransferItem.transfer_id == t.id
        ).all()
        for i in items:
            # Explicitly load product and uom (may belong to different tenant)
            product = self.db.query(Product).filter(Product.id == i.product_id).first()
            uom = self.db.query(UnitOfMeasure).filter(UnitOfMeasure.id == i.uom_id).first()
            items_data.append({
                "id": i.id,
                "product_name": product.name if product else "?",
                "quantity": float(i.quantity),
                "uom_symbol": uom.symbol if uom else "?",
                "sale_price": float(i.sale_price),
                "sale_price_usd": float(i.sale_price_usd) if i.sale_price_usd else None,
                "total_amount": float(i.total_amount),
            })

        # Explicitly load warehouses (may belong to different tenants)
        sender_wh = self.db.query(Warehouse).filter(Warehouse.id == t.sender_warehouse_id).first()
        receiver_wh = self.db.query(Warehouse).filter(Warehouse.id == t.receiver_warehouse_id).first() if t.receiver_warehouse_id else None

        set_bypass_tenant_filter(False)

        return {
            "id": t.id,
            "transfer_number": t.transfer_number,
            "transfer_date": str(t.transfer_date),
            "status": t.status,
            "sender_tenant_id": t.sender_tenant_id,
            "receiver_tenant_id": t.receiver_tenant_id,
            "sender_tenant_name": t.sender_tenant.name if t.sender_tenant else "?",
            "sender_warehouse_name": sender_wh.name if sender_wh else "?",
            "receiver_tenant_name": t.receiver_tenant.name if t.receiver_tenant else "?",
            "receiver_warehouse_name": receiver_wh.name if receiver_wh else None,
            "total_amount": sum(i['total_amount'] for i in items_data),
            "items_count": len(items_data),
            "items": items_data,
            "notes": t.notes,
            "reject_reason": t.reject_reason,
            "created_at": str(t.created_at),
            "accepted_at": str(t.accepted_at) if t.accepted_at else None,
            "last_edited_by_tenant_id": t.last_edited_by_tenant_id,
        }


class PartnerStatsService:
    """Statistics for partner transfers."""

    def __init__(self, db: Session):
        self.db = db

    def get_partner_stats(self, tenant_id: int, partner_tenant_id: int) -> dict:
        """Get detailed stats for a specific partner."""
        from core.tenant import set_bypass_tenant_filter
        set_bypass_tenant_filter(True)

        # Outgoing transfers (I sent to partner)
        outgoing = self.db.query(CrossTenantTransfer).filter(
            CrossTenantTransfer.sender_tenant_id == tenant_id,
            CrossTenantTransfer.receiver_tenant_id == partner_tenant_id,
            CrossTenantTransfer.status == 'accepted',
        ).all()

        # Incoming transfers (partner sent to me)
        incoming = self.db.query(CrossTenantTransfer).filter(
            CrossTenantTransfer.sender_tenant_id == partner_tenant_id,
            CrossTenantTransfer.receiver_tenant_id == tenant_id,
            CrossTenantTransfer.status == 'accepted',
        ).all()

        # Calculate totals
        out_total = Decimal("0")
        in_total = Decimal("0")
        product_stats = {}  # {product_name: {out_qty, out_sum, in_qty, in_sum}}

        for t in outgoing:
            items = self.db.query(CrossTenantTransferItem).filter(
                CrossTenantTransferItem.transfer_id == t.id
            ).all()
            for item in items:
                out_total += item.total_amount or Decimal("0")
                product = self.db.query(Product).filter(Product.id == item.product_id).first()
                pname = product.name if product else "?"
                if pname not in product_stats:
                    product_stats[pname] = {"out_qty": 0, "out_sum": 0, "in_qty": 0, "in_sum": 0}
                product_stats[pname]["out_qty"] += float(item.quantity)
                product_stats[pname]["out_sum"] += float(item.total_amount or 0)

        for t in incoming:
            items = self.db.query(CrossTenantTransferItem).filter(
                CrossTenantTransferItem.transfer_id == t.id
            ).all()
            for item in items:
                in_total += item.total_amount or Decimal("0")
                product = self.db.query(Product).filter(Product.id == item.product_id).first()
                pname = product.name if product else "?"
                if pname not in product_stats:
                    product_stats[pname] = {"out_qty": 0, "out_sum": 0, "in_qty": 0, "in_sum": 0}
                product_stats[pname]["in_qty"] += float(item.quantity)
                product_stats[pname]["in_sum"] += float(item.total_amount or 0)

        # Monthly stats (last 6 months)
        from datetime import timedelta
        monthly = []
        today = date.today()
        for i in range(5, -1, -1):
            m_start = (today.replace(day=1) - timedelta(days=i * 30)).replace(day=1)
            if i > 0:
                m_end = (m_start + timedelta(days=32)).replace(day=1)
            else:
                m_end = today + timedelta(days=1)

            m_out = sum(
                float(item.total_amount or 0)
                for t in outgoing if m_start <= t.transfer_date < m_end
                for item in self.db.query(CrossTenantTransferItem).filter(
                    CrossTenantTransferItem.transfer_id == t.id
                ).all()
            )
            m_in = sum(
                float(item.total_amount or 0)
                for t in incoming if m_start <= t.transfer_date < m_end
                for item in self.db.query(CrossTenantTransferItem).filter(
                    CrossTenantTransferItem.transfer_id == t.id
                ).all()
            )
            monthly.append({
                "month": m_start.strftime("%Y-%m"),
                "label": m_start.strftime("%b"),
                "outgoing": m_out,
                "incoming": m_in,
            })

        # Top products by total volume
        top_products = sorted(
            [{"name": k, **v, "total": v["out_sum"] + v["in_sum"]} for k, v in product_stats.items()],
            key=lambda x: x["total"], reverse=True
        )[:10]

        # Debt calculation - only confirmed payments count
        from database.models.cross_transfer import PartnerPayment
        try:
            payments_to_partner = self.db.query(func.coalesce(func.sum(PartnerPayment.amount), 0)).filter(
                PartnerPayment.payer_tenant_id == tenant_id,
                PartnerPayment.receiver_tenant_id == partner_tenant_id,
                PartnerPayment.status == 'confirmed',
            ).scalar()
            payments_from_partner = self.db.query(func.coalesce(func.sum(PartnerPayment.amount), 0)).filter(
                PartnerPayment.payer_tenant_id == partner_tenant_id,
                PartnerPayment.receiver_tenant_id == tenant_id,
                PartnerPayment.status == 'confirmed',
            ).scalar()
        except Exception:
            self.db.rollback()
            payments_to_partner = 0
            payments_from_partner = 0

        # My debt to partner = what I received - what I paid
        my_debt = float(in_total) - float(payments_to_partner)
        # Partner's debt to me = what they received - what they paid
        partner_debt = float(out_total) - float(payments_from_partner)

        partner = self.db.query(Tenant).filter(Tenant.id == partner_tenant_id).first()

        set_bypass_tenant_filter(False)

        return {
            "partner_name": partner.name if partner else "?",
            "outgoing_count": len(outgoing),
            "incoming_count": len(incoming),
            "total_count": len(outgoing) + len(incoming),
            "outgoing_amount": float(out_total),
            "incoming_amount": float(in_total),
            "my_debt": my_debt,  # Positive = I owe them
            "partner_debt": partner_debt,  # Positive = they owe me
            "balance": partner_debt - my_debt,  # Positive = net they owe me
            "monthly": monthly,
            "top_products": top_products,
        }

    def get_all_partners_summary(self, tenant_id: int) -> list:
        """Summary stats for all partners."""
        from core.tenant import set_bypass_tenant_filter
        set_bypass_tenant_filter(True)

        ps = PartnershipService(self.db)
        partners = ps.get_my_partners(tenant_id)
        accepted = [p for p in partners if p['status'] == 'accepted']

        result = []
        for p in accepted:
            pid = p['partner_id']

            out_sum = self.db.query(func.coalesce(func.sum(CrossTenantTransferItem.total_amount), 0)).join(
                CrossTenantTransfer
            ).filter(
                CrossTenantTransfer.sender_tenant_id == tenant_id,
                CrossTenantTransfer.receiver_tenant_id == pid,
                CrossTenantTransfer.status == 'accepted',
            ).scalar()

            in_sum = self.db.query(func.coalesce(func.sum(CrossTenantTransferItem.total_amount), 0)).join(
                CrossTenantTransfer
            ).filter(
                CrossTenantTransfer.sender_tenant_id == pid,
                CrossTenantTransfer.receiver_tenant_id == tenant_id,
                CrossTenantTransfer.status == 'accepted',
            ).scalar()

            out_count = self.db.query(func.count(CrossTenantTransfer.id)).filter(
                CrossTenantTransfer.sender_tenant_id == tenant_id,
                CrossTenantTransfer.receiver_tenant_id == pid,
                CrossTenantTransfer.status == 'accepted',
            ).scalar()

            in_count = self.db.query(func.count(CrossTenantTransfer.id)).filter(
                CrossTenantTransfer.sender_tenant_id == pid,
                CrossTenantTransfer.receiver_tenant_id == tenant_id,
                CrossTenantTransfer.status == 'accepted',
            ).scalar()

            # Payments - only confirmed count
            from database.models.cross_transfer import PartnerPayment
            try:
                paid_to = float(self.db.query(func.coalesce(func.sum(PartnerPayment.amount), 0)).filter(
                    PartnerPayment.payer_tenant_id == tenant_id,
                    PartnerPayment.receiver_tenant_id == pid,
                    PartnerPayment.status == 'confirmed',
                ).scalar())
                paid_from = float(self.db.query(func.coalesce(func.sum(PartnerPayment.amount), 0)).filter(
                    PartnerPayment.payer_tenant_id == pid,
                    PartnerPayment.receiver_tenant_id == tenant_id,
                    PartnerPayment.status == 'confirmed',
                ).scalar())
            except Exception:
                self.db.rollback()
                paid_to = 0
                paid_from = 0

            my_debt = float(in_sum) - paid_to
            partner_debt = float(out_sum) - paid_from

            result.append({
                "partner_id": pid,
                "partner_name": p['partner_name'],
                "outgoing_count": int(out_count),
                "incoming_count": int(in_count),
                "outgoing_amount": float(out_sum),
                "incoming_amount": float(in_sum),
                "my_debt": my_debt,
                "partner_debt": partner_debt,
                "balance": partner_debt - my_debt,
            })

        set_bypass_tenant_filter(False)
        return result



class NotificationService:
    """Create and manage partner notifications."""

    def __init__(self, db: Session):
        self.db = db

    def create(self, tenant_id: int, notification_type: str, title: str,
               message: str = None, reference_type: str = None,
               reference_id: int = None, from_tenant_id: int = None):
        """Create a notification for a tenant."""
        from database.models.cross_transfer import PartnerNotification
        notif = PartnerNotification(
            tenant_id=tenant_id,
            notification_type=notification_type,
            title=title,
            message=message,
            reference_type=reference_type,
            reference_id=reference_id,
            from_tenant_id=from_tenant_id,
            is_read=False,
        )
        self.db.add(notif)
        # Don't commit here — caller commits

    def get_unread_count(self, tenant_id: int) -> int:
        from database.models.cross_transfer import PartnerNotification
        return self.db.query(func.count(PartnerNotification.id)).filter(
            PartnerNotification.tenant_id == tenant_id,
            PartnerNotification.is_read == False,
        ).scalar() or 0

    def get_notifications(self, tenant_id: int, limit: int = 30) -> list:
        from database.models.cross_transfer import PartnerNotification
        from core.tenant import set_bypass_tenant_filter
        set_bypass_tenant_filter(True)
        notifs = self.db.query(PartnerNotification).filter(
            PartnerNotification.tenant_id == tenant_id,
        ).order_by(PartnerNotification.id.desc()).limit(limit).all()

        result = []
        for n in notifs:
            from_name = None
            if n.from_tenant_id:
                t = self.db.query(Tenant).filter(Tenant.id == n.from_tenant_id).first()
                from_name = t.name if t else None
            result.append({
                "id": n.id,
                "type": n.notification_type,
                "title": n.title,
                "message": n.message,
                "reference_type": n.reference_type,
                "reference_id": n.reference_id,
                "from_tenant_name": from_name,
                "is_read": n.is_read,
                "created_at": str(n.created_at),
            })
        set_bypass_tenant_filter(False)
        return result

    def mark_read(self, tenant_id: int, notification_id: int = None):
        """Mark one or all notifications as read."""
        from database.models.cross_transfer import PartnerNotification
        q = self.db.query(PartnerNotification).filter(
            PartnerNotification.tenant_id == tenant_id,
            PartnerNotification.is_read == False,
        )
        if notification_id:
            q = q.filter(PartnerNotification.id == notification_id)
        q.update({"is_read": True})
        self.db.commit()


class PartnerPaymentService:
    """Partner payment tracking with confirmation."""

    def __init__(self, db: Session):
        self.db = db

    def add_payment(self, payer_tenant_id: int, receiver_tenant_id: int,
                    amount: float, payment_type: str, notes: str,
                    created_by_id: int) -> Tuple[bool, str]:
        """Record a payment (status=pending until other party confirms)."""
        from database.models.cross_transfer import PartnerPayment

        if amount <= 0:
            return False, "Summa musbat bo'lishi kerak"

        ps = PartnershipService(self.db)
        if not ps.are_partners(payer_tenant_id, receiver_tenant_id):
            return False, "Hamkorlik mavjud emas"

        payment = PartnerPayment(
            payer_tenant_id=payer_tenant_id,
            receiver_tenant_id=receiver_tenant_id,
            amount=Decimal(str(amount)),
            payment_type=payment_type,
            payment_date=date.today(),
            notes=notes,
            status='pending',
            created_by_id=created_by_id,
        )
        self.db.add(payment)
        self.db.flush()

        # Notify the other party
        from core.tenant import set_bypass_tenant_filter
        set_bypass_tenant_filter(True)
        payer = self.db.query(Tenant).filter(Tenant.id == payer_tenant_id).first()
        receiver = self.db.query(Tenant).filter(Tenant.id == receiver_tenant_id).first()
        set_bypass_tenant_filter(False)

        ns = NotificationService(self.db)
        # Notify the OTHER party (who didn't create the payment)
        # If creator is from payer, notify receiver
        # If creator is from receiver, notify payer
        from core.tenant import get_current_tenant_id
        current_tid = get_current_tenant_id()
        other_tid = receiver_tenant_id if current_tid == payer_tenant_id else payer_tenant_id
        payer_name = payer.name if payer else "?"
        receiver_name = receiver.name if receiver else "?"

        ns.create(
            tenant_id=other_tid,
            notification_type='payment_pending',
            title=f"Yangi to'lov: {self._fmt(amount)} so'm",
            message=f"{payer_name} → {receiver_name}. Tasdiqlash kerak.",
            reference_type='payment',
            reference_id=payment.id,
            from_tenant_id=current_tid,
        )

        self.db.commit()
        return True, "To'lov qayd etildi. Hamkor tasdiqlashi kerak."

    def confirm_payment(self, payment_id: int, tenant_id: int,
                        user_id: int) -> Tuple[bool, str]:
        """Confirm a pending payment."""
        from database.models.cross_transfer import PartnerPayment
        from core.tenant import set_bypass_tenant_filter
        set_bypass_tenant_filter(True)

        payment = self.db.query(PartnerPayment).filter(
            PartnerPayment.id == payment_id,
            PartnerPayment.status == 'pending',
        ).first()
        if not payment:
            set_bypass_tenant_filter(False)
            return False, "To'lov topilmadi"

        # Only the OTHER party can confirm
        if payment.payer_tenant_id != tenant_id and payment.receiver_tenant_id != tenant_id:
            set_bypass_tenant_filter(False)
            return False, "Ruxsat yo'q"

        payment.status = 'confirmed'
        payment.confirmed_by_id = user_id
        payment.confirmed_at = get_tashkent_now()

        # Notify creator
        creator_tenant = payment.payer_tenant_id
        # figure out who created — check created_by user's tenant
        # Simple: notify both tenants except current
        other_tid = payment.payer_tenant_id if tenant_id == payment.receiver_tenant_id else payment.receiver_tenant_id
        ns = NotificationService(self.db)
        ns.create(
            tenant_id=other_tid,
            notification_type='payment_confirmed',
            title=f"To'lov tasdiqlandi: {self._fmt(float(payment.amount))} so'm",
            message="Hamkoringiz to'lovni tasdiqladi.",
            reference_type='payment',
            reference_id=payment.id,
            from_tenant_id=tenant_id,
        )

        set_bypass_tenant_filter(False)
        self.db.commit()
        return True, "To'lov tasdiqlandi!"

    def reject_payment(self, payment_id: int, tenant_id: int,
                       reason: str = None) -> Tuple[bool, str]:
        """Reject a pending payment."""
        from database.models.cross_transfer import PartnerPayment
        from core.tenant import set_bypass_tenant_filter
        set_bypass_tenant_filter(True)

        payment = self.db.query(PartnerPayment).filter(
            PartnerPayment.id == payment_id,
            PartnerPayment.status == 'pending',
        ).first()
        if not payment:
            set_bypass_tenant_filter(False)
            return False, "To'lov topilmadi"

        if payment.payer_tenant_id != tenant_id and payment.receiver_tenant_id != tenant_id:
            set_bypass_tenant_filter(False)
            return False, "Ruxsat yo'q"

        payment.status = 'rejected'
        payment.reject_reason = reason

        other_tid = payment.payer_tenant_id if tenant_id == payment.receiver_tenant_id else payment.receiver_tenant_id
        ns = NotificationService(self.db)
        ns.create(
            tenant_id=other_tid,
            notification_type='payment_rejected',
            title=f"To'lov rad etildi: {self._fmt(float(payment.amount))} so'm",
            message=reason or "Hamkoringiz to'lovni rad etdi.",
            reference_type='payment',
            reference_id=payment.id,
            from_tenant_id=tenant_id,
        )

        set_bypass_tenant_filter(False)
        self.db.commit()
        return True, "To'lov rad etildi"

    def get_payments(self, tenant_id: int, partner_tenant_id: int) -> list:
        """Get payment history between two tenants."""
        from database.models.cross_transfer import PartnerPayment
        from core.tenant import set_bypass_tenant_filter
        set_bypass_tenant_filter(True)

        payments = self.db.query(PartnerPayment).filter(
            or_(
                and_(PartnerPayment.payer_tenant_id == tenant_id,
                     PartnerPayment.receiver_tenant_id == partner_tenant_id),
                and_(PartnerPayment.payer_tenant_id == partner_tenant_id,
                     PartnerPayment.receiver_tenant_id == tenant_id),
            )
        ).order_by(PartnerPayment.payment_date.desc(), PartnerPayment.id.desc()).limit(100).all()

        current_tid = tenant_id
        result = []
        for p in payments:
            is_outgoing = p.payer_tenant_id == current_tid
            # Can this user confirm? Only if other party created it and status=pending
            can_confirm = False
            if p.status == 'pending':
                # The party that did NOT create the record can confirm
                from database.models import User
                creator = self.db.query(User).filter(User.id == p.created_by_id).first()
                if creator:
                    creator_tenant = getattr(creator, 'tenant_id', None)
                    can_confirm = creator_tenant != current_tid

            result.append({
                "id": p.id,
                "amount": float(p.amount),
                "payment_type": p.payment_type,
                "payment_date": str(p.payment_date),
                "notes": p.notes,
                "status": p.status,
                "is_outgoing": is_outgoing,
                "direction": "Men to'ladim" if is_outgoing else "Menga to'ladi",
                "can_confirm": can_confirm,
                "reject_reason": p.reject_reason,
                "created_at": str(p.created_at),
                "confirmed_at": str(p.confirmed_at) if p.confirmed_at else None,
            })

        set_bypass_tenant_filter(False)
        return result

    def _fmt(self, n: float) -> str:
        if n >= 1_000_000:
            return f"{n/1_000_000:.1f}M"
        if n >= 1_000:
            return f"{n/1_000:.0f}K"
        return f"{n:.0f}"
