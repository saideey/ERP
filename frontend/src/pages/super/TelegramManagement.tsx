import { useState, useEffect } from 'react'
import { superApi } from '@/services/api'

interface TenantTG {
  tenant_id: number; tenant_name: string; tenant_slug: string
  has_directors: boolean; directors_count: number; has_group_chat: boolean; daily_report_enabled: boolean
}
interface TGSettings {
  tenant_id: number; tenant_name: string; tenant_slug: string
  director_telegram_ids: string; group_chat_id: string; daily_report_enabled: boolean; daily_report_time: string
}

export default function TelegramManagement() {
  const [tenants, setTenants] = useState<TenantTG[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [settings, setSettings] = useState<TGSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testChat, setTestChat] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [botUsername, setBotUsername] = useState('')

  useEffect(() => { load(); loadBotInfo() }, [])

  const load = async () => {
    try { const { data } = await superApi.get('/telegram/overview'); setTenants(data.tenants) }
    catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const loadBotInfo = async () => {
    try {
      const { data } = await superApi.get('/telegram/bot-info')
      if (data.username) setBotUsername(data.username)
    } catch { /* ignore */ }
  }

  const toggle = async (id: number) => {
    if (expanded === id) { setExpanded(null); setSettings(null); return }
    setExpanded(id); setMsg(null)
    try { const { data } = await superApi.get(`/telegram/tenants/${id}/telegram`); setSettings(data) }
    catch (e) { console.error(e) }
  }

  const save = async () => {
    if (!settings) return; setSaving(true); setMsg(null)
    try {
      await superApi.put(`/telegram/tenants/${settings.tenant_id}/telegram`, {
        director_telegram_ids: settings.director_telegram_ids, group_chat_id: settings.group_chat_id,
        daily_report_enabled: settings.daily_report_enabled, daily_report_time: settings.daily_report_time,
      })
      setMsg({ ok: true, text: 'Saqlandi ✓' }); load()
    } catch (err: any) { setMsg({ ok: false, text: err.response?.data?.detail || 'Xatolik' }) }
    finally { setSaving(false) }
  }

  const test = async () => {
    if (!settings || !testChat) return; setTesting(true); setMsg(null)
    try {
      await superApi.post(`/telegram/tenants/${settings.tenant_id}/telegram/test`, {
        chat_id: testChat, message: `🧪 Test — ${settings.tenant_name}`
      })
      setMsg({ ok: true, text: 'Test yuborildi ✓' })
    } catch { setMsg({ ok: false, text: 'Yuborilmadi. Bot token va chat_id ni tekshiring.' }) }
    finally { setTesting(false) }
  }

  const getDeepLink = (slug: string) => {
    if (botUsername) return `https://t.me/${botUsername}?start=link_${slug}`
    return `(Bot username aniqlanmadi)`
  }

  const copyLink = (slug: string) => {
    const link = getDeepLink(slug)
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Telegram Bot</h1>
        <p className="text-gray-500 text-sm mt-1">
          Bitta bot barcha kompaniyalarga xizmat qiladi. Har bir kompaniyaga alohida sozlamalar.
        </p>
        {botUsername && (
          <p className="text-xs text-blue-600 mt-1">
            🤖 Bot: <a href={`https://t.me/${botUsername}`} target="_blank" className="underline">@{botUsername}</a>
          </p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Kompaniyalar', value: tenants.length, color: 'text-gray-900' },
          { label: 'Telegram ulangan', value: tenants.filter(t => t.has_directors).length, color: 'text-emerald-600' },
          { label: 'Kunlik hisobot', value: tenants.filter(t => t.daily_report_enabled).length, color: 'text-blue-600' },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="text-xs text-gray-500">{s.label}</div>
            <div className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {msg && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm ${msg.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
          {msg.text}
        </div>
      )}

      {/* Tenants */}
      <div className="space-y-2">
        {tenants.map(t => (
          <div key={t.tenant_id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <button onClick={() => toggle(t.tenant_id)} className="w-full flex items-center justify-between p-4 hover:bg-gray-50/50 transition">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm ${t.has_directors ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                  {t.tenant_name[0]}
                </div>
                <div className="text-left">
                  <div className="font-semibold text-sm text-gray-900">{t.tenant_name}</div>
                  <div className="text-xs text-gray-400 font-mono">/{t.tenant_slug}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {t.has_directors && <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-xs rounded-full font-medium">{t.directors_count} direktor</span>}
                {t.has_group_chat && <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded-full font-medium">Guruh</span>}
                {t.daily_report_enabled && <span className="px-2 py-0.5 bg-violet-50 text-violet-600 text-xs rounded-full font-medium">Hisobot</span>}
                {!t.has_directors && !t.has_group_chat && <span className="text-xs text-gray-400">Ulanmagan</span>}
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded === t.tenant_id ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </div>
            </button>

            {expanded === t.tenant_id && settings && (
              <div className="border-t border-gray-100 p-5 bg-gray-50/50 space-y-5">
                
                {/* Deep Link Section */}
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                  <p className="text-xs font-semibold text-blue-700 mb-2">🔗 Direktor ulash havolasi</p>
                  <p className="text-xs text-blue-600 mb-2">Bu havola direktorga yuboring — u bosganida avtomatik ulanadi.</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-white border border-blue-200 rounded px-3 py-2 truncate text-blue-800">
                      {getDeepLink(settings.tenant_slug)}
                    </code>
                    <button onClick={() => copyLink(settings.tenant_slug)}
                      className={`px-3 py-2 text-xs font-medium rounded-lg transition ${copied ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                      {copied ? 'Nusxalandi ✓' : 'Nusxalash'}
                    </button>
                  </div>
                </div>

                {/* Director IDs */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Direktor Telegram ID lari</label>
                  <input type="text" value={settings.director_telegram_ids} onChange={e => setSettings({...settings, director_telegram_ids: e.target.value})}
                    placeholder="123456789, 987654321"
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none" />
                  <p className="text-xs text-gray-400 mt-1">
                    Vergul bilan ajrating. Direktor /myid buyrug'i bilan ID olishi mumkin.
                    Yoki yuqoridagi havola orqali avtomatik ulanadi.
                  </p>
                </div>

                {/* Group Chat */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Guruh Chat ID</label>
                  <input type="text" value={settings.group_chat_id} onChange={e => setSettings({...settings, group_chat_id: e.target.value})}
                    placeholder="-1001234567890"
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none" />
                  <p className="text-xs text-gray-400 mt-1">
                    Guruhga bot qo'shing, keyin @RawDataBot orqali guruh ID ni aniqlang.
                  </p>
                </div>

                {/* Daily Report */}
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={settings.daily_report_enabled} onChange={e => setSettings({...settings, daily_report_enabled: e.target.checked})}
                      className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500" />
                    <span className="text-sm text-gray-700">Kunlik hisobot</span>
                  </label>
                  {settings.daily_report_enabled && (
                    <input type="time" value={settings.daily_report_time} onChange={e => setSettings({...settings, daily_report_time: e.target.value})}
                      className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm" />
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-1 border-t border-gray-200">
                  <button onClick={save} disabled={saving}
                    className="px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition">
                    {saving ? 'Saqlanmoqda...' : 'Saqlash'}
                  </button>
                  <div className="flex items-center gap-2">
                    <input type="text" value={testChat} onChange={e => setTestChat(e.target.value)} placeholder="Chat ID"
                      className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm w-36 outline-none" />
                    <button onClick={test} disabled={testing || !testChat}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition">
                      Test ↗
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {tenants.length === 0 && (
          <div className="text-center py-16 text-gray-400">Kompaniya topilmadi. Avval kompaniya yarating.</div>
        )}
      </div>
    </div>
  )
}
