import { useState, useEffect, useRef } from 'react'
import { superApi } from '@/services/api'
import type { Tenant } from '@/types'

interface TenantUser {
  id: number; username: string; first_name: string; last_name: string
  phone?: string; email?: string; role_name: string; role_type?: string
  is_active: boolean; is_blocked: boolean; created_at?: string
}

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => { loadTenants() }, [search])

  const loadTenants = async () => {
    try {
      const { data } = await superApi.get('/tenants', { params: { search: search || undefined, per_page: 50 } })
      setTenants(data.data); setTotal(data.total)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const statusStyle: Record<string, { bg: string; dot: string; text: string }> = {
    active: { bg: 'bg-emerald-50', dot: 'bg-emerald-500', text: 'text-emerald-700' },
    trial: { bg: 'bg-blue-50', dot: 'bg-blue-500', text: 'text-blue-700' },
    suspended: { bg: 'bg-red-50', dot: 'bg-red-500', text: 'text-red-700' },
    cancelled: { bg: 'bg-gray-100', dot: 'bg-gray-400', text: 'text-gray-600' },
    expired: { bg: 'bg-amber-50', dot: 'bg-amber-500', text: 'text-amber-700' },
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kompaniyalar</h1>
          <p className="text-gray-500 text-sm mt-1">{total} ta kompaniya</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="px-4 py-2.5 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-lg text-sm font-semibold hover:shadow-lg transition-all flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
          Yangi kompaniya
        </button>
      </div>

      <div className="mb-5">
        <div className="relative max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input type="text" placeholder="Qidirish..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none" />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-2">
          {tenants.map(t => {
            const s = statusStyle[t.subscription_status] || statusStyle.active
            const isExp = expanded === t.id
            return (
              <div key={t.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50/50 transition" onClick={() => setExpanded(isExp ? null : t.id)}>
                  <div className="flex items-center gap-3 flex-1">
                    {t.logo_url ? (
                      <img src={t.logo_url} alt={t.name} className="w-10 h-10 rounded-lg object-contain bg-gray-50" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                        <span className="text-sm font-bold text-gray-600">{t.name[0]}</span>
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-gray-900 flex items-center gap-2">
                        {t.name}
                        {t.payment_required && <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-[10px] rounded font-bold">TO'LOV</span>}
                      </div>
                      <div className="text-xs text-gray-400 font-mono">/{t.slug}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${s.bg} ${s.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />{t.subscription_status}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-medium uppercase ${
                      t.subscription_plan === 'enterprise' ? 'bg-red-100 text-red-600' :
                      t.subscription_plan === 'premium' ? 'bg-purple-100 text-purple-600' :
                      t.subscription_plan === 'business' ? 'bg-blue-100 text-blue-600' :
                      'bg-gray-100 text-gray-500'
                    }`}>{t.subscription_plan}</span>
                    <span className="text-xs text-gray-400">{t.users_count || 0}/{t.max_users}</span>
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExp ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </div>
                </div>
                {isExp && <TenantDetail tenant={t} onUpdate={loadTenants} />}
              </div>
            )
          })}
          {tenants.length === 0 && <div className="text-center py-16 text-gray-400">Kompaniya topilmadi</div>}
        </div>
      )}

      {showCreate && <CreateTenantModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); loadTenants() }} />}
    </div>
  )
}

// ==================== TENANT DETAIL ====================
function TenantDetail({ tenant, onUpdate }: { tenant: Tenant; onUpdate: () => void }) {
  const [tab, setTab] = useState<'settings' | 'features' | 'limits' | 'users' | 'ips'>('settings')
  const tabLabels: Record<string, string> = { settings: 'Sozlamalar', features: 'Xususiyatlar', limits: 'Tarif & Limitlar', users: 'Xodimlar', ips: '🔒 IP cheklash' }

  return (
    <div className="border-t border-gray-100">
      {/* Tabs */}
      <div className="flex border-b border-gray-100 px-5 overflow-x-auto">
        {(['settings', 'features', 'limits', 'users', 'ips'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition whitespace-nowrap ${tab === t ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
            {tabLabels[t]}
          </button>
        ))}
      </div>

      {tab === 'settings' ? (
        <TenantSettings tenant={tenant} onUpdate={onUpdate} />
      ) : tab === 'features' ? (
        <TenantFeatures tenantId={tenant.id} />
      ) : tab === 'limits' ? (
        <TenantLimits tenant={tenant} onUpdate={onUpdate} />
      ) : tab === 'ips' ? (
        <TenantIPWhitelist tenantId={tenant.id} />
      ) : (
        <TenantUsers tenantId={tenant.id} />
      )}
    </div>
  )
}

// ==================== FEATURES TAB ====================
function TenantFeatures({ tenantId }: { tenantId: number }) {
  const [features, setFeatures] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const featureLabels: Record<string, { name: string; desc: string; icon: string }> = {
    partners: { name: 'Hamkorlar', desc: "Kompaniyalar o'rtasida transfer, to'lov va statistika", icon: '🤝' },
    customers: { name: 'Mijozlar', desc: 'Mijozlar bazasi va qarz nazorati', icon: '👥' },
    daily_report: { name: 'Kunlik hisobot', desc: 'Telegram orqali kunlik hisobot yuborish', icon: '📊' },
    reports: { name: 'Hisobotlar', desc: "Sotuv, ombor va moliyaviy hisobotlar", icon: '📈' },
  }

  useEffect(() => {
    loadFeatures()
  }, [tenantId])

  const loadFeatures = async () => {
    setLoading(true)
    try {
      const { data } = await superApi.get(`/tenants/${tenantId}/features`)
      setFeatures(data.features || {})
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  const toggleFeature = async (key: string, value: boolean) => {
    setSaving(true); setMsg(null)
    const updated = { ...features, [key]: value }
    setFeatures(updated)
    try {
      await superApi.put(`/tenants/${tenantId}/features`, updated)
      setMsg({ ok: true, text: `${featureLabels[key]?.name || key} ${value ? 'yoqildi' : "o'chirildi"} ✓` })
    } catch (err: any) {
      setFeatures({ ...features, [key]: !value }) // rollback
      setMsg({ ok: false, text: err.response?.data?.detail || 'Xatolik' })
    }
    finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="p-5 bg-gray-50/50">
      {msg && <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>{msg.text}</div>}

      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Modullar nazorati</p>
      <p className="text-xs text-gray-400 mb-4">
        Har bir kompaniya uchun alohida modullarni yoqish yoki o'chirish mumkin. O'chirilgan modul sidebar menyusida ko'rinmaydi.
      </p>

      <div className="space-y-2">
        {Object.entries(featureLabels).map(([key, info]) => {
          const enabled = features[key] !== false
          return (
            <div key={key} className={`flex items-center justify-between p-4 rounded-xl border-2 transition ${enabled ? 'bg-white border-gray-200' : 'bg-gray-100/50 border-gray-100'}`}>
              <div className="flex items-center gap-3">
                <span className="text-2xl">{info.icon}</span>
                <div>
                  <div className={`text-sm font-semibold ${enabled ? 'text-gray-900' : 'text-gray-400'}`}>{info.name}</div>
                  <div className="text-xs text-gray-400">{info.desc}</div>
                </div>
              </div>
              <button
                onClick={() => toggleFeature(key, !enabled)}
                disabled={saving}
                className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${enabled ? 'bg-emerald-500' : 'bg-gray-300'} disabled:opacity-50`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${enabled ? 'left-6' : 'left-0.5'}`} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ==================== IP WHITELIST TAB ====================
function TenantIPWhitelist({ tenantId }: { tenantId: number }) {
  const [ips, setIps] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newIp, setNewIp] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => { load() }, [tenantId])

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await superApi.get(`/tenants/${tenantId}/allowed-ips`)
      setIps(data.allowed_ips || [])
    } catch { }
    finally { setLoading(false) }
  }

  const save = async (updated: string[]) => {
    setSaving(true); setMsg(null)
    try {
      await superApi.put(`/tenants/${tenantId}/allowed-ips`, { allowed_ips: updated })
      setIps(updated)
      setMsg({ ok: true, text: 'Saqlandi ✓' })
    } catch (err: any) {
      setMsg({ ok: false, text: err.response?.data?.detail || 'Xatolik' })
    } finally { setSaving(false) }
  }

  const addIp = () => {
    const v = newIp.trim()
    if (!v) return
    if (ips.includes(v)) { setMsg({ ok: false, text: 'Bu IP allaqachon qo\'shilgan' }); return }
    // Basic validation
    const ipPattern = /^(\d{1,3}\.){3}(\d{1,3}|\*)$/
    const cidrPattern = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/
    if (!ipPattern.test(v) && !cidrPattern.test(v)) {
      setMsg({ ok: false, text: 'Noto\'g\'ri format. Masalan: 192.168.1.100, 10.0.0.0/24, 203.0.113.*' })
      return
    }
    const updated = [...ips, v]
    setNewIp('')
    save(updated)
  }

  const removeIp = (ip: string) => {
    save(ips.filter(i => i !== ip))
  }

  if (loading) return <div className="p-6 text-center text-gray-400 text-sm">Yuklanmoqda...</div>

  return (
    <div className="p-5 space-y-4">
      {msg && <div className={`px-3 py-2 rounded-lg text-xs ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>{msg.text}</div>}

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <span className="text-amber-500 text-lg">⚠️</span>
          <div>
            <p className="text-xs font-semibold text-amber-800">IP cheklash haqida</p>
            <p className="text-[11px] text-amber-600 mt-1">
              IP qo'shilsa — faqat shu IP lardan kirish mumkin bo'ladi. Boshqa IP lardan parol to'g'ri bo'lsa ham "Noto'g'ri ma'lumot" xatosi chiqadi.
              Ro'yxat bo'sh bo'lsa — barcha IP lardan ruxsat beriladi.
            </p>
          </div>
        </div>
      </div>

      {/* Add IP */}
      <div className="flex gap-2">
        <input value={newIp} onChange={e => setNewIp(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addIp()}
          className="flex-1 px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-500/20"
          placeholder="IP yoki CIDR: 203.0.113.50, 10.0.0.0/24, 192.168.1.*" />
        <button onClick={addIp} disabled={saving || !newIp.trim()}
          className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-orange-600">
          + Qo'shish
        </button>
      </div>

      {/* IP List */}
      {ips.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-3xl mb-2">🌐</div>
          <p className="text-sm text-gray-500">IP cheklash o'chirilgan</p>
          <p className="text-[11px] text-gray-400 mt-1">Barcha IP lardan kirish mumkin</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className="text-xs text-gray-500 font-medium">Ruxsat berilgan IP lar ({ips.length} ta):</p>
          {ips.map(ip => (
            <div key={ip} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-emerald-500">✓</span>
                <code className="text-sm font-mono text-gray-800">{ip}</code>
                {ip.includes('/') && <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded">CIDR</span>}
                {ip.includes('*') && <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded">Wildcard</span>}
              </div>
              <button onClick={() => removeIp(ip)} disabled={saving}
                className="text-red-400 hover:text-red-600 text-xs font-medium disabled:opacity-50">
                ✕ O'chirish
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Clear All */}
      {ips.length > 0 && (
        <button onClick={() => save([])} disabled={saving}
          className="text-xs text-gray-400 hover:text-red-500 underline">
          Barcha cheklovlarni olib tashlash
        </button>
      )}
    </div>
  )
}

// ==================== SETTINGS TAB ====================
function TenantSettings({ tenant, onUpdate }: { tenant: Tenant; onUpdate: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [payMsg, setPayMsg] = useState(tenant.payment_message || '')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const uploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true); setMsg(null)
    const form = new FormData(); form.append('file', file)
    try { await superApi.post(`/tenants/${tenant.id}/logo`, form, { headers: { 'Content-Type': 'multipart/form-data' } }); setMsg({ ok: true, text: 'Logo yuklandi ✓' }); onUpdate() }
    catch (err: any) { setMsg({ ok: false, text: err.response?.data?.detail || 'Xatolik' }) }
    finally { setUploading(false) }
  }

  const deleteLogo = async () => {
    try { await superApi.delete(`/tenants/${tenant.id}/logo`); setMsg({ ok: true, text: "Logo o'chirildi" }); onUpdate() }
    catch { setMsg({ ok: false, text: 'Xatolik' }) }
  }

  const togglePayment = async (enabled: boolean) => {
    setSaving(true); setMsg(null)
    try { await superApi.post(`/tenants/${tenant.id}/payment-notify`, { enabled, message: payMsg }); setMsg({ ok: true, text: enabled ? "To'lov ogohlantirishi yoqildi" : "O'chirildi" }); onUpdate() }
    catch { setMsg({ ok: false, text: 'Xatolik' }) }
    finally { setSaving(false) }
  }

  const handleAction = async (action: 'suspend' | 'activate') => {
    if (action === 'suspend' && !confirm("To'xtatmoqchimisiz?")) return
    try { await superApi.post(`/tenants/${tenant.id}/${action}`); onUpdate() }
    catch { alert('Xatolik') }
  }

  return (
    <div className="p-5 bg-gray-50/50">
      {msg && <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>{msg.text}</div>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Logo */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Logo</p>
          <div className="flex items-center gap-3">
            {tenant.logo_url ? <img src={tenant.logo_url} alt="" className="w-16 h-16 rounded-xl object-contain bg-white border p-1" />
              : <div className="w-16 h-16 rounded-xl bg-gray-200 flex items-center justify-center text-gray-400 text-xs">No logo</div>}
            <div className="space-y-1.5">
              <input ref={fileRef} type="file" accept="image/*" onChange={uploadLogo} className="hidden" />
              <button onClick={() => fileRef.current?.click()} disabled={uploading} className="block px-3 py-1.5 text-xs font-medium bg-white border rounded-lg hover:bg-gray-50 disabled:opacity-50">{uploading ? 'Yuklanmoqda...' : 'Yuklash'}</button>
              {tenant.logo_url && <button onClick={deleteLogo} className="block px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg">O'chirish</button>}
            </div>
          </div>
        </div>
        {/* Payment */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">To'lov ogohlantirishi</p>
          <textarea value={payMsg} onChange={e => setPayMsg(e.target.value)} rows={2} placeholder="To'lov xabari..." className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:ring-2 focus:ring-orange-500/20 outline-none" />
          <div className="flex gap-2 mt-2">
            {!tenant.payment_required
              ? <button onClick={() => togglePayment(true)} disabled={saving} className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">⚠ To'lov talab qilish</button>
              : <button onClick={() => togglePayment(false)} disabled={saving} className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">✓ Bekor qilish</button>}
          </div>
        </div>
        {/* Actions */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Amallar</p>
          <div className="space-y-2">
            <a href={`/${tenant.slug}/login`} target="_blank" className="block px-3 py-1.5 text-xs font-medium text-center text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100">Kompaniyani ochish ↗</a>
            {tenant.subscription_status === 'active' || tenant.subscription_status === 'trial'
              ? <button onClick={() => handleAction('suspend')} className="block w-full px-3 py-1.5 text-xs font-medium text-center text-red-600 bg-red-50 rounded-lg hover:bg-red-100">To'xtatish</button>
              : <button onClick={() => handleAction('activate')} className="block w-full px-3 py-1.5 text-xs font-medium text-center text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100">Faollashtirish</button>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ==================== LIMITS TAB ====================
function TenantLimits({ tenant, onUpdate }: { tenant: Tenant; onUpdate: () => void }) {
  const [limits, setLimits] = useState({
    subscription_plan: tenant.subscription_plan || 'starter',
    max_users: tenant.max_users,
    max_products: tenant.max_products,
    max_warehouses: tenant.max_warehouses,
  })
  const [plans, setPlans] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    superApi.get('/tenants/plans/all').then(({ data }) => setPlans(data.plans || [])).catch(() => {})
  }, [])

  const applyPlan = async (planKey: string) => {
    setSaving(true); setMsg(null)
    try {
      await superApi.post(`/tenants/${tenant.id}/change-plan`, { plan: planKey })
      setMsg({ ok: true, text: `Tarif o'zgartirildi: ${planKey} ✓` })
      // Update local state
      const plan = plans.find((p: any) => p.key === planKey)
      if (plan) {
        setLimits({
          subscription_plan: planKey,
          max_users: plan.max_users,
          max_products: plan.max_products,
          max_warehouses: plan.max_warehouses,
        })
      }
      onUpdate()
    } catch (err: any) { setMsg({ ok: false, text: err.response?.data?.detail || 'Xatolik' }) }
    finally { setSaving(false) }
  }

  const saveManualLimits = async () => {
    setSaving(true); setMsg(null)
    try {
      await superApi.put(`/tenants/${tenant.id}`, limits)
      setMsg({ ok: true, text: 'Limitlar saqlandi ✓' })
      onUpdate()
    } catch (err: any) { setMsg({ ok: false, text: err.response?.data?.detail || 'Xatolik' }) }
    finally { setSaving(false) }
  }

  const usageBar = (current: number, max: number, label: string) => {
    const pct = max > 0 ? Math.min(100, Math.round((current / max) * 100)) : 0
    const isWarning = pct >= 80
    const isFull = pct >= 100
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">{label}</span>
          <span className={`font-semibold ${isFull ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-gray-700'}`}>
            {current} / {max > 0 ? max : '∞'}
          </span>
        </div>
        {max > 0 && (
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${isFull ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    )
  }

  const fmtPrice = (n: number) => n > 0 ? `${(n / 1000).toFixed(0)}K` : 'Bepul'

  return (
    <div className="p-5 bg-gray-50/50 space-y-5">
      {msg && <div className={`px-4 py-2 rounded-lg text-sm ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>{msg.text}</div>}

      {/* Current Usage */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Joriy foydalanish</p>
        <div className="grid grid-cols-3 gap-4">
          {usageBar(tenant.users_count || 0, tenant.max_users, 'Xodimlar')}
          {usageBar(tenant.products_count || 0, tenant.max_products, 'Mahsulotlar')}
          {usageBar(tenant.warehouses_count || 0, tenant.max_warehouses, 'Omborlar')}
        </div>
      </div>

      {/* Plan Selection */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Tarif rejasi</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {plans.map((plan: any) => {
            const isActive = limits.subscription_plan === plan.key
            return (
              <button key={plan.key} onClick={() => applyPlan(plan.key)} disabled={saving}
                className={`relative p-3 rounded-xl text-left border-2 transition ${
                  isActive ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-200' : 'border-gray-200 bg-white hover:border-gray-300'
                } disabled:opacity-50`}>
                {isActive && <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center text-white text-[10px]">✓</div>}
                <div className="text-lg mb-1">{plan.icon}</div>
                <div className="text-sm font-bold text-gray-900">{plan.name_uz}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">{fmtPrice(plan.price_monthly)}/oy</div>
                <div className="mt-2 space-y-0.5 text-[10px] text-gray-500">
                  <div>👤 {plan.unlimited_users ? '∞' : plan.max_users} xodim</div>
                  <div>📦 {plan.unlimited_products ? '∞' : plan.max_products} mahsulot</div>
                  <div>🏪 {plan.unlimited_warehouses ? '∞' : plan.max_warehouses} ombor</div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Manual Override */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Qo'lda sozlash <span className="text-gray-300 normal-case">(0 = cheksiz)</span></p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Max xodimlar</label>
            <input type="number" min={0} value={limits.max_users} onChange={e => setLimits(l => ({ ...l, max_users: parseInt(e.target.value) || 0 }))}
              className="w-full px-3 py-2 bg-white border rounded-lg text-sm text-center outline-none focus:ring-2 focus:ring-orange-500/20" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Max mahsulotlar</label>
            <input type="number" min={0} value={limits.max_products} onChange={e => setLimits(l => ({ ...l, max_products: parseInt(e.target.value) || 0 }))}
              className="w-full px-3 py-2 bg-white border rounded-lg text-sm text-center outline-none focus:ring-2 focus:ring-orange-500/20" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Max omborlar</label>
            <input type="number" min={0} value={limits.max_warehouses} onChange={e => setLimits(l => ({ ...l, max_warehouses: parseInt(e.target.value) || 0 }))}
              className="w-full px-3 py-2 bg-white border rounded-lg text-sm text-center outline-none focus:ring-2 focus:ring-orange-500/20" />
          </div>
        </div>
        <button onClick={saveManualLimits} disabled={saving}
          className="mt-3 px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition">
          {saving ? 'Saqlanmoqda...' : 'Qo\'lda saqlash'}
        </button>
      </div>
    </div>
  )
}

// ==================== USERS TAB ====================
function TenantUsers({ tenantId }: { tenantId: number }) {
  const [users, setUsers] = useState<TenantUser[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<number | null>(null)
  const [editData, setEditData] = useState({ username: '', password: '', first_name: '', last_name: '' })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => { load() }, [tenantId])

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await superApi.get(`/tenants/${tenantId}/users`)
      setUsers(data.users)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  const startEdit = (u: TenantUser) => {
    setEditId(u.id)
    setEditData({ username: u.username, password: '', first_name: u.first_name, last_name: u.last_name })
    setMsg(null)
  }

  const saveEdit = async () => {
    if (!editId) return
    setSaving(true); setMsg(null)
    const payload: any = {}
    if (editData.username) payload.username = editData.username
    if (editData.password) payload.password = editData.password
    if (editData.first_name) payload.first_name = editData.first_name
    if (editData.last_name) payload.last_name = editData.last_name
    try {
      await superApi.put(`/tenants/${tenantId}/users/${editId}`, payload)
      setMsg({ ok: true, text: 'Saqlandi ✓' })
      setEditId(null)
      load()
    } catch (err: any) { setMsg({ ok: false, text: err.response?.data?.detail || 'Xatolik' }) }
    finally { setSaving(false) }
  }

  const toggleBlock = async (u: TenantUser) => {
    try {
      await superApi.put(`/tenants/${tenantId}/users/${u.id}`, { is_blocked: !u.is_blocked })
      load()
    } catch { /* ignore */ }
  }

  if (loading) return <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="p-5 bg-gray-50/50">
      {msg && <div className={`mb-3 px-4 py-2 rounded-lg text-sm ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>{msg.text}</div>}

      {users.length === 0 ? (
        <p className="text-center text-gray-400 py-8 text-sm">Xodimlar topilmadi</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="pb-2 pr-4">Xodim</th>
                <th className="pb-2 pr-4">Username</th>
                <th className="pb-2 pr-4">Lavozim</th>
                <th className="pb-2 pr-4">Holat</th>
                <th className="pb-2 text-right">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-white/60">
                  <td className="py-3 pr-4">
                    {editId === u.id ? (
                      <div className="flex gap-2">
                        <input value={editData.first_name} onChange={e => setEditData(p => ({ ...p, first_name: e.target.value }))}
                          className="w-24 px-2 py-1 border rounded text-xs" placeholder="Ism" />
                        <input value={editData.last_name} onChange={e => setEditData(p => ({ ...p, last_name: e.target.value }))}
                          className="w-24 px-2 py-1 border rounded text-xs" placeholder="Familiya" />
                      </div>
                    ) : (
                      <div>
                        <span className="font-medium text-gray-900">{u.first_name} {u.last_name}</span>
                        {u.phone && <span className="text-gray-400 text-xs ml-2">{u.phone}</span>}
                      </div>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    {editId === u.id ? (
                      <input value={editData.username} onChange={e => setEditData(p => ({ ...p, username: e.target.value }))}
                        className="w-28 px-2 py-1 border rounded text-xs font-mono" placeholder="username" />
                    ) : (
                      <code className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-700">{u.username}</code>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      u.role_type === 'director' ? 'bg-purple-50 text-purple-700' :
                      u.role_type === 'seller' ? 'bg-blue-50 text-blue-700' :
                      u.role_type === 'warehouse_manager' ? 'bg-amber-50 text-amber-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>{u.role_name}</span>
                  </td>
                  <td className="py-3 pr-4">
                    {u.is_blocked ? (
                      <span className="text-xs text-red-600 font-medium">Bloklangan</span>
                    ) : u.is_active ? (
                      <span className="text-xs text-emerald-600 font-medium">Faol</span>
                    ) : (
                      <span className="text-xs text-gray-400">Nofaol</span>
                    )}
                  </td>
                  <td className="py-3 text-right">
                    {editId === u.id ? (
                      <div className="flex items-center gap-2 justify-end">
                        <input value={editData.password} onChange={e => setEditData(p => ({ ...p, password: e.target.value }))}
                          className="w-28 px-2 py-1 border rounded text-xs" placeholder="Yangi parol (ixtiyoriy)" type="text" />
                        <button onClick={saveEdit} disabled={saving}
                          className="px-3 py-1 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                          {saving ? '...' : 'Saqlash'}
                        </button>
                        <button onClick={() => setEditId(null)} className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700">Bekor</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => startEdit(u)} className="px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100">
                          Tahrirlash
                        </button>
                        <button onClick={() => toggleBlock(u)} className={`px-2.5 py-1 text-xs font-medium rounded-lg ${
                          u.is_blocked ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100' : 'text-red-600 bg-red-50 hover:bg-red-100'
                        }`}>
                          {u.is_blocked ? 'Blokdan chiqarish' : 'Bloklash'}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ==================== CREATE MODAL ====================
function CreateTenantModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({ name: '', slug: '', phone: '', email: '', admin_username: '', admin_password: '', admin_first_name: '', admin_last_name: '', subscription_plan: 'business', max_users: 10, max_products: 2000, max_warehouses: 2 })
  const [plans, setPlans] = useState<any[]>([])
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    superApi.get('/tenants/plans/all').then(({ data }) => {
      setPlans(data.plans || [])
      // Apply default plan limits
      const biz = (data.plans || []).find((p: any) => p.key === 'business')
      if (biz) setForm(f => ({ ...f, max_users: biz.max_users, max_products: biz.max_products, max_warehouses: biz.max_warehouses }))
    }).catch(() => {})
  }, [])

  const upd = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
    if (field === 'name') {
      setForm(prev => ({ ...prev, slug: value.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 50) }))
    }
  }

  const selectPlan = (planKey: string) => {
    const plan = plans.find((p: any) => p.key === planKey)
    if (plan) {
      setForm(f => ({
        ...f,
        subscription_plan: planKey,
        max_users: plan.max_users,
        max_products: plan.max_products,
        max_warehouses: plan.max_warehouses,
      }))
    }
  }

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setLogoFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      const { data } = await superApi.post('/tenants', form)
      if (logoFile && data.id) {
        const fd = new FormData(); fd.append('file', logoFile)
        await superApi.post(`/tenants/${data.id}/logo`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      }
      onCreated()
    } catch (err: any) { setError(err.response?.data?.detail || 'Xatolik yuz berdi') }
    finally { setLoading(false) }
  }

  const fmtPrice = (n: number) => n > 0 ? `${(n / 1000).toFixed(0)}K` : 'Bepul'

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <div><h2 className="text-lg font-bold text-gray-900">Yangi kompaniya</h2><p className="text-xs text-gray-500">Qadam {step}/3</p></div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400">✕</button>
        </div>
        <div className="px-6 pt-4 flex gap-2">
          <div className={`h-1 flex-1 rounded-full ${step >= 1 ? 'bg-orange-500' : 'bg-gray-200'}`} />
          <div className={`h-1 flex-1 rounded-full ${step >= 2 ? 'bg-orange-500' : 'bg-gray-200'}`} />
          <div className={`h-1 flex-1 rounded-full ${step >= 3 ? 'bg-orange-500' : 'bg-gray-200'}`} />
        </div>
        {error && <div className="mx-6 mt-4 bg-red-50 border border-red-100 text-red-600 px-4 py-2.5 rounded-lg text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="p-6">
          {step === 1 ? (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-gray-700 mb-3">Kompaniya ma'lumotlari</p>
              <div className="flex items-center gap-4">
                <label className="cursor-pointer">
                  {logoPreview ? <img src={logoPreview} alt="" className="w-16 h-16 rounded-xl object-contain bg-gray-50 border-2 border-dashed border-gray-300 p-1" />
                    : <div className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:border-orange-400 hover:text-orange-400 transition">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    </div>}
                  <input type="file" accept="image/*" onChange={handleLogoSelect} className="hidden" />
                </label>
                <div className="text-xs text-gray-400">Logo yuklash<br />JPG, PNG, WebP (2MB gacha)</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Nomi *</label>
                <input type="text" value={form.name} onChange={e => upd('name', e.target.value)} className="w-full px-3.5 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none" placeholder="Gayrat Stroy House" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Slug *</label>
                <div className="flex"><span className="px-3 py-2.5 bg-gray-50 border border-r-0 rounded-l-lg text-xs text-gray-400">erp.uz/</span>
                  <input type="text" value={form.slug} onChange={e => setForm(p => ({...p, slug: e.target.value}))} className="flex-1 px-3.5 py-2.5 border rounded-r-lg text-sm font-mono focus:ring-2 focus:ring-orange-500/20 outline-none" required /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Telefon</label>
                  <input type="text" value={form.phone} onChange={e => upd('phone', e.target.value)} className="w-full px-3.5 py-2.5 border rounded-lg text-sm outline-none" placeholder="+998 90 123 45 67" /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                  <input type="email" value={form.email} onChange={e => upd('email', e.target.value)} className="w-full px-3.5 py-2.5 border rounded-lg text-sm outline-none" /></div>
              </div>
              <button type="button" onClick={() => { if (form.name && form.slug) setStep(2); else setError('Nomi va slug kerak') }}
                className="w-full py-2.5 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-800 transition mt-2">Keyingi →</button>
            </div>
          ) : step === 2 ? (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-gray-700 mb-1">Tarif tanlang</p>
              <p className="text-xs text-gray-400 mb-3">Keyinroq ham o'zgartirishingiz mumkin</p>
              <div className="grid grid-cols-2 gap-2">
                {plans.map((plan: any) => {
                  const isActive = form.subscription_plan === plan.key
                  return (
                    <button key={plan.key} type="button" onClick={() => selectPlan(plan.key)}
                      className={`relative p-3 rounded-xl text-left border-2 transition ${
                        isActive ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-200' : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}>
                      {isActive && <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center text-white text-[10px]">✓</div>}
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{plan.icon}</span>
                        <span className="text-sm font-bold text-gray-900">{plan.name_uz}</span>
                      </div>
                      <div className="text-[10px] text-gray-400">{fmtPrice(plan.price_monthly)}/oy</div>
                      <div className="mt-2 space-y-0.5 text-[10px] text-gray-500">
                        <div>👤 {plan.unlimited_users ? '∞' : plan.max_users} xodim</div>
                        <div>📦 {plan.unlimited_products ? '∞' : plan.max_products} mahsulot</div>
                        <div>🏪 {plan.unlimited_warehouses ? '∞' : plan.max_warehouses} ombor</div>
                      </div>
                    </button>
                  )
                })}
              </div>
              <div className="flex gap-3 mt-2">
                <button type="button" onClick={() => setStep(1)} className="flex-1 py-2.5 border text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">← Orqaga</button>
                <button type="button" onClick={() => setStep(3)} className="flex-1 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-800">Keyingi →</button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-gray-700 mb-3">Admin foydalanuvchi</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Ism *</label>
                  <input type="text" value={form.admin_first_name} onChange={e => upd('admin_first_name', e.target.value)} className="w-full px-3.5 py-2.5 border rounded-lg text-sm outline-none" required /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Familiya *</label>
                  <input type="text" value={form.admin_last_name} onChange={e => upd('admin_last_name', e.target.value)} className="w-full px-3.5 py-2.5 border rounded-lg text-sm outline-none" required /></div>
              </div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Username *</label>
                <input type="text" value={form.admin_username} onChange={e => upd('admin_username', e.target.value)} className="w-full px-3.5 py-2.5 border rounded-lg text-sm outline-none" placeholder="admin" required /></div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Parol *</label>
                <input type="text" value={form.admin_password} onChange={e => upd('admin_password', e.target.value)} className="w-full px-3.5 py-2.5 border rounded-lg text-sm outline-none" placeholder="admin123" required /></div>
              <div className="flex gap-3 mt-2">
                <button type="button" onClick={() => setStep(2)} className="flex-1 py-2.5 border text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">← Orqaga</button>
                <button type="submit" disabled={loading} className="flex-1 py-2.5 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 hover:shadow-lg">{loading ? 'Yaratilmoqda...' : 'Yaratish ✓'}</button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
