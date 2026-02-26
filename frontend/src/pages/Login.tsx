import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Loader2, User, Lock, Eye, EyeOff } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import axios from 'axios'
import type { TenantPublicInfo, AuthResponse } from '@/types'

export default function LoginPage() {
  const navigate = useNavigate()
  const { tenantSlug } = useParams<{ tenantSlug: string }>()
  const { setAuth, isAuthenticated, tenantSlug: storedSlug } = useAuthStore()
  
  const [tenantInfo, setTenantInfo] = useState<TenantPublicInfo | null>(null)
  const [tenantLoading, setTenantLoading] = useState(true)
  const [tenantNotFound, setTenantNotFound] = useState(false)
  
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  // Redirect if already authenticated for this tenant
  useEffect(() => {
    if (isAuthenticated && storedSlug === tenantSlug) {
      navigate(`/${tenantSlug}`, { replace: true })
    }
  }, [isAuthenticated, storedSlug, tenantSlug])

  // Load tenant info
  useEffect(() => {
    if (!tenantSlug) return
    
    const loadTenantInfo = async () => {
      try {
        const { data } = await axios.get<TenantPublicInfo>(`/api/v1/tenant/${tenantSlug}/info`)
        setTenantInfo(data)
      } catch {
        setTenantNotFound(true)
      } finally {
        setTenantLoading(false)
      }
    }
    
    loadTenantInfo()
  }, [tenantSlug])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tenantSlug) return
    
    setError('')
    setIsLoading(true)

    try {
      const { data } = await axios.post<AuthResponse>(
        `/api/v1/${tenantSlug}/auth/login`,
        { username, password }
      )

      setAuth(
        data.user,
        data.tokens.access_token,
        data.tokens.refresh_token,
        tenantSlug
      )
      
      navigate(`/${tenantSlug}`)
    } catch (err: any) {
      const detail = err.response?.data?.detail
      if (typeof detail === 'string') {
        setError(detail)
      } else {
        setError('Login xatolik yuz berdi')
      }
    } finally {
      setIsLoading(false)
    }
  }

  // Loading state
  if (tenantLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  // Tenant not found
  if (tenantNotFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center">
          <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M12 20h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Kompaniya topilmadi</h1>
          <p className="text-gray-500 mb-4">
            <code className="bg-gray-200 px-2 py-0.5 rounded">/{tenantSlug}</code> bo'yicha kompaniya ro'yxatdan o'tmagan
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Company Header */}
          <div className="text-center mb-8">
            {tenantInfo?.logo_url ? (
              <img
                src={tenantInfo.logo_url}
                alt={tenantInfo.name}
                className="w-20 h-20 mx-auto mb-4 rounded-2xl object-contain"
              />
            ) : (
              <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl font-bold text-white">
                  {tenantInfo?.name?.charAt(0)?.toUpperCase() || 'M'}
                </span>
              </div>
            )}
            <h1 className="text-2xl font-bold text-gray-900">{tenantInfo?.name}</h1>
            <p className="text-gray-500 mt-1">Tizimga kirish</p>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm">
              {error}
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Foydalanuvchi nomi</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="admin"
                  required
                  autoFocus
                  autoComplete="username"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Parol</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Kirish...
                </>
              ) : (
                'Kirish'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-gray-400 text-xs mt-6">
          X ERP SYSTEM &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
