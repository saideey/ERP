import { useEffect, useRef, useCallback } from 'react'
import { useAuthStore } from '@/stores/authStore'

const SESSION_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
const EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click']

/**
 * Auto-logout after 30 minutes of inactivity.
 * Tracks mouse, keyboard, scroll, touch events.
 * @param mode 'tenant' | 'super' — which auth to logout
 */
export function useSessionTimeout(mode: 'tenant' | 'super') {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { logout, superLogout } = useAuthStore()

  const doLogout = useCallback(() => {
    if (mode === 'super') {
      superLogout()
      window.location.href = '/s-panel/access'
    } else {
      const slug = useAuthStore.getState().tenantSlug
      logout()
      window.location.href = slug ? `/${slug}/login` : '/'
    }
  }, [mode, logout, superLogout])

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(doLogout, SESSION_TIMEOUT_MS)
  }, [doLogout])

  useEffect(() => {
    // Start timer
    resetTimer()

    // Listen to activity events
    const handler = () => resetTimer()
    EVENTS.forEach(e => window.addEventListener(e, handler, { passive: true }))

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      EVENTS.forEach(e => window.removeEventListener(e, handler))
    }
  }, [resetTimer])
}
