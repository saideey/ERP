import { useState, useEffect } from 'react'
import { superApi } from '@/services/api'

const fmtMoney = (n: number) => {
  if (!n) return '0'
  return n.toLocaleString('uz-UZ')
}
const fmtDate = (s: string) => {
  if (!s) return '—'
  const d = new Date(s)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
}
const todayStr = () => new Date().toISOString().slice(0, 10)
const monthLater = () => {
  const d = new Date(); d.setMonth(d.getMonth() + 1)
  return d.toISOString().slice(0, 10)
}

export default function BillingPage() {
  const [tab, setTab] = useState<'overview' | 'expiring' | 'revenue' | 'payments'>('overview')
  const tabs = [
    { key: 'overview', label: '📋 Umumiy holat' },
    { key: 'expiring', label: '⚠ Tugayotganlar' },
    { key: 'revenue', label: '📊 Daromad' },
    { key: 'payments', label: '💰 To\'lovlar' },
  ]
  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Moliya & Billing</h1>
        <p className="text-gray-500 text-sm mt-1">Obuna to'lovlari va daromad nazorati</p>
      </div>
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`flex-1 px-3 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
              tab === t.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}>{t.label}</button>
        ))}
      </div>
      {tab === 'overview' && <OverviewTab />}
      {tab === 'expiring' && <ExpiringTab />}
      {tab === 'revenue' && <RevenueTab />}
      {tab === 'payments' && <PaymentsTab />}
    </div>
  )
}

function OverviewTab() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  useEffect(() => { superApi.get('/billing/overview').then(({ data: r }) => setData(r.data)).catch(() => {}).finally(() => setLoading(false)) }, [])
  const filtered = data.filter(t => {
    if (search && !t.tenant_name.toLowerCase().includes(search.toLowerCase())) return false
    if (filter === 'paid') return t.payments_count > 0
    if (filter === 'unpaid') return t.payments_count === 0
    if (filter === 'expiring') return t.days_left !== null && t.days_left <= 7
    return true
  })
  const totalRevenue = data.reduce((s, t) => s + t.total_paid, 0)
  const expiringCount = data.filter(t => t.days_left !== null && t.days_left <= 7).length
  const unpaidCount = data.filter(t => t.payments_count === 0).length
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="bg-white rounded-xl border p-4"><div className="text-[10px] text-gray-400 uppercase tracking-wider">Jami</div><div className="text-xl font-bold text-gray-900 mt-1">{data.length}</div></div>
        <div className="bg-white rounded-xl border p-4"><div className="text-[10px] text-gray-400 uppercase tracking-wider">Daromad</div><div className="text-xl font-bold text-emerald-600 mt-1">{fmtMoney(totalRevenue)}</div></div>
        <div className="bg-white rounded-xl border p-4 cursor-pointer hover:border-amber-300" onClick={() => setFilter('expiring')}><div className="text-[10px] text-gray-400 uppercase tracking-wider">Muddati yaqin</div><div className="text-xl font-bold text-amber-600 mt-1">{expiringCount}</div></div>
        <div className="bg-white rounded-xl border p-4 cursor-pointer hover:border-red-300" onClick={() => setFilter('unpaid')}><div className="text-[10px] text-gray-400 uppercase tracking-wider">To'lamagan</div><div className="text-xl font-bold text-red-600 mt-1">{unpaidCount}</div></div>
      </div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <input type="text" placeholder="Qidirish..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm outline-none" />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
        </div>
        <div className="flex gap-1">
          {[{ k: 'all', l: 'Barchasi' },{ k: 'paid', l: "To'lagan" },{ k: 'unpaid', l: "To'lamagan" },{ k: 'expiring', l: 'Tugayotgan' }].map(f => (
            <button key={f.k} onClick={() => setFilter(f.k)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${filter === f.k ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{f.l}</button>
          ))}
        </div>
      </div>
      {loading ? <div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div> : (
        <div className="bg-white rounded-2xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[10px] text-gray-500 uppercase tracking-wider bg-gray-50">
                <th className="px-4 py-3">Kompaniya</th><th className="px-3 py-3">Tarif</th><th className="px-3 py-3">Jami to'lagan</th><th className="px-3 py-3">Oxirgi to'lov</th><th className="px-3 py-3">Keyingi to'lov</th><th className="px-3 py-3">Holat</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(t => {
                  const isExpired = t.days_left !== null && t.days_left < 0
                  const isUrgent = t.days_left !== null && t.days_left >= 0 && t.days_left <= 3
                  return (
                    <tr key={t.tenant_id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3"><div className="font-semibold text-gray-900">{t.tenant_name}</div><div className="text-[10px] text-gray-400 font-mono">/{t.tenant_slug}</div></td>
                      <td className="px-3 py-3"><span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase ${t.subscription_plan === 'enterprise' ? 'bg-red-100 text-red-600' : t.subscription_plan === 'premium' ? 'bg-purple-100 text-purple-600' : t.subscription_plan === 'business' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>{t.subscription_plan}</span></td>
                      <td className="px-3 py-3"><div className="font-semibold text-emerald-600">{fmtMoney(t.total_paid)}</div><div className="text-[10px] text-gray-400">{t.payments_count} ta</div></td>
                      <td className="px-3 py-3">{t.last_payment_date ? (<div><div className="text-xs">{fmtDate(t.last_payment_date)}</div><div className="text-[10px] text-gray-400">{fmtMoney(t.last_payment_amount)} so'm</div></div>) : <span className="text-xs text-gray-300">—</span>}</td>
                      <td className="px-3 py-3">{t.next_payment_due ? (<div><div className={`text-xs font-medium ${isExpired ? 'text-red-600' : isUrgent ? 'text-amber-600' : 'text-gray-700'}`}>{fmtDate(t.next_payment_due)}</div><div className={`text-[10px] font-medium ${isExpired ? 'text-red-500' : isUrgent ? 'text-amber-500' : 'text-gray-400'}`}>{t.days_left !== null ? (t.days_left < 0 ? `${Math.abs(t.days_left)} kun o'tdi` : t.days_left === 0 ? 'BUGUN' : `${t.days_left} kun`) : ''}</div></div>) : <span className="text-xs text-gray-300">Belgilanmagan</span>}</td>
                      <td className="px-3 py-3"><span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${t.subscription_status === 'active' ? 'bg-emerald-50 text-emerald-700' : t.subscription_status === 'trial' ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}`}><span className={`w-1.5 h-1.5 rounded-full ${t.subscription_status === 'active' ? 'bg-emerald-500' : t.subscription_status === 'trial' ? 'bg-blue-500' : 'bg-red-500'}`} />{t.subscription_status}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && <div className="text-center py-12 text-gray-400 text-sm">Topilmadi</div>}
        </div>
      )}
    </div>
  )
}

function ExpiringTab() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(7)
  useEffect(() => { setLoading(true); superApi.get('/billing/expiring', { params: { days } }).then(({ data: r }) => setData(r.data)).catch(() => {}).finally(() => setLoading(false)) }, [days])
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{data.length} ta kompaniya</p>
        <div className="flex gap-1">{[3, 7, 14, 30].map(d => (<button key={d} onClick={() => setDays(d)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${days === d ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{d} kun</button>))}</div>
      </div>
      {loading ? <div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div> : data.length === 0 ? (
        <div className="text-center py-16 text-gray-400"><div className="text-4xl mb-3">✅</div><p className="font-medium">Yaqin {days} kun ichida tugaydigan obuna yo'q</p></div>
      ) : (
        <div className="space-y-2">{data.map((t: any) => (
          <div key={t.tenant_id} className={`flex items-center justify-between p-4 rounded-xl border-2 ${t.days_left <= 0 ? 'bg-red-50 border-red-200' : t.is_urgent ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-100'}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${t.days_left <= 0 ? 'bg-red-100' : t.is_urgent ? 'bg-amber-100' : 'bg-gray-100'}`}>{t.days_left <= 0 ? '🚨' : t.is_urgent ? '⏰' : '📅'}</div>
              <div><div className="font-semibold text-sm text-gray-900">{t.tenant_name}</div><div className="text-xs text-gray-400">Tarif: {t.subscription_plan} · Tugash: {fmtDate(t.subscription_ends_at)}</div></div>
            </div>
            <div className={`text-sm font-bold ${t.days_left <= 0 ? 'text-red-600' : t.is_urgent ? 'text-amber-600' : 'text-gray-700'}`}>{t.days_left <= 0 ? `${Math.abs(t.days_left)} kun o'tdi` : t.days_left === 0 ? 'BUGUN' : `${t.days_left} kun qoldi`}</div>
          </div>
        ))}</div>
      )}
    </div>
  )
}

function RevenueTab() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [groupBy, setGroupBy] = useState('monthly')
  useEffect(() => { setLoading(true); const p: any = { group_by: groupBy }; if (dateFrom) p.date_from = dateFrom; if (dateTo) p.date_to = dateTo; superApi.get('/billing/revenue', { params: p }).then(({ data: r }) => setData(r)).catch(() => {}).finally(() => setLoading(false)) }, [dateFrom, dateTo, groupBy])
  const maxAmt = data?.chart?.reduce((m: number, c: any) => Math.max(m, c.amount), 0) || 1
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-3 py-2 border rounded-lg text-sm outline-none" />
        <span className="text-gray-400">—</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-3 py-2 border rounded-lg text-sm outline-none" />
        <div className="flex gap-1">{[{ k: 'monthly', l: 'Oylik' }, { k: 'yearly', l: 'Yillik' }].map(g => (<button key={g.k} onClick={() => setGroupBy(g.k)} className={`px-3 py-2 rounded-lg text-xs font-medium transition ${groupBy === g.k ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{g.l}</button>))}</div>
        {(dateFrom || dateTo) && <button onClick={() => { setDateFrom(''); setDateTo('') }} className="text-xs text-red-500">✕</button>}
      </div>
      {loading ? <div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div> : !data ? null : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-5 text-white"><div className="text-xs opacity-80 mb-1">Jami daromad</div><div className="text-2xl font-bold">{fmtMoney(data.total_revenue)} so'm</div></div>
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-5 text-white"><div className="text-xs opacity-80 mb-1">To'lovlar soni</div><div className="text-2xl font-bold">{data.payments_count}</div></div>
            <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-5 text-white"><div className="text-xs opacity-80 mb-1">Kompaniyalar</div><div className="text-2xl font-bold">{data.per_tenant?.length || 0}</div></div>
          </div>
          {data.chart?.length > 0 && (
            <div className="bg-white rounded-2xl border p-5 mb-6">
              <p className="text-sm font-semibold text-gray-700 mb-4">Daromad grafigi</p>
              <div className="flex items-end gap-2 h-40">{data.chart.map((c: any, i: number) => { const pct = maxAmt > 0 ? (c.amount / maxAmt) * 100 : 0; return (<div key={i} className="flex-1 flex flex-col items-center gap-1"><span className="text-[10px] text-gray-500 font-medium">{fmtMoney(c.amount)}</span><div className="w-full bg-emerald-500 rounded-t-lg hover:bg-emerald-400" style={{ height: `${Math.max(4, pct)}%` }} /><span className="text-[10px] text-gray-400 truncate w-full text-center">{c.period}</span></div>) })}</div>
            </div>
          )}
          {data.per_tenant?.length > 0 && (
            <div className="bg-white rounded-2xl border overflow-hidden"><div className="px-5 py-3 border-b"><p className="text-sm font-semibold text-gray-700">Kompaniyalar bo'yicha</p></div><div className="divide-y">{data.per_tenant.map((t: any, i: number) => (<div key={t.tenant_id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50"><div className="flex items-center gap-3"><span className="text-xs font-bold text-gray-400 w-5">{i + 1}</span><span className="text-sm font-medium text-gray-900">{t.tenant_name}</span></div><div><span className="text-sm font-bold text-emerald-600">{fmtMoney(t.total)} so'm</span><span className="text-xs text-gray-400 ml-2">({t.count})</span></div></div>))}</div></div>
          )}
        </>
      )}
    </div>
  )
}

function PaymentsTab() {
  const [tenants, setTenants] = useState<any[]>([])
  const [selectedTenant, setSelectedTenant] = useState<number | null>(null)
  const [summary, setSummary] = useState<any>(null)
  const [payments, setPayments] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [editPayment, setEditPayment] = useState<any>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => { superApi.get('/billing/overview').then(({ data }) => setTenants(data.data || [])).catch(() => {}) }, [])
  useEffect(() => { if (selectedTenant) loadTenant() }, [selectedTenant, dateFrom, dateTo])

  const loadTenant = async () => {
    if (!selectedTenant) return; setLoading(true)
    try {
      const [s, p] = await Promise.all([superApi.get(`/billing/tenant/${selectedTenant}`), superApi.get(`/billing/tenant/${selectedTenant}/payments`, { params: { date_from: dateFrom || undefined, date_to: dateTo || undefined } })])
      setSummary(s.data); setPayments(p.data.data)
    } catch { } finally { setLoading(false) }
  }

  const handleDelete = async (id: number) => { if (!confirm("O'chirmoqchimisiz?")) return; try { await superApi.delete(`/billing/payments/${id}`); loadTenant() } catch { alert('Xatolik') } }

  return (
    <div>
      <div className="bg-white rounded-2xl border p-4 mb-4">
        <label className="text-sm font-medium text-gray-700 block mb-2">Kompaniyani tanlang</label>
        <select value={selectedTenant || ''} onChange={e => setSelectedTenant(Number(e.target.value) || null)} className="w-full px-3 py-2.5 border rounded-lg text-sm outline-none bg-white">
          <option value="">— Kompaniya tanlang —</option>
          {tenants.map(t => (<option key={t.tenant_id} value={t.tenant_id}>{t.tenant_name} ({t.subscription_plan}) {t.days_left !== null && t.days_left <= 7 ? '⚠' : ''}</option>))}
        </select>
      </div>
      {loading && <div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>}
      {!loading && selectedTenant && summary && (<>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
          <div className="bg-white rounded-xl border p-4"><div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Tarif</div><div className="text-sm font-bold text-gray-900">{summary.subscription_plan}</div></div>
          <div className="bg-white rounded-xl border p-4"><div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Holat</div><div className={`text-sm font-bold ${summary.subscription_status === 'active' ? 'text-emerald-600' : summary.subscription_status === 'trial' ? 'text-blue-600' : 'text-red-600'}`}>{summary.subscription_status}</div></div>
          <div className="bg-white rounded-xl border p-4"><div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Obuna tugashi</div><div className={`text-sm font-bold ${summary.days_left !== null && summary.days_left <= 3 ? 'text-red-600' : 'text-gray-900'}`}>{summary.subscription_ends_at ? fmtDate(summary.subscription_ends_at) : 'Belgilanmagan'}</div>{summary.days_left !== null && <div className={`text-[10px] ${summary.days_left <= 3 ? 'text-red-500' : 'text-gray-400'}`}>{summary.days_left < 0 ? `${Math.abs(summary.days_left)} kun o'tdi` : summary.days_left === 0 ? 'BUGUN' : `${summary.days_left} kun qoldi`}</div>}</div>
          <div className="bg-white rounded-xl border p-4"><div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Jami to'langan</div><div className="text-sm font-bold text-emerald-600">{fmtMoney(summary.total_paid)} so'm</div><div className="text-[10px] text-gray-400">{summary.payments_count} ta</div></div>
          <div className="bg-white rounded-xl border p-4"><div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Ochilgan</div><div className="text-sm font-bold text-gray-700">{fmtDate(summary.created_at)}</div></div>
        </div>

        {summary.last_payment && (
          <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4 mb-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="text-xs text-emerald-600 font-medium">Oxirgi to'lov qabul qilindi</div>
                <div className="text-lg font-bold text-emerald-700 mt-0.5">{fmtMoney(summary.last_payment.amount)} so'm</div>
                <div className="text-xs text-emerald-500 mt-0.5">Sana: {fmtDate(summary.last_payment.payment_date)} · Davr: {fmtDate(summary.last_payment.period_start)} — {fmtDate(summary.last_payment.period_end)} · {summary.last_payment.payment_method === 'cash' ? 'Naqd' : summary.last_payment.payment_method === 'card' ? 'Karta' : "O'tkazma"}</div>
              </div>
              <div className="text-right bg-white rounded-lg px-4 py-2 border border-emerald-200">
                <div className="text-[10px] text-emerald-600 uppercase tracking-wider">Keyingi to'lov</div>
                <div className="text-sm font-bold text-emerald-800">{fmtDate(summary.last_payment.period_end)}</div>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-2.5 py-1.5 border rounded-lg text-xs outline-none" />
            <span className="text-gray-400 text-xs">—</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-2.5 py-1.5 border rounded-lg text-xs outline-none" />
            {(dateFrom || dateTo) && <button onClick={() => { setDateFrom(''); setDateTo('') }} className="text-xs text-red-500">✕</button>}
          </div>
          <button onClick={() => { setEditPayment(null); setShowAdd(true) }} className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-lg text-sm font-semibold hover:shadow-lg transition-all">+ To'lov qo'shish</button>
        </div>

        {payments.length === 0 ? <div className="text-center py-12 text-gray-400"><div className="text-3xl mb-2">💸</div><p className="text-sm">To'lovlar yo'q</p></div> : (
          <div className="space-y-2">{payments.map((p: any) => (
            <div key={p.id} className={`bg-white rounded-xl border p-4 hover:shadow-sm transition ${p.status === 'cancelled' ? 'opacity-50' : ''}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${p.period_type === 'yearly' ? 'bg-purple-100' : 'bg-emerald-100'}`}>{p.period_type === 'yearly' ? '📅' : '📆'}</div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-gray-900">{fmtMoney(p.amount)} so'm</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${p.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : p.status === 'refunded' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>{p.status === 'paid' ? "To'langan" : p.status === 'refunded' ? 'Qaytarilgan' : 'Bekor'}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{p.period_type === 'monthly' ? 'Oylik' : 'Yillik'}</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">Davr: {fmtDate(p.period_start)} — {fmtDate(p.period_end)} · To'langan: {fmtDate(p.payment_date)} · {p.payment_method === 'cash' ? 'Naqd' : p.payment_method === 'card' ? 'Karta' : "O'tkazma"}{p.notes && ` · ${p.notes}`}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => { setEditPayment(p); setShowAdd(true) }} className="px-2.5 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100">✏</button>
                  <button onClick={() => handleDelete(p.id)} className="px-2.5 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100">🗑</button>
                </div>
              </div>
            </div>
          ))}</div>
        )}
      </>)}
      {showAdd && selectedTenant && <PaymentModal tenantId={selectedTenant} payment={editPayment} onClose={() => { setShowAdd(false); setEditPayment(null) }} onSaved={() => { setShowAdd(false); setEditPayment(null); loadTenant() }} />}
    </div>
  )
}

function PaymentModal({ tenantId, payment, onClose, onSaved }: { tenantId: number; payment: any; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!payment
  const [form, setForm] = useState({ amount: payment?.amount?.toString() || '', period_type: payment?.period_type || 'monthly', period_start: payment?.period_start || todayStr(), period_end: payment?.period_end || monthLater(), payment_date: payment?.payment_date || todayStr(), payment_method: payment?.payment_method || 'cash', notes: payment?.notes || '', status: payment?.status || 'paid' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handlePeriodType = (type: string) => { setForm(f => { const s = new Date(f.period_start); const e = new Date(s); if (type === 'yearly') e.setFullYear(e.getFullYear() + 1); else e.setMonth(e.getMonth() + 1); return { ...f, period_type: type, period_end: e.toISOString().slice(0, 10) } }) }
  const handleStartChange = (val: string) => { setForm(f => { const s = new Date(val); const e = new Date(s); if (f.period_type === 'yearly') e.setFullYear(e.getFullYear() + 1); else e.setMonth(e.getMonth() + 1); return { ...f, period_start: val, period_end: e.toISOString().slice(0, 10) } }) }

  const handleSubmit = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) { setError("Summani kiriting"); return }
    setSaving(true); setError('')
    try {
      if (isEdit) { await superApi.put(`/billing/payments/${payment.id}`, { amount: parseFloat(form.amount), period_start: form.period_start, period_end: form.period_end, payment_date: form.payment_date, payment_method: form.payment_method, notes: form.notes, status: form.status }) }
      else { await superApi.post('/billing/payments', { tenant_id: tenantId, amount: parseFloat(form.amount), period_type: form.period_type, period_start: form.period_start, period_end: form.period_end, payment_date: form.payment_date, payment_method: form.payment_method, notes: form.notes }) }
      onSaved()
    } catch (err: any) { setError(err.response?.data?.detail || 'Xatolik') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-gray-900">{isEdit ? "Tahrirlash" : "Yangi to'lov"}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400">✕</button>
        </div>
        {error && <div className="mx-6 mt-4 bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm">{error}</div>}
        <div className="p-6 space-y-4">
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Summa (so'm) *</label><input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="w-full px-3.5 py-2.5 border rounded-lg text-sm outline-none" placeholder="500000" /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Muddat turi</label><div className="grid grid-cols-2 gap-2">{[{ k: 'monthly', l: '📆 Oylik' }, { k: 'yearly', l: '📅 Yillik' }].map(pt => (<button key={pt.k} type="button" onClick={() => handlePeriodType(pt.k)} className={`px-3 py-2.5 rounded-lg text-sm font-medium border-2 transition ${form.period_type === pt.k ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200'}`}>{pt.l}</button>))}</div></div>
          <div className="grid grid-cols-2 gap-3"><div><label className="block text-xs font-medium text-gray-500 mb-1">Boshlanish</label><input type="date" value={form.period_start} onChange={e => handleStartChange(e.target.value)} className="w-full px-3 py-2.5 border rounded-lg text-sm outline-none" /></div><div><label className="block text-xs font-medium text-gray-500 mb-1">Tugash</label><input type="date" value={form.period_end} onChange={e => setForm(f => ({ ...f, period_end: e.target.value }))} className="w-full px-3 py-2.5 border rounded-lg text-sm outline-none" /></div></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">To'lov sanasi</label><input type="date" value={form.payment_date} onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))} className="w-full px-3 py-2.5 border rounded-lg text-sm outline-none" /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">To'lov usuli</label><div className="grid grid-cols-3 gap-2">{[{ k: 'cash', l: '💵 Naqd' }, { k: 'card', l: '💳 Karta' }, { k: 'transfer', l: "🏦 O'tkazma" }].map(pm => (<button key={pm.k} type="button" onClick={() => setForm(f => ({ ...f, payment_method: pm.k }))} className={`px-2 py-2 rounded-lg text-xs font-medium border-2 transition ${form.payment_method === pm.k ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200'}`}>{pm.l}</button>))}</div></div>
          {isEdit && <div><label className="block text-xs font-medium text-gray-500 mb-1">Holat</label><select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full px-3 py-2.5 border rounded-lg text-sm outline-none"><option value="paid">To'langan</option><option value="refunded">Qaytarilgan</option><option value="cancelled">Bekor qilingan</option></select></div>}
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Izoh</label><input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="w-full px-3.5 py-2.5 border rounded-lg text-sm outline-none" placeholder="Izoh..." /></div>
        </div>
        <div className="px-6 py-4 border-t bg-gray-50 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-100">Bekor</button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 hover:shadow-lg">{saving ? '...' : isEdit ? 'Saqlash' : "To'lov qo'shish ✓"}</button>
        </div>
      </div>
    </div>
  )
}
