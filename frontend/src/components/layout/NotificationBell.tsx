import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCircle2, XCircle, ArrowDown, Link2, Wallet } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import api from '@/services/api'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'

const typeIcons: Record<string, { icon: any; color: string }> = {
  transfer_incoming: { icon: ArrowDown, color: 'text-blue-500' },
  transfer_accepted: { icon: CheckCircle2, color: 'text-green-500' },
  transfer_rejected: { icon: XCircle, color: 'text-red-500' },
  transfer_edited: { icon: Bell, color: 'text-orange-500' },
  transfer_confirmed_edit: { icon: CheckCircle2, color: 'text-green-500' },
  partnership_request: { icon: Link2, color: 'text-purple-500' },
  partnership_accepted: { icon: CheckCircle2, color: 'text-green-500' },
  partnership_rejected: { icon: XCircle, color: 'text-red-500' },
  payment_pending: { icon: Wallet, color: 'text-amber-500' },
  payment_confirmed: { icon: CheckCircle2, color: 'text-green-500' },
  payment_rejected: { icon: XCircle, color: 'text-red-500' },
}

function timeAgo(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000)
  if (diff < 60) return 'Hozir'
  if (diff < 3600) return `${Math.floor(diff / 60)} min`
  if (diff < 86400) return `${Math.floor(diff / 3600)} soat`
  return `${Math.floor(diff / 86400)} kun`
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { tenantSlug } = useAuthStore()

  const { data: countData } = useQuery({
    queryKey: ['notification-count'],
    queryFn: async () => {
      const { data } = await api.get('/partners/notifications/count')
      return data
    },
    refetchInterval: 30000,
  })
  const unreadCount = countData?.unread_count || 0

  const { data: notifsData, refetch } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data } = await api.get('/partners/notifications')
      return data
    },
    enabled: open,
  })
  const notifications = notifsData?.data || []

  useEffect(() => {
    if (open) refetch()
  }, [open])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const markAllRead = async () => {
    await api.post('/partners/notifications/read')
    queryClient.invalidateQueries({ queryKey: ['notification-count'] })
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  const getTargetTab = (notif: any): string => {
    if (notif.reference_type === 'transfer') {
      if (notif.type.includes('incoming')) return 'incoming'
      // For edited/confirmed notifications, the receiver sees them in incoming, sender in outgoing
      // Since notification goes to the OTHER party, check: if from_tenant sent me this about an edit,
      // I might be sender or receiver. Default to incoming first, outgoing second.
      if (notif.type.includes('edited') || notif.type.includes('confirmed_edit')) return 'incoming'
      return 'outgoing'
    }
    if (notif.reference_type === 'partnership') return 'partners'
    if (notif.reference_type === 'payment') return 'payments'
    return 'partners'
  }

  const handleClick = (notif: any) => {
    api.post(`/partners/notifications/${notif.id}/read`)
    setOpen(false)
    const tab = getTargetTab(notif)
    const targetPath = `/${tenantSlug}/partners`
    window.dispatchEvent(new CustomEvent('partner-tab-change', { detail: { tab } }))
    navigate(`${targetPath}?tab=${tab}`, { replace: location.pathname.includes('/partners') })
    queryClient.invalidateQueries({ queryKey: ['notification-count'] })
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className="relative p-2.5 rounded-xl hover:bg-gray-100 transition-colors active:scale-95"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />

          {/* Dropdown - ALWAYS fixed, full width on mobile, positioned on desktop */}
          <div
            ref={ref}
            className="fixed z-[61] bg-white rounded-xl shadow-2xl border border-border overflow-hidden
                       left-2 right-2 top-16 max-h-[75vh]
                       sm:left-auto sm:w-80 sm:top-14 sm:right-4
                       lg:left-auto lg:right-4 lg:top-4 lg:w-80"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b bg-white">
              <span className="font-semibold text-sm">Bildirishnomalar</span>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-xs text-primary hover:underline">
                  Barchasini o'qish
                </button>
              )}
            </div>

            <div className="overflow-y-auto max-h-[calc(75vh-50px)]">
              {notifications.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  Bildirishnomalar yo'q
                </div>
              ) : (
                notifications.map((n: any) => {
                  const t = typeIcons[n.type] || { icon: Bell, color: 'text-gray-500' }
                  const Icon = t.icon
                  return (
                    <button
                      key={n.id}
                      onClick={() => handleClick(n)}
                      className={cn(
                        'w-full text-left px-4 py-3 border-b last:border-0 hover:bg-muted/50 transition-colors',
                        !n.is_read && 'bg-blue-50/50'
                      )}
                    >
                      <div className="flex gap-3">
                        <div className={cn('mt-0.5 flex-shrink-0', t.color)}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className={cn('text-sm line-clamp-2', !n.is_read && 'font-semibold')}>
                              {n.title}
                            </span>
                            {!n.is_read && (
                              <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
                            )}
                          </div>
                          {n.message && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                          )}
                          <div className="text-[10px] text-muted-foreground mt-1">
                            {n.from_tenant_name && <span>{n.from_tenant_name} · </span>}
                            {timeAgo(n.created_at)}
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}
