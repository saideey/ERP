import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search, Plus, Link2, Send, Package, Check, X, Loader2,
  ArrowRight, ArrowDown, ChevronDown, Truck, Clock, CheckCircle2, XCircle, Download,
  BarChart3, Wallet, Pencil
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  Button, Input, Card, CardContent, Badge,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui'
import api from '@/services/api'
import { formatMoney, cn } from '@/lib/utils'
import { useAuthStore } from '@/stores'

export default function PartnersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const validTabs = ['partners', 'outgoing', 'incoming', 'stats', 'payments'] as const
  type TabType = typeof validTabs[number]
  const urlTab = searchParams.get('tab') as TabType
  const [tab, setTab] = useState<TabType>(validTabs.includes(urlTab) ? urlTab : 'partners')
  const queryClient = useQueryClient()

  // Sync tab when URL changes (e.g., from notification click)
  useEffect(() => {
    const urlTab = searchParams.get('tab') as TabType
    if (urlTab && validTabs.includes(urlTab) && urlTab !== tab) {
      setTab(urlTab)
    }
  }, [searchParams])

  // Listen for custom event from NotificationBell
  useEffect(() => {
    const handler = (e: any) => {
      const t = e.detail?.tab as TabType
      if (t && validTabs.includes(t)) {
        setTab(t)
      }
    }
    window.addEventListener('partner-tab-change', handler)
    return () => window.removeEventListener('partner-tab-change', handler)
  }, [])

  // Sync tab with URL
  const changeTab = (t: TabType) => {
    setTab(t)
    setSearchParams(t === 'partners' ? {} : { tab: t })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Hamkorlar va Transferlar</h1>
          <p className="text-sm text-muted-foreground">Kompaniyalar arasi mahsulot almashinuvi</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto no-scrollbar">
        {([
          { key: 'partners', label: 'Hamkorlar', icon: Link2 },
          { key: 'outgoing', label: 'Yuborilgan', icon: Send },
          { key: 'incoming', label: 'Kelgan', icon: ArrowDown },
          { key: 'stats', label: 'Statistika', icon: BarChart3 },
          { key: 'payments', label: "To'lovlar", icon: Wallet },
        ] as const).map(t => (
          <button key={t.key} onClick={() => changeTab(t.key)}
            className={cn('px-4 py-2.5 font-medium border-b-2 transition-colors whitespace-nowrap text-sm flex items-center gap-2',
              tab === t.key ? 'border-primary text-primary' : 'border-transparent hover:text-primary'
            )}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {tab === 'partners' && <PartnersTab />}
      {tab === 'outgoing' && <OutgoingTab />}
      {tab === 'incoming' && <IncomingTab />}
      {tab === 'stats' && <StatsTab />}
      {tab === 'payments' && <PaymentsTab />}
    </div>
  )
}

/* ==================== PARTNERS TAB ==================== */
function PartnersTab() {
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [showSendDialog, setShowSendDialog] = useState<any>(null)
  const queryClient = useQueryClient()

  const { data: partnersData, isLoading } = useQuery({
    queryKey: ['partners'],
    queryFn: async () => { const { data } = await api.get('/partners'); return data.data },
  })
  const partners = partnersData || []

  const searchCompanies = async () => {
    if (searchQ.length < 2) return
    setSearching(true)
    try {
      const { data } = await api.get('/partners/search', { params: { q: searchQ } })
      setSearchResults(data.data || [])
    } catch { setSearchResults([]) }
    finally { setSearching(false) }
  }

  const sendRequest = async (targetId: number) => {
    try {
      await api.post('/partners/request', { target_tenant_id: targetId })
      toast.success("Hamkorlik so'rovi yuborildi!")
      queryClient.invalidateQueries({ queryKey: ['partners'] })
      setSearchResults([])
      setSearchQ('')
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Xatolik') }
  }

  const acceptPartner = async (id: number) => {
    try {
      await api.post(`/partners/${id}/accept`)
      toast.success('Hamkorlik qabul qilindi!')
      queryClient.invalidateQueries({ queryKey: ['partners'] })
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Xatolik') }
  }

  const rejectPartner = async (id: number) => {
    try {
      await api.post(`/partners/${id}/reject`)
      toast.success('Rad etildi')
      queryClient.invalidateQueries({ queryKey: ['partners'] })
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Xatolik') }
  }

  const removePartner = async (id: number) => {
    try {
      await api.delete(`/partners/${id}`)
      toast.success('Hamkorlik bekor qilindi')
      queryClient.invalidateQueries({ queryKey: ['partners'] })
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Xatolik') }
  }

  return (
    <div className="space-y-6">
      {/* Search Companies */}
      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-semibold mb-2">Kompaniya qidirish</p>
          <div className="flex gap-2">
            <Input placeholder="Kompaniya nomi yoki slug..." value={searchQ} onChange={e => setSearchQ(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchCompanies()} className="flex-1" />
            <Button onClick={searchCompanies} disabled={searching || searchQ.length < 2}>
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </div>
          {searchResults.length > 0 && (
            <div className="mt-3 space-y-2">
              {searchResults.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                      {c.name[0]}
                    </div>
                    <div>
                      <div className="font-medium text-sm">{c.name}</div>
                      <div className="text-xs text-muted-foreground">/{c.slug} · {c.phone || ''}</div>
                    </div>
                  </div>
                  <Button size="sm" onClick={() => sendRequest(c.id)}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Hamkor+
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Partners List */}
      <div>
        <p className="text-sm font-semibold mb-3">Mening hamkorlarim ({partners.length})</p>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
        ) : partners.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Link2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Hamkorlar yo'q. Yuqoridan kompaniya qidiring.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {partners.map((p: any) => (
              <Card key={p.id} className={cn(p.status === 'pending' && 'border-amber-200 bg-amber-50/30')}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold">
                        {p.partner_name[0]}
                      </div>
                      <div>
                        <div className="font-semibold text-sm">{p.partner_name}</div>
                        <div className="text-xs text-muted-foreground">/{p.partner_slug}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {p.status === 'pending' && !p.is_requester && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => rejectPartner(p.id)}>
                            <X className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" onClick={() => acceptPartner(p.id)}>
                            <Check className="w-3.5 h-3.5 mr-1" /> Qabul
                          </Button>
                        </>
                      )}
                      {p.status === 'pending' && p.is_requester && (
                        <Badge variant="secondary">Kutilmoqda...</Badge>
                      )}
                      {p.status === 'accepted' && (
                        <>
                          <Button size="sm" onClick={() => setShowSendDialog(p)}>
                            <Send className="w-3.5 h-3.5 mr-1" /> Yuborish
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => removePartner(p.id)}>
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Send Transfer Dialog */}
      {showSendDialog && (
        <SendTransferDialog
          partner={showSendDialog}
          onClose={() => setShowSendDialog(null)}
        />
      )}
    </div>
  )
}

/* ==================== SEND TRANSFER DIALOG ==================== */
function SendTransferDialog({ partner, onClose }: { partner: any; onClose: () => void }) {
  const [warehouseId, setWarehouseId] = useState<number>(0)
  const [items, setItems] = useState<any[]>([])
  const [notes, setNotes] = useState('')
  const [sending, setSending] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const queryClient = useQueryClient()

  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => { const { data } = await api.get('/warehouse'); return data.data || data },
  })
  const warehouses = warehousesData || []

  const { data: productsData } = useQuery({
    queryKey: ['products-transfer', warehouseId],
    queryFn: async () => {
      const { data } = await api.get('/products', { params: { per_page: 500, warehouse_id: warehouseId || undefined } })
      return data.data || []
    },
    enabled: !!warehouseId,
  })
  const allProducts: any[] = productsData || []

  // Filter products by search (client-side)
  const filteredProducts = allProducts.filter((p: any) =>
    !items.find(i => i.product_id === p.id) &&
    (!productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase()))
  )

  useEffect(() => {
    if (warehouses.length > 0 && !warehouseId) {
      const main = warehouses.find((w: any) => w.is_main) || warehouses[0]
      setWarehouseId(main.id)
    }
  }, [warehouses])

  const addItem = (product: any) => {
    if (items.find(i => i.product_id === product.id)) return
    setItems(prev => [...prev, {
      product_id: product.id,
      product_name: product.name,
      quantity: 1,
      uom_id: product.base_uom_id,
      uom_symbol: product.base_uom_symbol,
      available: product.current_stock || 0,
      sale_price: product.sale_price || 0,
      sale_price_usd: product.sale_price_usd || null,
    }])
  }

  const updateItem = (idx: number, field: string, value: any) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  const totalAmount = items.reduce((sum, i) => sum + (i.sale_price * i.quantity), 0)

  const handleSend = async () => {
    if (!warehouseId) { toast.error('Ombor tanlang'); return }
    if (items.length === 0) { toast.error('Mahsulot qo\'shing'); return }

    setSending(true)
    try {
      await api.post('/partners/transfers', {
        receiver_tenant_id: partner.partner_id,
        sender_warehouse_id: warehouseId,
        items: items.map(i => ({
          product_id: i.product_id,
          quantity: i.quantity,
          uom_id: i.uom_id,
          sale_price: i.sale_price,
          sale_price_usd: i.sale_price_usd,
        })),
        notes,
      })
      toast.success(`${partner.partner_name} ga transfer yuborildi!`)
      queryClient.invalidateQueries({ queryKey: ['outgoing-transfers'] })
      onClose()
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Xatolik') }
    finally { setSending(false) }
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mahsulot yuborish → {partner.partner_name}</DialogTitle>
          <DialogDescription>Mahsulotlarni tanlang va sotish narxini kiriting</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Warehouse Select */}
          <div>
            <label className="text-sm font-medium block mb-1">Qaysi ombordan</label>
            <select value={warehouseId} onChange={e => setWarehouseId(Number(e.target.value))}
              className="w-full px-3 py-2 border rounded-lg text-sm outline-none">
              {warehouses.map((w: any) => (
                <option key={w.id} value={w.id}>{w.name} {w.is_main ? '(Asosiy)' : ''}</option>
              ))}
            </select>
          </div>

          {/* Product Select - Dropdown + Search */}
          <div>
            <label className="text-sm font-medium block mb-1">Mahsulot qo'shish</label>
            {/* Dropdown select */}
            <div className="flex gap-2 mb-2">
              <select
                onChange={e => {
                  const p = allProducts.find((p: any) => p.id === Number(e.target.value))
                  if (p) { addItem(p); e.target.value = '' }
                }}
                className="flex-1 px-3 py-2 border rounded-lg text-sm outline-none"
                defaultValue=""
              >
                <option value="" disabled>— Mahsulot tanlang —</option>
                {allProducts.filter((p: any) => !items.find(i => i.product_id === p.id) && Number(p.current_stock) > 0).map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.current_stock} {p.base_uom_symbol})
                  </option>
                ))}
              </select>
            </div>
            {/* Search filter */}
            <Input placeholder="Yoki qidirish..." value={productSearch} onChange={e => setProductSearch(e.target.value)} />
            {filteredProducts.length > 0 && productSearch && (
              <div className="mt-1 max-h-40 overflow-y-auto border rounded-lg">
                {filteredProducts.slice(0, 10).map((p: any) => (
                  <button key={p.id} onClick={() => { addItem(p); setProductSearch('') }}
                    className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm flex items-center justify-between border-b last:border-0">
                    <span>{p.name}</span>
                    <span className="text-xs text-muted-foreground">Qoldiq: {p.current_stock} {p.base_uom_symbol}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Items Table */}
          {items.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2">Mahsulot</th>
                    <th className="text-center px-2 py-2 w-20">Miqdor</th>
                    <th className="text-center px-2 py-2 w-28">Narx (so'm)</th>
                    <th className="text-right px-3 py-2 w-28">Jami</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="px-3 py-2">
                        <div className="font-medium">{item.product_name}</div>
                        <div className="text-xs text-muted-foreground">Mavjud: {item.available} {item.uom_symbol}</div>
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" min={0.01} step="any" value={item.quantity}
                          onChange={e => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1 border rounded text-center text-sm" />
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" min={0} step="any" value={item.sale_price}
                          onChange={e => updateItem(idx, 'sale_price', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1 border rounded text-center text-sm" />
                      </td>
                      <td className="text-right px-3 py-2 font-medium">{formatMoney(item.sale_price * item.quantity)}</td>
                      <td className="px-1">
                        <button onClick={() => removeItem(idx)} className="p-1 hover:bg-red-50 rounded">
                          <X className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/30">
                  <tr>
                    <td colSpan={3} className="text-right px-3 py-2 font-semibold">Jami:</td>
                    <td className="text-right px-3 py-2 font-bold text-primary">{formatMoney(totalAmount)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-sm font-medium block mb-1">Izoh</label>
            <Input placeholder="Qo'shimcha ma'lumot..." value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Bekor</Button>
          <Button onClick={handleSend} disabled={sending || items.length === 0}>
            {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Yuborish ({items.length} ta mahsulot)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ==================== OUTGOING TRANSFERS ==================== */
const fmtDateTime = (d: string) => {
  if (!d) return ''
  const dt = new Date(d)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`
}

function OutgoingTab() {
  const [editTransfer, setEditTransfer] = useState<any>(null)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['outgoing-transfers'],
    queryFn: async () => { const { data } = await api.get('/partners/transfers/outgoing'); return data.data },
  })
  const transfers = data || []

  const downloadExcel = async (id: number, number: string) => {
    try {
      const response = await api.get(`/partners/transfers/${id}/export`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `transfer_${number}.xlsx`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch { toast.error('Yuklab olishda xatolik') }
  }

  const handleConfirmEdit = async (id: number) => {
    try {
      await api.post(`/partners/transfers/${id}/confirm`)
      toast.success("Tahrir tasdiqlandi!")
      queryClient.invalidateQueries({ queryKey: ['outgoing-transfers'] })
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Xatolik') }
  }

  const statusBadge = (t: any) => {
    const map: Record<string, { color: string; label: string; icon: any }> = {
      pending: { color: 'bg-amber-100 text-amber-700', label: 'Kutilmoqda', icon: Clock },
      accepted: { color: 'bg-green-100 text-green-700', label: 'Qabul qilindi', icon: CheckCircle2 },
      rejected: { color: 'bg-red-100 text-red-700', label: 'Rad etildi', icon: XCircle },
    }
    const needsMyConfirm = t.status === 'pending' && t.last_edited_by_tenant_id && t.last_edited_by_tenant_id !== t.sender_tenant_id
    if (needsMyConfirm) return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">⚠ Tasdiqlash kerak</span>
    const s = map[t.status] || map.pending
    return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.color}`}><s.icon className="w-3 h-3" />{s.label}</span>
  }

  return (
    <div className="space-y-3">
      {isLoading && <div className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>}
      {!isLoading && transfers.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Send className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Yuborilgan transferlar yo'q</p>
        </div>
      )}
      {transfers.map((t: any) => {
        const needsMyConfirm = t.status === 'pending' && t.last_edited_by_tenant_id && t.last_edited_by_tenant_id !== t.sender_tenant_id
        return (
          <Card key={t.id} className={cn(needsMyConfirm && 'border-orange-200 bg-orange-50/20')}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="text-sm font-bold text-primary">{t.transfer_number}</div>
                  {statusBadge(t)}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => downloadExcel(t.id, t.transfer_number)}
                    className="p-1.5 hover:bg-muted rounded-lg" title="Excel">
                    <Download className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <span className="text-xs text-muted-foreground">{fmtDateTime(t.created_at)}</span>
                </div>
              </div>

              {/* Items with prices */}
              <div className="bg-muted/30 rounded-lg p-2 mb-2 space-y-1">
                {t.items?.map((item: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between text-xs">
                    <span>{item.product_name}</span>
                    <span className="font-medium">{item.quantity} {item.uom_symbol} × {formatMoney(item.sale_price)}</span>
                  </div>
                ))}
                <div className="border-t pt-1 mt-1 flex justify-between text-xs font-bold">
                  <span>Jami:</span>
                  <span className="text-primary">{formatMoney(t.total_amount)}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                <span>{t.sender_warehouse_name}</span>
                <ArrowRight className="w-4 h-4" />
                <span className="font-medium text-foreground">{t.receiver_tenant_name}</span>
              </div>

              {t.reject_reason && (
                <div className="mt-2 text-xs text-red-600 bg-red-50 px-2 py-1 rounded">Sabab: {t.reject_reason}</div>
              )}

              {/* Action buttons for sender */}
              {t.status === 'pending' && (
                <div className="flex gap-2 mt-2">
                  <button onClick={() => setEditTransfer(t)}
                    className="px-3 py-1.5 text-xs rounded-lg border hover:bg-muted/50 flex items-center gap-1">
                    <Pencil className="w-3 h-3" /> Tahrirlash
                  </button>
                  {needsMyConfirm && (
                    <Button size="sm" onClick={() => handleConfirmEdit(t.id)}>
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Tasdiqlash
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}

      {editTransfer && (
        <EditTransferDialog transfer={editTransfer} onClose={() => { setEditTransfer(null); queryClient.invalidateQueries({ queryKey: ['outgoing-transfers'] }) }} />
      )}
    </div>
  )
}

/* ==================== INCOMING TRANSFERS ==================== */
function IncomingTab() {
  const [acceptDialog, setAcceptDialog] = useState<any>(null)
  const [selectedWarehouse, setSelectedWarehouse] = useState<number>(0)
  const [productMappings, setProductMappings] = useState<Record<number, number | null>>({})
  const [processing, setProcessing] = useState(false)
  const [editTransfer, setEditTransfer] = useState<any>(null)
  const queryClient = useQueryClient()

  const downloadExcel = async (id: number, number: string) => {
    try {
      const response = await api.get(`/partners/transfers/${id}/export`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `transfer_${number}.xlsx`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch { toast.error('Yuklab olishda xatolik') }
  }

  const { data, isLoading } = useQuery({
    queryKey: ['incoming-transfers'],
    queryFn: async () => { const { data } = await api.get('/partners/transfers/incoming'); return data.data },
  })
  const transfers = data || []

  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => { const { data } = await api.get('/warehouse'); return data.data || data },
  })
  const warehouses = warehousesData || []

  // Load my products for mapping when dialog opens
  const { data: myProductsData } = useQuery({
    queryKey: ['my-products-for-mapping'],
    queryFn: async () => {
      const { data } = await api.get('/products', { params: { per_page: 500 } })
      return data.data || []
    },
    enabled: !!acceptDialog,
  })
  const myProducts: any[] = myProductsData || []

  const openAcceptDialog = (t: any) => {
    setAcceptDialog(t)
    setSelectedWarehouse(warehouses[0]?.id || 0)
    // Initialize mappings — null means auto-create
    const mappings: Record<number, number | null> = {}
    t.items.forEach((item: any) => { mappings[item.id] = null })
    setProductMappings(mappings)
  }

  const handleAccept = async () => {
    if (!selectedWarehouse) { toast.error('Ombor tanlang'); return }
    setProcessing(true)
    try {
      const mappings = Object.entries(productMappings).map(([itemId, productId]) => ({
        transfer_item_id: Number(itemId),
        receiver_product_id: productId,
      }))
      await api.post(`/partners/transfers/${acceptDialog.id}/accept`, {
        warehouse_id: selectedWarehouse,
        mappings,
      })
      toast.success('Transfer qabul qilindi! Mahsulotlar omborga qo\'shildi.')
      queryClient.invalidateQueries({ queryKey: ['incoming-transfers'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setAcceptDialog(null)
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Xatolik') }
    finally { setProcessing(false) }
  }

  const handleReject = async (id: number) => {
    setProcessing(true)
    try {
      await api.post(`/partners/transfers/${id}/reject`, { reason: 'Rad etildi' })
      toast.success('Transfer rad etildi. Mahsulotlar qaytarildi.')
      queryClient.invalidateQueries({ queryKey: ['incoming-transfers'] })
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Xatolik') }
    finally { setProcessing(false) }
  }

  const statusBadge = (status: string) => {
    const map: Record<string, { color: string; label: string }> = {
      pending: { color: 'bg-amber-100 text-amber-700', label: 'Tasdiqlash kerak' },
      accepted: { color: 'bg-green-100 text-green-700', label: 'Qabul qilingan' },
      rejected: { color: 'bg-red-100 text-red-700', label: 'Rad etilgan' },
    }
    const s = map[status] || map.pending
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.color}`}>{s.label}</span>
  }

  return (
    <div className="space-y-3">
      {isLoading && <div className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>}
      {!isLoading && transfers.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <ArrowDown className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Kiruvchi transferlar yo'q</p>
        </div>
      )}
      {transfers.map((t: any) => (
        <Card key={t.id} className={cn(t.status === 'pending' && 'border-amber-200 bg-amber-50/20')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="text-sm font-bold text-primary">{t.transfer_number}</div>
                {statusBadge(t.status)}
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <button onClick={() => downloadExcel(t.id, t.transfer_number)}
                  className="p-1.5 hover:bg-muted rounded-lg" title="Excel yuklab olish">
                  <Download className="w-4 h-4" />
                </button>
                {fmtDateTime(t.created_at)}
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm mb-2">
              <span className="font-medium">{t.sender_tenant_name}</span>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Menga</span>
            </div>

            {/* Items preview */}
            <div className="bg-muted/30 rounded-lg p-2 mb-3 space-y-1">
              {t.items.map((item: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between text-xs">
                  <span>{item.product_name}</span>
                  <span className="font-medium">{item.quantity} {item.uom_symbol} × {formatMoney(item.sale_price)}</span>
                </div>
              ))}
              <div className="border-t pt-1 mt-1 flex justify-between text-xs font-bold">
                <span>Jami:</span>
                <span className="text-primary">{formatMoney(t.total_amount)}</span>
              </div>
            </div>

            {t.status === 'pending' && (() => {
              const iEditedLast = t.last_edited_by_tenant_id && t.last_edited_by_tenant_id === t.receiver_tenant_id
              return (
                <div className="space-y-2">
                  {iEditedLast && (
                    <div className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                      ⚠ Siz tahrir qildingiz. Yuboruvchi tasdiqlashi kerak.
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleReject(t.id)} disabled={processing}>
                      <XCircle className="w-3.5 h-3.5 mr-1" /> Rad etish
                    </Button>
                    <button onClick={() => setEditTransfer(t)}
                      className="px-3 py-1.5 text-xs rounded-lg border hover:bg-muted/50 flex items-center gap-1">
                      <Pencil className="w-3 h-3" /> Tahrirlash
                    </button>
                    {!iEditedLast && (
                      <Button size="sm" onClick={() => openAcceptDialog(t)} disabled={processing}>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Qabul qilish
                      </Button>
                    )}
                  </div>
                </div>
              )
            })()}
          </CardContent>
        </Card>
      ))}

      {/* Accept Dialog — Warehouse + Product Mapping */}
      <Dialog open={!!acceptDialog} onOpenChange={() => setAcceptDialog(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Transfer qabul qilish</DialogTitle>
            <DialogDescription>
              {acceptDialog?.sender_tenant_name} dan {acceptDialog?.items_count} ta mahsulot. 
              Har bir mahsulotni o'zingizning mahsulotingizga biriktiring yoki yangi yarating.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Warehouse Select */}
            <div>
              <label className="text-sm font-medium block mb-1">Qaysi omborga kirsin?</label>
              <select value={selectedWarehouse} onChange={e => setSelectedWarehouse(Number(e.target.value))}
                className="w-full px-3 py-2.5 border rounded-lg text-sm outline-none">
                {warehouses.map((w: any) => (
                  <option key={w.id} value={w.id}>{w.name} {w.is_main ? '(Asosiy)' : ''}</option>
                ))}
              </select>
            </div>

            {/* Product Mapping */}
            <div>
              <label className="text-sm font-medium block mb-2">Mahsulotlarni biriktirish</label>
              <div className="space-y-3">
                {acceptDialog?.items.map((item: any) => {
                  const mappedId = productMappings[item.id]
                  return (
                    <div key={item.id} className="border rounded-lg p-3 space-y-2">
                      {/* Incoming product info */}
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-medium">{item.product_name}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {item.quantity} {item.uom_symbol} × {formatMoney(item.sale_price)}
                          </span>
                        </div>
                        <span className="text-sm font-bold text-primary">{formatMoney(item.total_amount)}</span>
                      </div>
                      
                      {/* Mapping dropdown */}
                      <div className="flex items-center gap-2">
                        <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <select
                          value={mappedId ?? ''}
                          onChange={e => {
                            const val = e.target.value
                            setProductMappings(prev => ({
                              ...prev,
                              [item.id]: val ? Number(val) : null,
                            }))
                          }}
                          className={cn(
                            "flex-1 px-3 py-2 border rounded-lg text-sm outline-none",
                            mappedId ? "border-green-300 bg-green-50/50" : "border-dashed"
                          )}
                        >
                          <option value="">✨ Yangi mahsulot yaratish</option>
                          {myProducts.map((p: any) => (
                            <option key={p.id} value={p.id}>
                              {p.name} (qoldiq: {p.current_stock} {p.base_uom_symbol})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Mapping status */}
                      {mappedId ? (
                        <div className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Mavjud mahsulotga qo'shiladi
                        </div>
                      ) : (
                        <div className="text-xs text-amber-600 flex items-center gap-1">
                          <Plus className="w-3 h-3" />
                          Yangi mahsulot yaratiladi
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAcceptDialog(null)}>Bekor</Button>
            <Button onClick={handleAccept} disabled={processing}>
              {processing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              Qabul qilish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editTransfer && (
        <EditTransferDialog transfer={editTransfer} onClose={() => { setEditTransfer(null); queryClient.invalidateQueries({ queryKey: ['incoming-transfers'] }) }} />
      )}
    </div>
  )
}


/* ==================== EDIT TRANSFER DIALOG ==================== */
function EditTransferDialog({ transfer, onClose }: { transfer: any; onClose: () => void }) {
  const [items, setItems] = useState<any[]>(
    (transfer.items || []).map((i: any) => ({ ...i }))
  )
  const [notes, setNotes] = useState(transfer.notes || '')
  const [saving, setSaving] = useState(false)

  const totalAmount = items.reduce((sum: number, i: any) => sum + (i.sale_price * i.quantity), 0)

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put(`/partners/transfers/${transfer.id}/edit`, {
        items: items.map(i => ({ item_id: i.id, sale_price: i.sale_price })),
        notes,
      })
      toast.success("Transfer tahrirlandi! Hamkor tasdiqlashi kerak.")
      onClose()
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Xatolik') }
    finally { setSaving(false) }
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Transfer tahrirlash — {transfer.transfer_number}</DialogTitle>
          <DialogDescription>Narxlarni o'zgartiring. Saqlangandan so'ng hamkor tasdiqlashi kerak.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2">Mahsulot</th>
                  <th className="text-center px-2 py-2 w-16">Miqdor</th>
                  <th className="text-center px-2 py-2 w-28">Narx (so'm)</th>
                  <th className="text-right px-3 py-2 w-24">Jami</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: any, idx: number) => (
                  <tr key={item.id} className="border-t">
                    <td className="px-3 py-2 text-sm">{item.product_name}</td>
                    <td className="px-2 py-2 text-center text-sm text-muted-foreground">
                      {item.quantity} {item.uom_symbol}
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" min={0} step="any" value={item.sale_price}
                        onChange={e => {
                          const newItems = [...items]
                          newItems[idx] = { ...item, sale_price: parseFloat(e.target.value) || 0 }
                          setItems(newItems)
                        }}
                        className="w-full px-2 py-1 border rounded text-center text-sm" />
                    </td>
                    <td className="text-right px-3 py-2 font-medium text-sm">{formatMoney(item.sale_price * item.quantity)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/30">
                <tr>
                  <td colSpan={3} className="text-right px-3 py-2 font-semibold text-sm">Jami:</td>
                  <td className="text-right px-3 py-2 font-bold text-primary text-sm">{formatMoney(totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Izoh</label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Izoh..." />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Bekor</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
            Saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
function StatsTab() {
  const [selectedPartner, setSelectedPartner] = useState<number | null>(null)

  const { data: summaryData, isLoading } = useQuery({
    queryKey: ['partner-stats-summary'],
    queryFn: async () => { const { data } = await api.get('/partners/stats/summary'); return data.data },
  })
  const summary = summaryData || []

  const { data: detailData } = useQuery({
    queryKey: ['partner-stats-detail', selectedPartner],
    queryFn: async () => { const { data } = await api.get(`/partners/stats/${selectedPartner}`); return data.data },
    enabled: !!selectedPartner,
  })

  if (isLoading) return <div className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>

  if (summary.length === 0) return (
    <div className="text-center py-12 text-muted-foreground">
      <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
      <p>Hamkorlar bilan transfer qilganingizda statistika paydo bo'ladi</p>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Partner Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {summary.map((p: any) => {
          const isSelected = selectedPartner === p.partner_id
          return (
            <Card key={p.partner_id}
              className={cn('cursor-pointer transition-all hover:shadow-md', isSelected && 'ring-2 ring-primary')}
              onClick={() => setSelectedPartner(isSelected ? null : p.partner_id)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                      {p.partner_name[0]}
                    </div>
                    <div className="font-semibold text-sm">{p.partner_name}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">{p.outgoing_count + p.incoming_count} ta transfer</div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-blue-50 rounded-lg p-2">
                    <div className="text-xs text-blue-600">Yuborilgan</div>
                    <div className="text-sm font-bold text-blue-700">{formatMoney(p.outgoing_amount)}</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-2">
                    <div className="text-xs text-green-600">Qabul qilingan</div>
                    <div className="text-sm font-bold text-green-700">{formatMoney(p.incoming_amount)}</div>
                  </div>
                  <div className={cn('rounded-lg p-2', p.balance >= 0 ? 'bg-emerald-50' : 'bg-red-50')}>
                    <div className="text-xs text-muted-foreground">Balans</div>
                    <div className={cn('text-sm font-bold', p.balance >= 0 ? 'text-emerald-700' : 'text-red-700')}>
                      {p.balance >= 0 ? '+' : ''}{formatMoney(p.balance)}
                    </div>
                  </div>
                </div>
                {/* Debt indicators */}
                <div className="flex gap-2 mt-2 text-xs">
                  {p.partner_debt > 0 && (
                    <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                      Unga qarz: {formatMoney(p.partner_debt)}
                    </span>
                  )}
                  {p.my_debt > 0 && (
                    <span className="text-red-600 bg-red-50 px-2 py-0.5 rounded">
                      Menga qarz: {formatMoney(p.my_debt)}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Partner Detail */}
      {selectedPartner && detailData && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">{detailData.partner_name} — batafsil statistika</h3>
              <button onClick={() => setSelectedPartner(null)} className="p-1 hover:bg-muted rounded">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Monthly Chart */}
            <div>
              <p className="text-sm font-medium mb-2">Oylik ko'rsatkichlar (so'm)</p>
              <div className="flex items-end gap-2 h-32">
                {detailData.monthly.map((m: any) => {
                  const max = Math.max(...detailData.monthly.map((x: any) => Math.max(x.outgoing, x.incoming)), 1)
                  const outH = (m.outgoing / max) * 100
                  const inH = (m.incoming / max) * 100
                  return (
                    <div key={m.month} className="flex-1 flex flex-col items-center gap-0.5">
                      <div className="w-full flex gap-0.5 items-end justify-center" style={{ height: '100px' }}>
                        <div className="w-3 bg-blue-400 rounded-t transition-all" style={{ height: `${Math.max(outH, 2)}%` }}
                          title={`Yuborilgan: ${formatMoney(m.outgoing)}`} />
                        <div className="w-3 bg-green-400 rounded-t transition-all" style={{ height: `${Math.max(inH, 2)}%` }}
                          title={`Qabul: ${formatMoney(m.incoming)}`} />
                      </div>
                      <span className="text-[10px] text-muted-foreground">{m.label}</span>
                    </div>
                  )
                })}
              </div>
              <div className="flex gap-4 mt-2 text-xs">
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-400 rounded" /> Yuborilgan</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-400 rounded" /> Qabul qilingan</span>
              </div>
            </div>

            {/* Top Products */}
            {detailData.top_products.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Eng ko'p almashilgan mahsulotlar</p>
                <div className="space-y-1.5">
                  {detailData.top_products.map((p: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between text-sm bg-muted/30 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">{idx + 1}</span>
                        <span>{p.name}</span>
                      </div>
                      <div className="flex gap-3 text-xs">
                        {p.out_sum > 0 && <span className="text-blue-600">↑ {formatMoney(p.out_sum)}</span>}
                        {p.in_sum > 0 && <span className="text-green-600">↓ {formatMoney(p.in_sum)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}


/* ==================== PAYMENTS TAB ==================== */
function PaymentsTab() {
  const [selectedPartner, setSelectedPartner] = useState<number | null>(null)
  const [showPayDialog, setShowPayDialog] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payType, setPayType] = useState('cash')
  const [payDirection, setPayDirection] = useState<'outgoing' | 'incoming'>('outgoing')
  const [payNotes, setPayNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const queryClient = useQueryClient()

  const { data: summaryData, isLoading } = useQuery({
    queryKey: ['partner-stats-summary'],
    queryFn: async () => { const { data } = await api.get('/partners/stats/summary'); return data.data },
  })
  const partners = summaryData || []

  const { data: paymentsData } = useQuery({
    queryKey: ['partner-payments', selectedPartner],
    queryFn: async () => { const { data } = await api.get(`/partners/payments/${selectedPartner}`); return data.data },
    enabled: !!selectedPartner,
  })
  const payments = paymentsData || []
  const filteredPayments = payments.filter((p: any) => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false
    if (dateFrom && p.payment_date < dateFrom) return false
    if (dateTo && p.payment_date > dateTo) return false
    return true
  })

  const currentPartner = partners.find((p: any) => p.partner_id === selectedPartner)

  const handlePay = async () => {
    if (!selectedPartner || !payAmount) { toast.error("Ma'lumotlarni to'ldiring"); return }
    setSaving(true)
    try {
      await api.post('/partners/payments', {
        partner_tenant_id: selectedPartner,
        amount: parseFloat(payAmount),
        payment_type: payType,
        direction: payDirection,
        notes: payNotes,
      })
      toast.success("To'lov qayd etildi!")
      queryClient.invalidateQueries({ queryKey: ['partner-payments'] })
      queryClient.invalidateQueries({ queryKey: ['partner-stats-summary'] })
      setShowPayDialog(false)
      setPayAmount('')
      setPayNotes('')
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Xatolik') }
    finally { setSaving(false) }
  }

  if (isLoading) return <div className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>

  if (partners.length === 0) return (
    <div className="text-center py-12 text-muted-foreground">
      <Wallet className="w-12 h-12 mx-auto mb-3 opacity-30" />
      <p>Hamkorlar bilan transfer qilganingizda to'lovlar paydo bo'ladi</p>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Partner Select */}
      <Card>
        <CardContent className="p-4">
          <label className="text-sm font-medium block mb-2">Hamkorni tanlang</label>
          <select value={selectedPartner || ''} onChange={e => setSelectedPartner(Number(e.target.value) || null)}
            className="w-full px-3 py-2.5 border rounded-lg text-sm outline-none">
            <option value="">— Hamkor tanlang —</option>
            {partners.map((p: any) => (
              <option key={p.partner_id} value={p.partner_id}>{p.partner_name}</option>
            ))}
          </select>
        </CardContent>
      </Card>

      {/* Selected Partner Debt Info */}
      {currentPartner && (
        <>
          {/* Debt Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="bg-blue-50/50 border-blue-200">
              <CardContent className="p-4 text-center">
                <div className="text-xs text-blue-600 mb-1">Men yuborgan (qarz berganim)</div>
                <div className="text-lg font-bold text-blue-700">{formatMoney(currentPartner.outgoing_amount)}</div>
              </CardContent>
            </Card>
            <Card className="bg-green-50/50 border-green-200">
              <CardContent className="p-4 text-center">
                <div className="text-xs text-green-600 mb-1">Menga yuborgan (qarz olganim)</div>
                <div className="text-lg font-bold text-green-700">{formatMoney(currentPartner.incoming_amount)}</div>
              </CardContent>
            </Card>
            <Card className={cn('border-2', currentPartner.balance >= 0 ? 'bg-emerald-50/50 border-emerald-300' : 'bg-red-50/50 border-red-300')}>
              <CardContent className="p-4 text-center">
                <div className="text-xs text-muted-foreground mb-1">
                  {currentPartner.balance >= 0 ? 'Unga qarz (menga to\'lashi kerak)' : 'Menga qarz (men to\'lashim kerak)'}
                </div>
                <div className={cn('text-xl font-bold', currentPartner.balance >= 0 ? 'text-emerald-700' : 'text-red-700')}>
                  {formatMoney(Math.abs(currentPartner.balance))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Add Payment Button */}
          <div className="flex justify-end">
            <Button onClick={() => setShowPayDialog(true)}>
              <Wallet className="w-4 h-4 mr-2" /> To'lov qayd etish
            </Button>
          </div>

          {/* Payment History */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium">To'lovlar tarixi</p>
              <span className="text-xs text-muted-foreground">{filteredPayments.length} ta</span>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-2 mb-3">
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 border rounded-lg text-xs outline-none bg-white">
                <option value="all">Barchasi</option>
                <option value="confirmed">Tasdiqlangan</option>
                <option value="pending">Kutilmoqda</option>
                <option value="rejected">Rad etilgan</option>
              </select>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="px-2.5 py-1.5 border rounded-lg text-xs outline-none bg-white" placeholder="Dan" />
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="px-2.5 py-1.5 border rounded-lg text-xs outline-none bg-white" placeholder="Gacha" />
              {(statusFilter !== 'all' || dateFrom || dateTo) && (
                <button onClick={() => { setStatusFilter('all'); setDateFrom(''); setDateTo('') }}
                  className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded-lg">✕ Tozalash</button>
              )}
            </div>

            {filteredPayments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">To'lovlar yo'q</div>
            ) : (
              <div className="space-y-2">
                {filteredPayments.map((p: any) => (
                  <div key={p.id} className={cn(
                    'p-3 rounded-lg border',
                    p.status === 'pending' ? 'bg-amber-50/30 border-amber-200' :
                    p.status === 'rejected' ? 'bg-red-50/20 border-red-100 opacity-60' :
                    p.is_outgoing ? 'bg-red-50/30 border-red-100' : 'bg-green-50/30 border-green-100'
                  )}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold',
                          p.is_outgoing ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
                        )}>
                          {p.is_outgoing ? '↑' : '↓'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{p.direction}</span>
                            <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium',
                              p.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                              p.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                              'bg-red-100 text-red-700'
                            )}>
                              {p.status === 'pending' ? 'Kutilmoqda' : p.status === 'confirmed' ? 'Tasdiqlangan' : 'Rad etilgan'}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {p.payment_date} · {p.payment_type === 'cash' ? 'Naqd' : p.payment_type === 'card' ? 'Karta' : p.payment_type === 'transfer' ? "O'tkazma" : p.payment_type}
                            {p.notes && ` · ${p.notes}`}
                          </div>
                          {p.reject_reason && (
                            <div className="text-xs text-red-500 mt-0.5">Sabab: {p.reject_reason}</div>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={cn('font-bold text-sm', p.is_outgoing ? 'text-red-600' : 'text-green-600')}>
                          {p.is_outgoing ? '-' : '+'}{formatMoney(p.amount)}
                        </div>
                        {/* Confirm/Reject buttons for other party */}
                        {p.status === 'pending' && p.can_confirm && (
                          <div className="flex gap-1 mt-1.5 justify-end">
                            <button
                              onClick={async () => {
                                try {
                                  await api.post(`/partners/payments/${p.id}/reject`, { reason: 'Rad etildi' })
                                  toast.success("To'lov rad etildi")
                                  queryClient.invalidateQueries({ queryKey: ['partner-payments'] })
                                  queryClient.invalidateQueries({ queryKey: ['partner-stats-summary'] })
                                } catch { toast.error('Xatolik') }
                              }}
                              className="px-2 py-1 text-xs rounded bg-red-50 text-red-600 hover:bg-red-100"
                            >
                              Rad
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  await api.post(`/partners/payments/${p.id}/confirm`)
                                  toast.success("To'lov tasdiqlandi!")
                                  queryClient.invalidateQueries({ queryKey: ['partner-payments'] })
                                  queryClient.invalidateQueries({ queryKey: ['partner-stats-summary'] })
                                } catch { toast.error('Xatolik') }
                              }}
                              className="px-2 py-1 text-xs rounded bg-green-50 text-green-600 hover:bg-green-100 font-medium"
                            >
                              ✓ Tasdiqlash
                            </button>
                          </div>
                        )}
                        {p.status === 'pending' && !p.can_confirm && (
                          <div className="text-[10px] text-amber-600 mt-1">Hamkor tasdiqlamoqda...</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add Payment Dialog */}
          <Dialog open={showPayDialog} onOpenChange={setShowPayDialog}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>To'lov qayd etish</DialogTitle>
                <DialogDescription>{currentPartner.partner_name} bilan hisob-kitob</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium block mb-1">Yo'nalish</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setPayDirection('outgoing')}
                      className={cn('px-3 py-2 rounded-lg border text-sm text-center transition-all',
                        payDirection === 'outgoing' ? 'border-red-300 bg-red-50 text-red-700 font-medium' : 'hover:bg-muted/50')}>
                      Men to'ladim ↑
                    </button>
                    <button onClick={() => setPayDirection('incoming')}
                      className={cn('px-3 py-2 rounded-lg border text-sm text-center transition-all',
                        payDirection === 'incoming' ? 'border-green-300 bg-green-50 text-green-700 font-medium' : 'hover:bg-muted/50')}>
                      Menga to'ladi ↓
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Summa (so'm)</label>
                  <Input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">To'lov turi</label>
                  <select value={payType} onChange={e => setPayType(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm outline-none">
                    <option value="cash">Naqd pul</option>
                    <option value="card">Karta</option>
                    <option value="transfer">Bank o'tkazmasi</option>
                    <option value="other">Boshqa</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Izoh</label>
                  <Input value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="Izoh..." />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowPayDialog(false)}>Bekor</Button>
                <Button onClick={handlePay} disabled={saving || !payAmount}>
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                  Saqlash
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  )
}
