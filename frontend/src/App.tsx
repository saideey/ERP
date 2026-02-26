import { useState, useEffect, useCallback } from 'react'
import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import { MainLayout } from '@/components/layout'
import { useAuthStore } from '@/stores/authStore'
import { Loader2 } from 'lucide-react'
import axios from 'axios'

// Tenant Pages
import LoginPage from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import POSPage from '@/pages/POS'
import SalesPage from '@/pages/Sales'
import ProductsPage from '@/pages/Products'
import CustomersPage from '@/pages/Customers'
import WarehousePage from '@/pages/Warehouse'
import ReportsPage from '@/pages/Reports'
import SettingsPage from '@/pages/Settings'
import UsersPage from '@/pages/Users'
import PartnersPage from '@/pages/Partners'

// Super Admin Pages
import SuperLoginPage from '@/pages/super/SuperLogin'
import SuperLayout from '@/pages/super/SuperLayout'
import SuperDashboard from '@/pages/super/SuperDashboard'
import TenantsPage from '@/pages/super/Tenants'
import TelegramManagement from '@/pages/super/TelegramManagement'
import BillingPage from '@/pages/super/Billing'
import SecuritySettings from '@/pages/super/SecuritySettings'

/**
 * Tenant Protected Route with real-time payment status polling.
 * Checks tenant status every 30 seconds — if super admin enables
 * payment notification, user sees overlay within 30s without re-login.
 */
function TenantProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, _hasHydrated, tenantSlug, user, setUser } = useAuthStore()
  const { tenantSlug: urlSlug } = useParams()
  const [paymentBlock, setPaymentBlock] = useState(false)
  const [paymentMsg, setPaymentMsg] = useState('')

  // Poll tenant status
  const checkTenantStatus = useCallback(async () => {
    if (!urlSlug) return
    try {
      const { data } = await axios.get(`/api/v1/tenant/${urlSlug}/info`)
      setPaymentBlock(!!data.payment_required)
      setPaymentMsg(data.payment_message || '')
      // Sync to store
      if (user && user.payment_required !== !!data.payment_required) {
        setUser({ ...user, payment_required: !!data.payment_required, payment_message: data.payment_message || '' })
      }
    } catch { /* ignore */ }
  }, [urlSlug])

  useEffect(() => {
    if (!isAuthenticated || !urlSlug) return
    // Immediate check
    checkTenantStatus()
    // Poll every 30s
    const iv = setInterval(checkTenantStatus, 30000)
    return () => clearInterval(iv)
  }, [isAuthenticated, urlSlug, checkTenantStatus])

  // Init from user
  useEffect(() => {
    if (user?.payment_required !== undefined) {
      setPaymentBlock(!!user.payment_required)
      setPaymentMsg(user.payment_message || '')
    }
  }, [])
  
  if (!_hasHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }
  
  if (!isAuthenticated || tenantSlug !== urlSlug) {
    return <Navigate to={`/${urlSlug}/login`} replace />
  }
  
  if (paymentBlock) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800 p-4">
        <div className="max-w-md w-full text-center">
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-3">To'lov talab qilinadi</h2>
            <p className="text-gray-600 mb-6">
              {paymentMsg || "Dasturdan foydalanish uchun iltimos to'lovni amalga oshiring. Administrator bilan bog'laning."}
            </p>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-left">
              <p className="text-sm text-red-800 font-medium">Kompaniya: {user?.tenant_name}</p>
              <p className="text-xs text-red-600 mt-1">To'lov amalga oshirilgandan so'ng tizimga kirish imkoniyati qaytariladi.</p>
            </div>
            <button
              onClick={() => {
                useAuthStore.getState().logout()
                window.location.href = `/${urlSlug}/login`
              }}
              className="w-full py-2.5 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition"
            >
              Chiqish
            </button>
          </div>
        </div>
      </div>
    )
  }
  
  return <>{children}</>
}

// Super admin protected route
function SuperProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isSuperAdmin, _hasHydrated } = useAuthStore()
  
  if (!_hasHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }
  
  if (!isSuperAdmin) {
    return <Navigate to="/s-panel/access" replace />
  }
  
  return <>{children}</>
}

function App() {
  return (
    <Routes>
      {/* ==================== SUPER ADMIN ROUTES ==================== */}
      <Route path="/s-panel/access" element={<SuperLoginPage />} />
      <Route
        path="/s-panel"
        element={
          <SuperProtectedRoute>
            <SuperLayout />
          </SuperProtectedRoute>
        }
      >
        <Route path="dashboard" element={<SuperDashboard />} />
        <Route path="tenants" element={<TenantsPage />} />
        <Route path="telegram" element={<TelegramManagement />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="security" element={<SecuritySettings />} />
        <Route index element={<Navigate to="/s-panel/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/s-panel/dashboard" replace />} />
      </Route>
      
      {/* ==================== TENANT ROUTES ==================== */}
      <Route path="/:tenantSlug/login" element={<LoginPage />} />
      
      <Route
        path="/:tenantSlug"
        element={
          <TenantProtectedRoute>
            <MainLayout />
          </TenantProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="pos" element={<POSPage />} />
        <Route path="sales" element={<SalesPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="warehouse" element={<WarehousePage />} />
        <Route path="partners" element={<PartnersPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="users" element={<UsersPage />} />
      </Route>
      
      <Route path="/" element={<Navigate to="/s-panel/access" replace />} />
      
      <Route path="*" element={
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-800 mb-4">404</h1>
            <p className="text-gray-600 mb-4">Sahifa topilmadi</p>
            <a href="/s-panel/access" className="text-blue-600 hover:underline">
              Bosh sahifaga qaytish
            </a>
          </div>
        </div>
      } />
    </Routes>
  )
}

export default App
