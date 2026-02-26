import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { superApi } from '@/services/api'

export default function SuperLoginPage() {
  const navigate = useNavigate()
  const { setSuperAuth, isSuperAdmin } = useAuthStore()
  const [revealed, setRevealed] = useState(false)
  const [clickCount, setClickCount] = useState(0)
  const [step, setStep] = useState(1)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [securityCode, setSecurityCode] = useState('')
  const [hasPin, setHasPin] = useState(true)
  const [hasCode, setHasCode] = useState(true)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [lockMsg, setLockMsg] = useState('')

  // Secret reveal: click the icon 5 times within 3 seconds
  const handleSecretClick = useCallback(() => {
    setClickCount(prev => {
      const next = prev + 1
      if (next >= 5) {
        setRevealed(true)
        return 0
      }
      // Reset after 3 seconds
      setTimeout(() => setClickCount(0), 3000)
      return next
    })
  }, [])

  // Redirect if already authenticated
  useEffect(() => {
    if (isSuperAdmin) navigate('/s-panel/dashboard', { replace: true })
  }, [isSuperAdmin, navigate])

  const handleStep1 = async () => {
    if (!username.trim()) return
    setLoading(true); setError(''); setLockMsg('')
    try {
      await superApi.post('/auth/verify-step1', { username })
      setStep(2)
    } catch (err: any) {
      const status = err.response?.status
      const msg = err.response?.data?.detail || 'Xatolik'
      if (status === 423) setLockMsg(msg)
      else if (status === 429) setLockMsg(msg)
      else setError(msg)
    } finally { setLoading(false) }
  }

  const handleStep2 = async () => {
    if (!password) return
    setLoading(true); setError('')
    try {
      const { data } = await superApi.post('/auth/verify-step2', { username, password })
      setHasPin(data.has_pin)
      setHasCode(data.has_code)
      if (!data.has_pin && !data.has_code) {
        // No PIN or code set — skip to final
        await doFinalLogin('', '')
      } else if (!data.has_pin) {
        setStep(4) // Skip PIN, go to code
      } else {
        setStep(3)
      }
    } catch (err: any) {
      const status = err.response?.status
      if (status === 423) setLockMsg(err.response?.data?.detail)
      else setError(err.response?.data?.detail || 'Xatolik')
    } finally { setLoading(false) }
  }

  const handleStep3 = async () => {
    if (!pin || pin.length < 4) { setError('PIN kiriting'); return }
    setLoading(true); setError('')
    try {
      await superApi.post('/auth/verify-step3', { username, password, pin })
      if (!hasCode) {
        await doFinalLogin(pin, '')
      } else {
        setStep(4)
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Xatolik')
    } finally { setLoading(false) }
  }

  const handleStep4 = async () => {
    if (!securityCode) return
    setLoading(true); setError('')
    await doFinalLogin(pin, securityCode)
    setLoading(false)
  }

  const doFinalLogin = async (p: string, sc: string) => {
    try {
      const { data } = await superApi.post('/auth/verify-step4', {
        username, password, pin: p || '000000', security_code: sc || 'default'
      })
      setSuperAuth(data.admin, data.access_token, data.refresh_token)
      navigate('/s-panel/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Xatolik')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent, handler: () => void) => {
    if (e.key === 'Enter') handler()
  }

  // ===== FAKE TENANT-NOT-FOUND PAGE =====
  if (isSuperAdmin) return null

  if (!revealed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center">
          <div
            className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4 cursor-default select-none"
            onClick={handleSecretClick}
          >
            <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M12 20h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Kompaniya topilmadi</h1>
          <p className="text-gray-500 mb-4">
            <code className="bg-gray-200 px-2 py-0.5 rounded">/s-pa</code> bo'yicha kompaniya ro'yxatdan o'tmagan
          </p>
        </div>
      </div>
    )
  }

  // ===== REAL LOGIN =====
  const stepLabels = ['', 'Foydalanuvchi', 'Parol', 'PIN kod', 'Xavfsizlik kodi']

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.02]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none'%3E%3Cg fill='%23fff'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
      }} />
      <div className="absolute top-1/4 -left-32 w-64 h-64 bg-orange-500/10 rounded-full blur-[128px]" />
      <div className="absolute bottom-1/4 -right-32 w-64 h-64 bg-red-500/10 rounded-full blur-[128px]" />

      <div className="relative w-full max-w-sm mx-4">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-orange-500/20">
            <span className="text-white font-black text-xl">🔒</span>
          </div>
          <h1 className="text-xl font-bold text-white">Xavfsiz kirish</h1>
          <p className="text-gray-500 text-sm mt-1">Bosqich {step}/4 · {stepLabels[step]}</p>
        </div>

        {/* Progress */}
        <div className="flex gap-1.5 mb-6">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className={`h-1 flex-1 rounded-full transition-all duration-500 ${
              s <= step ? 'bg-gradient-to-r from-orange-500 to-red-500' :
              s < step ? 'bg-emerald-500' : 'bg-gray-800'
            }`} />
          ))}
        </div>

        <form className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl" onSubmit={e => e.preventDefault()} autoComplete="off">
          {lockMsg && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg mb-4 text-sm flex items-center gap-2">
              <span className="text-lg">🔒</span> {lockMsg}
            </div>
          )}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2.5 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          {/* STEP 1: Username */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Foydalanuvchi nomi</label>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                  onKeyDown={e => handleKeyDown(e, handleStep1)}
                  className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 outline-none transition text-sm"
                  placeholder="username" autoComplete="username" required autoFocus />
              </div>
              <button type="button" onClick={handleStep1} disabled={loading || !username.trim()}
                className="w-full py-2.5 bg-gradient-to-r from-orange-500 to-red-600 text-white font-semibold rounded-lg disabled:opacity-50 text-sm shadow-lg shadow-orange-500/20">
                {loading ? '...' : 'Davom etish →'}
              </button>
            </div>
          )}

          {/* STEP 2: Password */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="text-xs text-gray-500 bg-gray-800/50 px-3 py-2 rounded-lg">
                👤 {username}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Parol</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => handleKeyDown(e, handleStep2)}
                  className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:ring-2 focus:ring-orange-500/40 outline-none transition text-sm"
                  placeholder="••••••••" autoComplete="current-password" required autoFocus />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => { setStep(1); setPassword(''); setError('') }}
                  className="px-4 py-2.5 border border-gray-700 text-gray-400 rounded-lg text-sm hover:bg-gray-800">←</button>
                <button type="button" onClick={handleStep2} disabled={loading || !password}
                  className="flex-1 py-2.5 bg-gradient-to-r from-orange-500 to-red-600 text-white font-semibold rounded-lg disabled:opacity-50 text-sm">
                  {loading ? '...' : 'Davom etish →'}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: PIN */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-3xl mb-2">🔐</div>
                <p className="text-xs text-gray-400">PIN kodni kiriting</p>
              </div>
              <input type="password" value={pin} onChange={e => setPin(e.target.value)}
                onKeyDown={e => handleKeyDown(e, handleStep3)}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white text-center text-lg placeholder-gray-600 focus:ring-2 focus:ring-orange-500/40 outline-none"
                placeholder="PIN kod" autoComplete="off" autoFocus />
              <div className="flex gap-2">
                <button type="button" onClick={() => { setStep(2); setPin(''); setError('') }}
                  className="px-4 py-2.5 border border-gray-700 text-gray-400 rounded-lg text-sm hover:bg-gray-800">←</button>
                <button type="button" onClick={handleStep3} disabled={loading || pin.length < 4}
                  className="flex-1 py-2.5 bg-gradient-to-r from-orange-500 to-red-600 text-white font-semibold rounded-lg disabled:opacity-50 text-sm">
                  {loading ? '...' : 'Davom etish →'}
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Security Code */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-3xl mb-2">🛡️</div>
                <p className="text-xs text-gray-400">Xavfsizlik kodini kiriting</p>
              </div>
              <input type="password" value={securityCode} onChange={e => setSecurityCode(e.target.value)}
                onKeyDown={e => handleKeyDown(e, handleStep4)}
                className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:ring-2 focus:ring-orange-500/40 outline-none transition text-sm"
                placeholder="Xavfsizlik kodi" autoComplete="off" required autoFocus />
              <div className="flex gap-2">
                <button type="button" onClick={() => { setStep(hasPin ? 3 : 2); setSecurityCode(''); setError('') }}
                  className="px-4 py-2.5 border border-gray-700 text-gray-400 rounded-lg text-sm hover:bg-gray-800">←</button>
                <button type="button" onClick={handleStep4} disabled={loading || !securityCode}
                  className="flex-1 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold rounded-lg disabled:opacity-50 text-sm shadow-lg shadow-emerald-500/20">
                  {loading ? '...' : '🔓 Kirish'}
                </button>
              </div>
            </div>
          )}
        </form>

        <p className="text-center text-gray-800 text-[10px] mt-6">v2.0</p>
      </div>
    </div>
  )
}
