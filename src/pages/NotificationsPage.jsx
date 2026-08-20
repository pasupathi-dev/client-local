import { useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import {
  loadNotifications, loadMoreNotifications,
  markOneRead, markAllRead,
  selectNotifications, selectUnread, selectNotificationsTotal,
  selectNotificationsLoading, selectNotificationsLoadingMore,
  selectNotificationsCategory, selectNotificationsError,
} from '@/features/notifications/notificationsSlice'
import Loader from '@/components/Loader'
import EmptyState from '@/components/EmptyState'
import ListError from '@/components/ListError'
import { RowSkeleton } from '@/components/Skeleton'
import { safeNotificationRoute } from '@/utils/notificationRoutes'

// H53 — tab bar above the list. `key=null` = "All" (server folds out
// promos automatically when the user toggled Mute Promos in Settings).
const TABS = [
  { key: null,       label: 'All',      icon: '🔔' },
  { key: 'jobs',     label: 'Jobs',     icon: '🛠️' },
  { key: 'payments', label: 'Payments', icon: '💳' },
  { key: 'promos',   label: 'Promos',   icon: '🎁' },
]

export default function NotificationsPage () {
  const dispatch    = useDispatch()
  const nav         = useNavigate()
  const list        = useSelector(selectNotifications)
  const unread      = useSelector(selectUnread)
  const total       = useSelector(selectNotificationsTotal)
  const loading     = useSelector(selectNotificationsLoading)
  const loadingMore = useSelector(selectNotificationsLoadingMore)
  const category    = useSelector(selectNotificationsCategory)
  const error       = useSelector(selectNotificationsError)
  const sentinelRef = useRef(null)

  // Reload whenever the selected tab changes (initial mount included).
  useEffect(() => { dispatch(loadNotifications({ category })) }, [dispatch, category])

  // Tap → mark read AND deep-link if a route was persisted on the row.
  // Server-side every Notification.create caller sets `route` to the same
  // value the matching FCM push uses; older rows (no route) just mark read.
  // We deliberately swallow internal-link errors by falling back to no-op
  // when route is null or doesn't match a known prefix.
  const handleTap = (n) => {
    if (!n.read) dispatch(markOneRead(n.id))
    // H54 — Allowlist check. Unknown / portal-only / missing routes are
    // dropped so a stale notification can't dump the user onto the
    // catch-all redirect.
    const route = safeNotificationRoute(n.route)
    if (route) nav(route)
  }

  const hasMore = list.length < total

  // IntersectionObserver on a sentinel <div> at the bottom of the list —
  // whenever it scrolls into view and we're not already fetching, pull the
  // next 10 rows from the server.
  useEffect(() => {
    if (!sentinelRef.current) return
    const el = sentinelRef.current
    const io = new IntersectionObserver((entries) => {
      const e = entries[0]
      if (e.isIntersecting && hasMore && !loading && !loadingMore) {
        dispatch(loadMoreNotifications())
      }
    }, { rootMargin: '120px' })
    io.observe(el)
    return () => io.disconnect()
  }, [dispatch, hasMore, loading, loadingMore])

  return (
    <div className="p-5">
      {/* H53 tab bar — horizontal pills, sticky-ish above the list */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-3 -mx-1 px-1">
        {TABS.map((t) => {
          const active = (t.key || null) === (category || null)
          return (
            <button key={t.label}
              onClick={() => dispatch(loadNotifications({ category: t.key }))}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-bold border transition
                          ${active
                            ? 'bg-accent text-white border-accent'
                            : 'bg-card text-text border-border hover:border-accent'}`}>
              <span className="mr-1">{t.icon}</span>{t.label}
            </button>
          )
        })}
      </div>

      {unread > 0 && (
        <div className="flex justify-end mb-3">
          <button onClick={() => dispatch(markAllRead())}
            className="text-accent font-bold text-[11px] px-2.5 py-1 rounded-xl
                       border border-border bg-card hover:border-accent transition">
            Mark all read
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {/* M86 — Skeleton rows instead of a spinner while the first page loads. */}
        {loading && list.length === 0 && <RowSkeleton count={5} />}

        {/* H85 — fetch failed and we have nothing to fall back to. */}
        {!loading && error && list.length === 0 && (
          <ListError onRetry={() => dispatch(loadNotifications({ category }))} />
        )}

        {list.map((n) => {
          const hasLink = !!safeNotificationRoute(n.route)
          const unread  = !n.read
          return (
            <button key={n.id} onClick={() => handleTap(n)}
              className={`p-3.5 flex gap-3 text-left transition rounded-[var(--r)] border shadow-card
                          ${unread
                            ? 'bg-card border-border'                       /* L58 — unread: white card */
                            : 'bg-surface border-border/60 opacity-90'}     /* L58 — read: greyed out */
                          ${unread ? 'border-l-[3px] border-l-accent' : ''}
                          ${hasLink ? 'hover:border-accent cursor-pointer' : 'cursor-default'}`}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0"
                   style={{ background: n.icon_bg || '#f3f4f6' }}>
                {n.icon || '🔔'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {/* L58 — orange dot on unread title */}
                  {unread && (
                    <span aria-hidden
                      className="inline-block w-2 h-2 rounded-full bg-accent shrink-0"/>
                  )}
                  <div className={`text-sm truncate ${unread ? 'font-extrabold text-text' : 'font-semibold text-muted'}`}>
                    {n.title}
                  </div>
                </div>
                <div className={`text-xs mt-0.5 ${unread ? 'text-text/80' : 'text-muted'}`}>{n.body}</div>
                <div className="text-[10px] text-light mt-1">{new Date(n.created_at).toLocaleString()}</div>
              </div>
              {hasLink && (
                <span className="self-center text-muted text-[14px] leading-none shrink-0"
                      aria-hidden>›</span>
              )}
            </button>
          )
        })}

        {/* H84 — Actionable empty state with a CTA to the home page so the
            user has a clear next step rather than a dead "No data" wall. */}
        {!loading && !error && list.length === 0 && (
          <EmptyState
            icon="🔔"
            title={category ? `No ${category} notifications yet` : 'No notifications yet'}
            copy="When something happens on your jobs or payments, it'll show up here."
            ctaLabel="Browse services"
            onCta={() => nav('/')}
          />
        )}

        {/* Infinite-scroll sentinel + bottom loader. Only rendered when we
            actually know more rows exist on the server. */}
        {hasMore && (
          <div ref={sentinelRef} className="py-3 flex justify-center">
            {loadingMore
              ? <Loader size={16}/>
              : <span className="text-[11px] text-muted">Scroll for more…</span>}
          </div>
        )}

        {!hasMore && list.length > 0 && (
          <div className="py-3 text-center text-[11px] text-muted">That's everything ({total})</div>
        )}
      </div>
    </div>
  )
}
