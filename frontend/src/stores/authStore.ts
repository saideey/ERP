import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, SuperAdmin } from '@/types'

interface AuthState {
  // Tenant user auth
  user: User | null
  token: string | null
  refreshToken: string | null
  tenantSlug: string | null
  isAuthenticated: boolean
  
  // Super admin auth
  superAdmin: SuperAdmin | null
  superToken: string | null
  superRefreshToken: string | null
  isSuperAdmin: boolean
  
  _hasHydrated: boolean
  
  // Tenant user actions
  setAuth: (user: User, token: string, refreshToken: string, tenantSlug: string) => void
  setToken: (token: string) => void
  setUser: (user: User) => void
  logout: () => void
  hasPermission: (permission: string) => boolean
  
  // Super admin actions
  setSuperAuth: (admin: SuperAdmin, token: string, refreshToken: string) => void
  superLogout: () => void
  
  setHasHydrated: (state: boolean) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      tenantSlug: null,
      isAuthenticated: false,
      
      superAdmin: null,
      superToken: null,
      superRefreshToken: null,
      isSuperAdmin: false,
      
      _hasHydrated: false,

      setAuth: (user, token, refreshToken, tenantSlug) => {
        set({
          user,
          token,
          refreshToken,
          tenantSlug,
          isAuthenticated: true,
          // Clear super admin state
          superAdmin: null,
          superToken: null,
          superRefreshToken: null,
          isSuperAdmin: false,
        })
      },

      setToken: (token) => {
        set({ token })
      },

      setUser: (user) => {
        set({ user })
      },

      logout: () => {
        set({
          user: null,
          token: null,
          refreshToken: null,
          tenantSlug: null,
          isAuthenticated: false,
        })
      },

      hasPermission: (permission) => {
        const { user } = get()
        if (!user) return false
        if (user.role_type === 'director') return true
        return user.permissions?.includes(permission) || false
      },
      
      // Super admin
      setSuperAuth: (admin, token, refreshToken) => {
        set({
          superAdmin: admin,
          superToken: token,
          superRefreshToken: refreshToken,
          isSuperAdmin: true,
          // Clear tenant user state
          user: null,
          token: null,
          refreshToken: null,
          tenantSlug: null,
          isAuthenticated: false,
        })
      },
      
      superLogout: () => {
        set({
          superAdmin: null,
          superToken: null,
          superRefreshToken: null,
          isSuperAdmin: false,
        })
      },
      
      setHasHydrated: (state) => {
        set({ _hasHydrated: state })
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        token: state.token,
        refreshToken: state.refreshToken,
        user: state.user,
        tenantSlug: state.tenantSlug,
        isAuthenticated: state.isAuthenticated,
        superAdmin: state.superAdmin,
        superToken: state.superToken,
        superRefreshToken: state.superRefreshToken,
        isSuperAdmin: state.isSuperAdmin,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)
