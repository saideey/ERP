import { useState, useEffect, useCallback } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { NotificationBell } from './NotificationBell'
import { Menu, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { useSessionTimeout } from '@/hooks/useSessionTimeout'

export function MainLayout() {
  useSessionTimeout('tenant')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === 'true')
  const [isDesktop, setIsDesktop] = useState(false)
  const location = useLocation()

  // Track screen size
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false)
      // Ctrl+B toggle sidebar
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); toggleCollapse() }
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [collapsed])

  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [sidebarOpen])

  const toggleCollapse = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem('sidebar-collapsed', String(next))
      return next
    })
  }, [])

  // Desktop: show sidebar unless collapsed. Mobile: show via hamburger
  const sidebarVisible = isDesktop ? !collapsed : sidebarOpen

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-surface border-b border-border z-30 flex items-center justify-between px-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg hover:bg-gray-100 transition active:scale-95">
            <Menu className="w-5 h-5" />
          </button>
          <img src="/logo.png" alt="Logo" className="h-10 w-auto object-contain" />
        </div>
        <NotificationBell />
      </header>

      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarVisible}
        onClose={() => { if (!isDesktop) setSidebarOpen(false) }}
        collapsed={isDesktop && collapsed}
      />

      {/* Desktop collapse toggle */}
      {isDesktop && (
        <button
          onClick={toggleCollapse}
          className="fixed top-3 z-[60] w-7 h-7 rounded-md bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-all duration-300"
          style={{ left: collapsed ? '10px' : '276px' }}
          title={collapsed ? 'Sidebar ochish (Ctrl+B)' : 'Sidebar yopish (Ctrl+B)'}
        >
          {collapsed ? <ChevronsRight className="w-3.5 h-3.5" /> : <ChevronsLeft className="w-3.5 h-3.5" />}
        </button>
      )}

      {/* Main Content */}
      <main
        className="min-h-screen transition-all duration-300 pt-14 lg:pt-0"
        style={{ marginLeft: isDesktop && !collapsed ? '288px' : '0' }}
      >
        <div className="p-3 sm:p-4 lg:p-5">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
