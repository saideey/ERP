import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/stores/authStore'

/**
 * Get the tenant-scoped API base URL.
 * Pattern: /api/v1/{tenant_slug}
 */
function getTenantBaseURL(): string {
  const tenantSlug = useAuthStore.getState().tenantSlug
  if (tenantSlug) {
    return `/api/v1/${tenantSlug}`
  }
  return '/api/v1'
}

/**
 * Tenant-scoped API instance.
 * All requests go to /api/v1/{tenant_slug}/...
 */
export const api = axios.create({
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor - add auth token and tenant base URL
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const store = useAuthStore.getState()
    
    // Set tenant-scoped base URL
    if (store.tenantSlug && config.url && !config.url.startsWith('/api/v1/super')) {
      config.baseURL = `/api/v1/${store.tenantSlug}`
    }
    
    // Add auth token
    const token = store.token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor - handle 401 errors
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      const store = useAuthStore.getState()
      const refreshToken = store.refreshToken
      const tenantSlug = store.tenantSlug
      
      if (refreshToken && tenantSlug) {
        try {
          const response = await axios.post(`/api/v1/${tenantSlug}/auth/refresh`, {
            refresh_token: refreshToken,
          })
          const newToken = response.data.tokens?.access_token || response.data.access_token
          if (newToken) {
            store.setToken(newToken)
            if (error.config) {
              error.config.headers.Authorization = `Bearer ${newToken}`
              return axios(error.config)
            }
          }
        } catch {
          store.logout()
          window.location.href = `/${tenantSlug}/login`
        }
      } else {
        store.logout()
        const slug = tenantSlug || ''
        window.location.href = slug ? `/${slug}/login` : '/s-panel/access'
      }
    }
    return Promise.reject(error)
  }
)

/**
 * Super Admin API instance.
 * All requests go to /api/v1/super/...
 */
export const superApi = axios.create({
  baseURL: '/api/v1/super',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Super admin request interceptor
superApi.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = useAuthStore.getState().superToken
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Super admin response interceptor
superApi.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().superLogout()
      window.location.href = '/s-panel/access'
    }
    return Promise.reject(error)
  }
)

export default api
