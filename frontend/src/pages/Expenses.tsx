import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Wallet, Plus, Trash2, Loader2, TrendingUp, TrendingDown, DollarSign, Calendar, BarChart3 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button, Input, Card, CardContent, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui'
import api from '@/services/api'
import { formatMoney, formatNumber } from '@/lib/utils'
import { useAuthStore } from '@/stores'
import { useLanguage } from '@/contexts/LanguageContext'

type Period = 'today' | 'week' | 'month' | 'year' | 'custom'
type Tab = 'expenses' | 'report'

export default function ExpensesPage() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const { t } = useLanguage()
  const isDirector = user?.role_type === 'director'

  const [tab, setTab] = useState<Tab>('expenses')
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showCatDialog, setShowCatDialog] = useState(false)
  const [filterCat, setFilterCat] = useState<number | null>(null)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Report state
  const [period, setPeriod] = useState<Period>('month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  // Form state
  const [form, setForm] = useState({ amount: '', description: '', category_id: '', type: 'expense' })
  const [newCatName, setNewCatName] = useState('')

  // Fetch categories
  const { data: catsData } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: async () => (await api.get('/expenses/categories')).data,
  })
  const categories = catsData?.categories || []

  // Fetch expenses
  const { data: expData, isLoading: loadingExp } = useQuery({
    queryKey: ['expenses', filterCat, startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filterCat) params.append('category_id', filterCat.toString())
      if (startDate) params.append('start_date', startDate)
      if (endDate) params.append('end_date', endDate)
      params.append('per_page', '100')
      return (await api.get(`/expenses?${params}`)).data
    },
    enabled: tab === 'expenses',
  })

  // Fetch net profit report
  const { data: reportData, isLoading: loadingReport } = useQuery({
    queryKey: ['net-profit', period, customStart, customEnd],
    queryFn: async () => {
      const params = new URLSearchParams({ period })
      if (period === 'custom' && customStart) params.append('start_date', customStart)
      if (period === 'custom' && customEnd) params.append('end_date', customEnd)
      return (await api.get(`/expenses/net-profit?${params}`)).data
    },
    enabled: tab === 'report',
  })

  // Create expense
  const addExpense = useMutation({
    mutationFn: async () => {
      return (await api.post('/expenses', {
        amount: parseFloat(form.amount),
        description: form.description,
        category_id: form.category_id ? parseInt(form.category_id) : null,
        type: form.type,
      })).data
    },
    onSuccess: () => {
      toast.success('Chiqim qo\'shildi')
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      queryClient.invalidateQueries({ queryKey: ['net-profit'] })
      setShowAddDialog(false)
      setForm({ amount: '', description: '', category_id: '', type: 'expense' })
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Xatolik'),
  })

  // Create category
  const addCategory = useMutation({
    mutationFn: async () => (await api.post('/expenses/categories', { name: newCatName })).data,
    onSuccess: () => {
      toast.success('Kategoriya qo\'shildi')
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] })
      setShowCatDialog(false)
      setNewCatName('')
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Xatolik'),
  })

  // Delete expense
  const deleteExpense = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/expenses/${id}`)).data,
    onSuccess: () => {
      toast.success('O\'chirildi')
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      queryClient.invalidateQueries({ queryKey: ['net-profit'] })
    },
  })

  // Delete category
  const deleteCat = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/expenses/categories/${id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] })
      toast.success('Kategoriya o\'chirildi')
    },
  })

  const periodLabels: Record<Period, string> = {
    today: 'Bugun', week: 'Bu hafta', month: 'Bu oy', year: 'Bu yil', custom: 'Tanlangan'
  }

  const typeLabels: Record<string, string> = {
    expense: '📦 Umumiy chiqim',
    salary: '💰 Oylik maosh',
    supplier_payment: '🚚 Yetkazib beruvchiga',
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-xl font-bold">💰 Chiqimlar va Sof Foyda</h1>
        <div className="flex gap-2">
          <Button size="sm" variant={tab === 'expenses' ? 'primary' : 'outline'} onClick={() => setTab('expenses')}>
            <Wallet className="w-4 h-4 mr-1" /> Chiqimlar
          </Button>
          <Button size="sm" variant={tab === 'report' ? 'primary' : 'outline'} onClick={() => setTab('report')}>
            <BarChart3 className="w-4 h-4 mr-1" /> Sof Foyda
          </Button>
        </div>
      </div>

      {tab === 'expenses' ? (
        /* ==================== EXPENSES TAB ==================== */
        <>
          {/* Top bar */}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="success" size="sm" onClick={() => setShowAddDialog(true)}>
              <Plus className="w-4 h-4 mr-1" /> Chiqim qo'shish
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowCatDialog(true)}>
              <Plus className="w-4 h-4 mr-1" /> Kategoriya
            </Button>
            <div className="flex-1" />
            <select value={filterCat || ''} onChange={e => setFilterCat(e.target.value ? parseInt(e.target.value) : null)}
              className="px-3 py-1.5 border rounded-lg text-sm">
              <option value="">Barcha kategoriyalar</option>
              {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="px-3 py-1.5 border rounded-lg text-sm" />
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="px-3 py-1.5 border rounded-lg text-sm" />
          </div>

          {/* Summary card */}
          {expData && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                      <TrendingDown className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Jami chiqim</p>
                      <p className="text-xl font-bold text-red-600">{formatMoney(expData.total_amount)}</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-400">{expData.total} ta yozuv</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Categories chips */}
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {categories.map((c: any) => (
                <div key={c.id} className="flex items-center gap-1 px-3 py-1 bg-gray-100 rounded-full text-xs">
                  <span>{c.name}</span>
                  {isDirector && (
                    <button onClick={() => { if (confirm('O\'chirilsinmi?')) deleteCat.mutate(c.id) }}
                      className="text-red-400 hover:text-red-600 ml-1">✕</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Expense list */}
          <Card>
            <CardContent className="p-0">
              {loadingExp ? (
                <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
              ) : !expData?.expenses?.length ? (
                <div className="text-center py-12">
                  <p className="text-3xl mb-2">📭</p>
                  <p className="text-gray-500 text-sm">Chiqimlar yo'q</p>
                </div>
              ) : (
                <div className="divide-y">
                  {expData.expenses.map((exp: any) => (
                    <div key={exp.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-sm">
                          {exp.transaction_type === 'salary' ? '💰' : exp.transaction_type === 'supplier_payment' ? '🚚' : '📦'}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{exp.description || typeLabels[exp.transaction_type] || 'Chiqim'}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {exp.category_name && <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">{exp.category_name}</span>}
                            <span className="text-[10px] text-gray-400">{exp.created_at?.slice(0, 16).replace('T', ' ')}</span>
                            {exp.created_by && <span className="text-[10px] text-gray-400">· {exp.created_by}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-red-600">-{formatMoney(exp.amount)}</span>
                        {isDirector && (
                          <button onClick={() => { if (confirm('O\'chirilsinmi?')) deleteExpense.mutate(exp.id) }}
                            className="text-gray-300 hover:text-red-500">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        /* ==================== NET PROFIT REPORT TAB ==================== */
        <>
          {/* Period selector */}
          <div className="flex flex-wrap gap-2">
            {(['today', 'week', 'month', 'year', 'custom'] as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${period === p ? 'bg-gray-800 text-white' : 'bg-white border text-gray-600 hover:border-gray-400'}`}>
                {periodLabels[p]}
              </button>
            ))}
            {period === 'custom' && (
              <div className="flex gap-2 items-center">
                <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="px-3 py-1.5 border rounded-lg text-xs" />
                <span className="text-gray-400">—</span>
                <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="px-3 py-1.5 border rounded-lg text-xs" />
              </div>
            )}
          </div>

          {loadingReport ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : reportData ? (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="w-4 h-4 text-blue-500" />
                      <span className="text-xs text-gray-500">Daromad</span>
                    </div>
                    <p className="text-sm font-bold truncate">{formatMoney(reportData.revenue)}</p>
                    <p className="text-[10px] text-gray-400 mt-1">{reportData.sales_count} ta sotuv</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-emerald-500" />
                      <span className="text-xs text-gray-500">Yalpi foyda</span>
                    </div>
                    <p className="text-lg font-bold text-emerald-600">{formatMoney(reportData.gross_profit)}</p>
                    <p className="text-[10px] text-gray-400 mt-1">Daromad − Tannarx</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingDown className="w-4 h-4 text-red-500" />
                      <span className="text-xs text-gray-500">Jami chiqim</span>
                    </div>
                    <p className="text-lg font-bold text-red-600">{formatMoney(reportData.total_expenses)}</p>
                    <p className="text-[10px] text-gray-400 mt-1">{reportData.expense_breakdown?.length || 0} kategoriya</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Wallet className="w-4 h-4 text-purple-500" />
                      <span className="text-xs text-gray-500">SOF FOYDA</span>
                    </div>
                    <p className={`text-xl font-bold ${reportData.net_profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatMoney(reportData.net_profit)}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-1">Margin: {reportData.margin_percent}%</p>
                  </CardContent>
                </Card>
              </div>

              {/* Profit formula visualization */}
              <Card>
                <CardContent className="p-5">
                  <h3 className="text-sm font-bold mb-4">📊 Hisob formulasi</h3>
                  <div className="flex items-center justify-center gap-2 flex-wrap text-sm">
                    <div className="text-center px-4 py-2 bg-blue-50 rounded-lg">
                      <p className="text-[10px] text-blue-500">Daromad</p>
                      <p className="font-bold text-blue-700">{formatMoney(reportData.revenue)}</p>
                    </div>
                    <span className="text-gray-400 font-bold">−</span>
                    <div className="text-center px-4 py-2 bg-orange-50 rounded-lg">
                      <p className="text-[10px] text-orange-500">Tannarx</p>
                      <p className="font-bold text-orange-700">{formatMoney(reportData.cogs)}</p>
                    </div>
                    <span className="text-gray-400 font-bold">−</span>
                    <div className="text-center px-4 py-2 bg-red-50 rounded-lg">
                      <p className="text-[10px] text-red-500">Chiqimlar</p>
                      <p className="font-bold text-red-700">{formatMoney(reportData.total_expenses)}</p>
                    </div>
                    <span className="text-gray-400 font-bold">=</span>
                    <div className={`text-center px-4 py-2 rounded-lg ${reportData.net_profit >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                      <p className="text-[10px] text-gray-500">Sof foyda</p>
                      <p className={`font-bold text-lg ${reportData.net_profit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {formatMoney(reportData.net_profit)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Expense breakdown */}
              {reportData.expense_breakdown?.length > 0 && (
                <Card>
                  <CardContent className="p-5">
                    <h3 className="text-sm font-bold mb-3">📋 Chiqimlar tarkibi</h3>
                    <div className="space-y-2">
                      {reportData.expense_breakdown.map((cat: any, i: number) => {
                        const pct = reportData.total_expenses > 0 ? (cat.amount / reportData.total_expenses * 100) : 0
                        return (
                          <div key={i} className="flex items-center gap-3">
                            <div className="w-28 text-xs font-medium text-gray-600 truncate">{cat.name}</div>
                            <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-red-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                            <div className="text-xs font-bold text-gray-700 w-28 text-right">{formatMoney(cat.amount)}</div>
                            <div className="text-[10px] text-gray-400 w-10 text-right">{pct.toFixed(0)}%</div>
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Daily breakdown */}
              {reportData.daily?.length > 0 && (
                <Card>
                  <CardContent className="p-5">
                    <h3 className="text-sm font-bold mb-3">📅 Kunlik ma'lumot</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-semibold">Sana</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold">Daromad</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold">Tannarx</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold">Chiqim</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold">Sof foyda</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {reportData.daily.map((d: any) => (
                            <tr key={d.date} className="hover:bg-gray-50">
                              <td className="px-3 py-2 text-xs font-medium">{d.date}</td>
                              <td className="px-3 py-2 text-right text-blue-600">{formatMoney(d.revenue)}</td>
                              <td className="px-3 py-2 text-right text-orange-600">{formatMoney(d.cogs)}</td>
                              <td className="px-3 py-2 text-right text-red-600">{formatMoney(d.expenses)}</td>
                              <td className={`px-3 py-2 text-right font-bold ${d.net_profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {formatMoney(d.net_profit)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-50 font-bold">
                          <tr>
                            <td className="px-3 py-2 text-xs">JAMI</td>
                            <td className="px-3 py-2 text-right text-blue-600">{formatMoney(reportData.revenue)}</td>
                            <td className="px-3 py-2 text-right text-orange-600">{formatMoney(reportData.cogs)}</td>
                            <td className="px-3 py-2 text-right text-red-600">{formatMoney(reportData.total_expenses)}</td>
                            <td className={`px-3 py-2 text-right ${reportData.net_profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {formatMoney(reportData.net_profit)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : null}
        </>
      )}

      {/* Add Expense Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>➕ Chiqim qo'shish</DialogTitle>
            <DialogDescription>Yangi chiqim yozing</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="font-medium text-sm">Turi</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                className="w-full px-3 py-2.5 border rounded-lg text-sm">
                <option value="expense">📦 Umumiy chiqim</option>
                <option value="salary">💰 Oylik maosh</option>
                <option value="supplier_payment">🚚 Yetkazib beruvchiga</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="font-medium text-sm">Summa *</label>
              <Input type="number" step="any" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="100000" />
            </div>
            <div className="space-y-2">
              <label className="font-medium text-sm">Kategoriya</label>
              <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}
                className="w-full px-3 py-2.5 border rounded-lg text-sm">
                <option value="">Tanlash (ixtiyoriy)</option>
                {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="font-medium text-sm">Izoh</label>
              <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Masalan: Mart oyi arendasi" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Bekor</Button>
            <Button variant="success" onClick={() => addExpense.mutate()} disabled={addExpense.isPending || !form.amount}>
              {addExpense.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Saqlash
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Category Dialog */}
      <Dialog open={showCatDialog} onOpenChange={setShowCatDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>📁 Yangi kategoriya</DialogTitle>
          </DialogHeader>
          <Input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Masalan: Arenda, Maosh, Transport" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCatDialog(false)}>Bekor</Button>
            <Button onClick={() => addCategory.mutate()} disabled={addCategory.isPending || !newCatName.trim()}>Qo'shish</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
