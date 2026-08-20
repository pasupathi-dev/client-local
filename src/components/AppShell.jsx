// ServiceLink app shell.
//
// Breakpoints:
//   <  md  (mobile):  56px topbar + content + 64px bottom nav
//   >= md (tablet/desktop): horizontal top nav (brand · nav items · avatar) + content
//
// Nav items:
//   User:    Home / Scheduled / My Work / Notifications / Profile
//   Partner: Dashboard / Requests / Scheduled / Active Job / Wallet / Profile
//
// Mode switcher lives on the Profile page (spec §A.2), NOT in the topbar.

import { useSelector } from 'react-redux'
import { useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { selectMode } from '@/features/app/appSlice'
import { selectProfile } from '@/features/profile/profileSlice'
import { selectUnread } from '@/features/notifications/notificationsSlice'
import { selectIncoming } from '@/features/partner/partnerSlice'
import { selectPartnerPendingCount } from '@/features/schedule/scheduleSlice'
import { selectOpenDisputeCount } from '@/features/disputes/disputesSlice'

// ── Role-based tab config ─────────────────────────────────────────────
const USER_NAV = [
  { id: 'home',          label: 'Explore',        icon: '🗺',  to: '/' },
  { id: 'scheduled',     label: 'Scheduled',      icon: '📅', to: '/scheduled' },
  { id: 'my-jobs',       label: 'My Work',        icon: '📋', to: '/my-jobs' },
  { id: 'notifications', label: 'Notifications',  icon: '🔔', to: '/notifications', badgeKey: 'unread' },
  { id: 'profile',       label: 'Profile',        icon: '👤', to: '/profile' },
]
const PARTNER_NAV = [
  { id: 'p-dashboard',     label: 'Dashboard',     icon: '🏠', to: '/partner' },
  { id: 'p-requests',      label: 'Requests',      icon: '📩', to: '/partner/requests',      badgeKey: 'requests' },
  { id: 'p-scheduled',     label: 'Scheduled',     icon: '📅', to: '/partner/scheduled',     badgeKey: 'scheduled' },
  { id: 'p-work',          label: 'Active Job',    icon: '🔧', to: '/partner/work' },
  { id: 'p-wallet',        label: 'Wallet',        icon: '💰', to: '/partner/wallet' },
  { id: 'p-disputes',      label: 'Disputes',      icon: '⚖️',  to: '/partner/disputes',      badgeKey: 'disputes' },
  { id: 'p-notifications', label: 'Notifications', icon: '🔔', to: '/partner/notifications', badgeKey: 'unread' },
  { id: 'p-profile',       label: 'Profile',       icon: '👤', to: '/partner/profile' },
]

const deriveInitials = (name, fallback = 'U') => {
  if (!name) return fallback
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase() || fallback
}

// ── Brand mark — geometric square with diamond cut-out (matches mock) ─
function BrandMark ({ light = false }) {
  return (
    <span className="inline-flex items-center gap-2.5 font-display font-bold
                     text-[20px] tracking-[-0.02em] whitespace-nowrap"
          style={{ color: light ? '#fff' : 'var(--ink)' }}>
      <span className="relative w-[28px] h-[28px] rounded-[9px] grid place-items-center
                       bg-gradient-to-br from-accent to-accent2"
            style={{ boxShadow: '0 6px 14px -4px var(--brand-glow)' }}>
        <span className="block w-[12px] h-[12px] rounded-[3px] bg-white/95 rotate-45" />
      </span>
      Service<span className="text-accent">Link</span>
    </span>
  )
}

// ── Mobile top bar (<md) ──────────────────────────────────────────────
function MobileTopBar ({ onAvatarClick, initials }) {
  return (
    <header
      className="md:hidden bg-card/85 backdrop-blur-md border-b border-border z-[200] relative
                 flex items-center gap-3 px-4 h-14 shrink-0">
      <BrandMark />
      <div className="ml-auto flex items-center gap-2.5">
        <button onClick={onAvatarClick}
          className="w-[34px] h-[34px] rounded-full font-bold text-xs text-white
                     flex items-center justify-center border-2 border-white
                     bg-gradient-to-br from-accent to-accent2 shadow-ds-sm">
          {initials}
        </button>
      </div>
    </header>
  )
}

// ── Mobile bottom nav (<md) — light card with brand-orange active dot ──
function MobileBottomNav ({ items, currentId, onNav, badges }) {
  return (
    <nav className="md:hidden bg-card/95 backdrop-blur-md border-t border-border z-[200] relative
                    flex items-stretch h-[var(--nav-h,64px)] shrink-0"
         style={{ '--nav-h': '64px' }}>
      {items.map((it) => {
        const on = currentId === it.id
        const badge = it.badgeKey ? badges[it.badgeKey] : null
        // C31 — Requests tab pulses while a live request is unresolved so a
        // partner on any other page can spot it in peripheral vision. Other
        // badges stay static.
        const pulse = it.badgeKey === 'requests' && badge > 0
        return (
          <button key={it.id} onClick={() => onNav(it.to)}
            className={`flex-1 relative flex flex-col items-center justify-center gap-[3px]
                        text-[9px] md:text-[10px] font-bold uppercase tracking-[0.3px]
                        px-1 py-1.5 transition-colors
                        ${on ? 'text-accent' : 'text-muted'}`}>
            {on && (
              <span className="absolute top-0 left-[28%] right-[28%] h-[3px] bg-accent rounded-b-[3px]" />
            )}
            <span className="text-[18px] md:text-[20px] leading-none">{it.icon}</span>
            <span>{it.label}</span>
            {badge > 0 && (
              <span className={`absolute top-[6px] right-[calc(50%-14px)]
                               bg-accent text-white font-extrabold text-[8px]
                               px-1.5 py-[1px] rounded-lg min-w-[14px] text-center leading-none
                               ${pulse ? 'animate-pulse shadow-[0_0_0_3px_rgba(232,65,26,0.18)]' : ''}`}>
                {badge}
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}

// ── Desktop top nav (≥md) — sticky frosted bar with pill nav links ────
// Pill rule:
//   • inactive  → muted on the warm background, hover lightens
//   • active    → ink-filled pill with white text + drop shadow
// Profile lives in a right-side white pill with avatar + name/role.
function DesktopTopNav ({ items, currentId, onNav, profile, initials, badges, onAvatarClick }) {
  return (
    <header className="hidden md:block sticky top-0 z-[200]
                       bg-surface/85 backdrop-blur-md backdrop-saturate-150
                       border-b border-border">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-7 h-[64px]
                      flex items-center gap-2">
        {/* Brand */}
        <div className="mr-4 shrink-0"><BrandMark /></div>

        {/* Pill nav — middle */}
        <nav className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto no-scrollbar">
          {items.map((it) => {
            const on = currentId === it.id
            const badge = it.badgeKey ? badges[it.badgeKey] : null
            return (
              <button key={it.id} onClick={() => onNav(it.to)}
                className={`relative inline-flex items-center gap-2 px-3.5 py-2 rounded-full
                            text-[13px] whitespace-nowrap transition-all
                            ${on
                              ? 'bg-ink text-white font-semibold shadow-ds-md'
                              : 'text-muted font-medium hover:text-text hover:bg-white/60'}`}>
                <span className="text-[15px] leading-none">{it.icon}</span>
                <span>{it.label}</span>
                {badge > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-[1px] rounded-full min-w-[18px]
                                   text-center leading-[1.4] bg-accent text-white
                                   ${it.badgeKey === 'requests' ? 'animate-pulse shadow-[0_0_0_3px_rgba(232,65,26,0.18)]' : ''}`}>
                    {badge}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Right side — profile pill (white, hairline border, hover lift) */}
        <button onClick={onAvatarClick}
          className="flex items-center gap-3 pl-3.5 pr-1.5 py-1 rounded-full
                     bg-card border border-border shrink-0 transition
                     hover:shadow-ds-md hover:-translate-y-px">
          <div className="hidden lg:block text-right leading-[1.15] min-w-0 max-w-[160px]">
            <div className="text-[13.5px] font-bold text-text truncate">
              {profile?.full_name || 'User'}
            </div>
            <div className="text-[11.5px] text-light truncate">
              {profile?.role === 'partner' ? 'Partner' : 'User'}
              {profile?.user_id ? ` · ID ${String(profile.user_id).slice(-4)}` : ''}
            </div>
          </div>
          <div className="w-[36px] h-[36px] rounded-full font-bold text-[14px] text-white
                          flex items-center justify-center border-2 border-white
                          bg-gradient-to-br from-accent to-accent-deep"
               style={{ boxShadow: '0 4px 10px -2px var(--brand-glow)' }}>
            {initials}
          </div>
        </button>
      </div>
    </header>
  )
}

// ── App Shell ─────────────────────────────────────────────────────────
export default function AppShell ({ children }) {
  const mode     = useSelector(selectMode)
  const profile  = useSelector(selectProfile)
  const unread   = useSelector(selectUnread)
  const incoming = useSelector(selectIncoming)
  const pendingSchedules = useSelector(selectPartnerPendingCount)
  const openDisputes     = useSelector(selectOpenDisputeCount)
  const nav      = useNavigate()
  const loc      = useLocation()

  const isPartner = mode === 'partner'
  const items     = isPartner ? PARTNER_NAV : USER_NAV
  const initials  = deriveInitials(profile?.full_name)
  const badges    = {
    unread,
    requests:  incoming?.length || 0,
    scheduled: pendingSchedules || 0,
    disputes:  openDisputes || 0,
  }

  // Longest-prefix match so `/partner/work` lights up "Active Job", not "Dashboard".
  const currentId = items
    .filter((it) => loc.pathname === it.to || loc.pathname.startsWith(it.to + '/'))
    .sort((a, b) => b.to.length - a.to.length)[0]?.id

  const onAvatarClick = () => nav(isPartner ? '/partner/profile' : '/profile')

  const mainRef = useRef(null)
  useEffect(() => { mainRef.current?.scrollTo(0, 0) }, [loc.pathname])

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden bg-surface text-text">

      {/* DESKTOP/TABLET top nav (≥md) */}
      <DesktopTopNav items={items} currentId={currentId} onNav={nav}
                     profile={profile} initials={initials} badges={badges}
                     onAvatarClick={onAvatarClick} />

      {/* MOBILE topbar (<md) */}
      <MobileTopBar onAvatarClick={onAvatarClick} initials={initials} />

      {/* CONTENT */}
      <main ref={mainRef} className="flex-1 overflow-y-auto relative bg-surface min-h-0">{children}</main>

      {/* MOBILE bottom nav (<md) */}
      <MobileBottomNav items={items} currentId={currentId} onNav={nav} badges={badges} />
    </div>
  )
}
