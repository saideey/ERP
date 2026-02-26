import { useState, useEffect } from 'react'
import { superApi } from '@/services/api'

export default function SecuritySettings() {
  const [me, setMe] = useState<any>(null)
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'settings' | 'logs'>('settings')

  // Form
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPin, setNewPin] = useState('')
  const [newCode, setNewCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const [meRes, logsRes] = await Promise.all([
        superApi.get('/auth/me'),
        superApi.get('/auth/login-logs'),
      ])
      setMe(meRes.data)
      setLogs(logsRes.data.data || [])
    } catch { }
    finally { setLoading(false) }
  }

  const handleSave = async () => {
    if (!currentPassword) { setMsg({ ok: false, text: 'Joriy parolni kiriting' }); return }
    if (!newPin && !newCode) { setMsg({ ok: false, text: "PIN yoki xavfsizlik kodini kiriting" }); return }
    setSaving(true); setMsg(null)
    try {
      const body: any = { current_password: currentPassword }
      if (newPin) body.pin = newPin
      if (newCode) body.security_code = newCode
      await superApi.post('/auth/setup-security', body)
      setMsg({ ok: true, text: 'Xavfsizlik sozlamalari saqlandi ✓' })
      setCurrentPassword(''); setNewPin(''); setNewCode('')
      load()
    } catch (err: any) {
      setMsg({ ok: false, text: err.response?.data?.detail || 'Xatolik' })
    } finally { setSaving(false) }
  }

  const fmtDate = (s: string) => {
    if (!s) return '—'
    const d = new Date(s)
    const pad = (n: number) => n.toString().padStart(2, '0')
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">🔒 Xavfsizlik</h1>
        <p className="text-gray-500 text-sm mt-1">PIN, xavfsizlik kodi va kirish loglari</p>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6">
        {[{ k: 'settings', l: '⚙ Sozlamalar' }, { k: 'logs', l: '📋 Kirish loglari' }].map(t => (
          <button key={t.k} onClick={() => setTab(t.k as any)}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition ${
              tab === t.k ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}>{t.l}</button>
        ))}
      </div>

      {tab === 'settings' && (
        <div className="space-y-6">
          {/* Current Status */}
          <div className="bg-white rounded-2xl border p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Joriy holat</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                <span className="text-2xl">👤</span>
                <div>
                  <div className="text-xs text-gray-400">Username</div>
                  <div className="text-sm font-bold text-gray-900">{me?.username}</div>
                </div>
              </div>
              <div className={`flex items-center gap-3 p-3 rounded-xl ${me?.has_pin ? 'bg-emerald-50' : 'bg-red-50'}`}>
                <span className="text-2xl">{me?.has_pin ? '✅' : '❌'}</span>
                <div>
                  <div className="text-xs text-gray-400">PIN kod</div>
                  <div className={`text-sm font-bold ${me?.has_pin ? 'text-emerald-700' : 'text-red-700'}`}>
                    {me?.has_pin ? "O'rnatilgan" : "O'rnatilmagan"}
                  </div>
                </div>
              </div>
              <div className={`flex items-center gap-3 p-3 rounded-xl ${me?.has_security_code ? 'bg-emerald-50' : 'bg-red-50'}`}>
                <span className="text-2xl">{me?.has_security_code ? '✅' : '❌'}</span>
                <div>
                  <div className="text-xs text-gray-400">Xavfsizlik kodi</div>
                  <div className={`text-sm font-bold ${me?.has_security_code ? 'text-emerald-700' : 'text-red-700'}`}>
                    {me?.has_security_code ? "O'rnatilgan" : "O'rnatilmagan"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Update Form */}
          <div className="bg-white rounded-2xl border p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Yangilash</h3>
            {msg && <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>{msg.text}</div>}

            <form className="space-y-4 max-w-md" onSubmit={e => { e.preventDefault(); handleSave() }} autoComplete="off">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Joriy parol (tasdiqlash uchun) *</label>
                <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-500/20"
                  placeholder="Hozirgi parolni kiriting" autoComplete="current-password" />
              </div>

              <div className="border-t pt-4">
                <label className="block text-xs font-medium text-gray-500 mb-1">Yangi PIN kod</label>
                <input type="password" value={newPin} onChange={e => setNewPin(e.target.value)}
                  className="w-full px-3.5 py-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-500/20"
                  placeholder="Kamida 4 ta belgi" autoComplete="off" />
                <p className="text-[10px] text-gray-400 mt-1">Harf va raqamlar aralash bo'lishi mumkin. Bo'sh qoldirsangiz o'zgarmaydi.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Yangi xavfsizlik kodi</label>
                <input type="password" value={newCode} onChange={e => setNewCode(e.target.value)}
                  className="w-full px-3.5 py-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-500/20"
                  placeholder="Maxfiy so'z yoki gap" autoComplete="off" />
                <p className="text-[10px] text-gray-400 mt-1">Bo'sh qoldirsangiz o'zgarmaydi.</p>
              </div>

              <button type="submit" disabled={saving || !currentPassword}
                className="px-6 py-2.5 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 hover:shadow-lg transition-all">
                {saving ? 'Saqlanmoqda...' : '🔒 Saqlash'}
              </button>
            </form>
          </div>
        </div>
      )}

      {tab === 'logs' && (
        <div className="bg-white rounded-2xl border overflow-hidden">
          <div className="px-5 py-3 border-b flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">Oxirgi 100 ta kirish urinishi</p>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span className="w-2 h-2 bg-emerald-500 rounded-full" /> Muvaffaqiyatli
              <span className="w-2 h-2 bg-red-500 rounded-full ml-2" /> Xato
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] text-gray-500 uppercase tracking-wider bg-gray-50">
                  <th className="px-4 py-2">Vaqt</th>
                  <th className="px-3 py-2">Username</th>
                  <th className="px-3 py-2">IP</th>
                  <th className="px-3 py-2">Bosqich</th>
                  <th className="px-3 py-2">Natija</th>
                  <th className="px-3 py-2">Sabab</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs.map(l => (
                  <tr key={l.id} className={l.success ? 'bg-emerald-50/30' : l.step_reached >= 3 ? 'bg-red-50/50' : 'hover:bg-gray-50'}>
                    <td className="px-4 py-2 text-xs text-gray-600 whitespace-nowrap">{fmtDate(l.created_at)}</td>
                    <td className="px-3 py-2 text-xs font-mono">{l.username}</td>
                    <td className="px-3 py-2 text-xs font-mono text-gray-500">{l.ip_address}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-0.5">
                        {[1,2,3,4].map(s => (
                          <div key={s} className={`w-4 h-4 rounded text-[9px] flex items-center justify-center font-bold ${
                            s <= l.step_reached ? (l.success && s === l.step_reached ? 'bg-emerald-500 text-white' : s < l.step_reached ? 'bg-blue-500 text-white' : 'bg-red-500 text-white') : 'bg-gray-200 text-gray-400'
                          }`}>{s}</div>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {l.success ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">✓ Kirdi</span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">✕ Xato</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-400">{l.failure_reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {logs.length === 0 && <div className="text-center py-12 text-gray-400 text-sm">Loglar yo'q</div>}
        </div>
      )}
    </div>
  )
}
