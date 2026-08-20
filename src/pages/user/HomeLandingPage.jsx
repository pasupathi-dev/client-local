// Customer home — minimal launch landing.
//
// Replaces the Leaflet map (MapHomePage) as the user's first screen. The map
// is still in the repo (kept intact) for when we want to re-introduce it.
//
// Sections (top → bottom):
//   1. Centered hero  — city tag, headline, sub, clean search bar
//   2. What we help with — category cards (icon + name only, no fake metrics)
//   3. Two paths      — Find a service / Become a partner CTAs
//   4. How it works   — 3-step explainer
//   5. Quiet footer   — service area + secondary links
//
// All categories come from the catalog slice (loadCategories), which hits
// /api/categories. We don't hard-code the list; admins manage it in the portal.
// The "Become a partner" CTA persists the new role to the backend via
// pickRoleThunk before navigating, otherwise RoleRoute would bounce the user
// straight back (see ProfilePage for the same pattern).

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import {
  loadCategories, selectCategories,
  loadWorks, selectWorksFor, selectWorkCounts,
} from '@/features/catalog/catalogSlice'
import { WORKS as FALLBACK_WORKS } from '@/constants/catalog'
import { selectProfile, pickRoleThunk } from '@/features/profile/profileSlice'
import { setMode, pushToast } from '@/features/app/appSlice'
import { fetchActiveJobThunk, selectActiveJob } from '@/features/jobs/jobsSlice'
import Loader from '@/components/Loader'
import { GridSkeleton } from '@/components/Skeleton'
import ActiveJobBanner from '@/components/ActiveJobBanner'
import LocationEditChip from '@/components/LocationEditChip'
import WorkDecisionView from '@/components/WorkDecisionView'

// Per-category visual treatment (icon-pill background + filled square color).
// Falls back to a neutral palette when the category isn't in the map.
const TILE_THEME = {
  Electrician:    { bg: '#FAEEDA', fg: '#BA7517' },
  Plumber:        { bg: '#E6F1FB', fg: '#378ADD' },
  Carpenter:      { bg: '#FAECE7', fg: '#D85A30' },
  'AC Repair':    { bg: '#EEEDFE', fg: '#534AB7' },
  Mechanic:       { bg: '#F1EFE8', fg: '#5F5E5A' },
  Painter:        { bg: '#FBEAF0', fg: '#D4537E' },
  Cleaning:       { bg: '#E1F5EE', fg: '#1D9E75' },
  'Pest Control': { bg: '#EAF3DE', fg: '#639922' },
  Tiling:         { bg: '#F1EFE8', fg: '#374151' },
  Welding:        { bg: '#F1EFE8', fg: '#1f2937' },
  Laundry:        { bg: '#E6F1FB', fg: '#0369a1' },
  'TV Repair':    { bg: '#EEEDFE', fg: '#7c3aed' },
  Cooking:        { bg: '#FCEBEB', fg: '#c2410c' },
  Gardening:      { bg: '#EAF3DE', fg: '#3B6D11' },
  Driver:         { bg: '#F1EFE8', fg: '#334155' },
  Security:       { bg: '#F1EFE8', fg: '#111827' },
}
const FALLBACK_THEME = { bg: '#F1EFE8', fg: '#5F5E5A' }
const themeFor = (name) => TILE_THEME[name] || FALLBACK_THEME

// Choose a column count that spreads `count` tiles into balanced rows for the
// current viewport — so the last row is never near-empty (the classic 6 + 1
// orphan). Step 1: how many rows the widest allowed grid would need. Step 2:
// shrink the columns to fill exactly those rows as evenly as possible.
//   e.g. 7 tiles, max 6 cols → 2 rows → 4 cols (4 + 3, not 6 + 1).
// `maxCols` mirrors the Tailwind breakpoints used elsewhere (2 / 3 / 4 / 6).
function useBalancedColumns (count) {
  const [maxCols, setMaxCols] = useState(6)
  useEffect(() => {
    const calc = () => {
      const w = window.innerWidth
      setMaxCols(w < 640 ? 2 : w < 768 ? 3 : w < 1024 ? 4 : 6)
    }
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [])
  if (!count) return maxCols
  // 1–3 tiles always sit on a single row (3 → 3 columns, never a 2 + 1 orphan),
  // even on narrow widths.
  if (count <= 3) return count
  const rows = Math.ceil(count / maxCols)
  return Math.max(1, Math.ceil(count / rows))
}

export default function HomeLandingPage () {
  const dispatch = useDispatch()
  const nav      = useNavigate()
  const cats     = useSelector(selectCategories)
  const profile  = useSelector(selectProfile)
  const activeJob = useSelector(selectActiveJob)

  const [switchingRole, setSwitchingRole] = useState(false)

  // Category drill-down opens in a popup (CategoryWorksModal). `openCat` is the
  // category whose works the popup shows (null = closed). Replaces navigating
  // to a separate works page.
  const [openCat, setOpenCat] = useState(null)
  const openWorks  = useSelector(selectWorksFor(openCat || ''))
  const workCounts = useSelector(selectWorkCounts)

  // Always re-fetch on mount so per-category online counts stay fresh —
  // caching with `if (!cats.length)` would leave stale state.
  useEffect(() => { dispatch(loadCategories()) }, [dispatch])
  // Active-job lookup so the home page can surface an "in progress" banner
  // when the customer has an ongoing job. Socket events keep it live; this
  // initial fetch covers cold loads / refresh.
  useEffect(() => { dispatch(fetchActiveJobThunk('user')) }, [dispatch])

  // Tapping a category opens its works in a popup (loaded lazily on open).
  // Picking a service then shows the booking decision inside that same popup
  // (no separate page) — see CategoryWorksModal.
  const openCategory = (name) => { dispatch(loadWorks(name)); setOpenCat(name) }

  // Become-a-partner: flip the DB role first, then nav. Without the DB flip
  // RoleRoute would block /partner with the old `user` role and redirect us
  // back here — same fix as the Profile page's switch button.
  const becomePartner = async () => {
    if (switchingRole) return
    setSwitchingRole(true)
    try {
      await dispatch(pickRoleThunk('partner')).unwrap()
      dispatch(setMode('partner'))
      nav('/partner', { replace: true })
    } catch (err) {
      dispatch(pushToast({ text: `Could not switch: ${err?.message || err}` }))
    } finally {
      setSwitchingRole(false)
    }
  }

  const cityTag     = (profile?.city || '').trim()
  const catCols     = useBalancedColumns(cats.length)
  // Personal, time-aware greeting for the hero's top row — balances the
  // location chip and makes the landing feel less like an empty brochure.
  const firstName   = (profile?.full_name || '').trim().split(/\s+/)[0] || ''
  const greeting    = (() => {
    const h = new Date().getHours()
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  })()
  const openCatMeta = cats.find((c) => c.name === openCat) || null
  // Works for the open category — server list when available, bundled catalog
  // as a fallback so the panel is never empty while the API is in flight.
  const workList = (openWorks && openWorks.length)
    ? openWorks
    : (openCat
        ? FALLBACK_WORKS.filter((w) => w.category === openCat).map((w) => ({ ...w, display_name: w.name }))
        : [])

  return (
    <div className="min-h-full bg-surface">
      {/* Wide container — fills the available canvas (the AppShell already
          owns the page chrome). Inner sections still have side gutters but
          stretch to the full content width on desktop. */}
      <div className="w-full max-w-[1400px] mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-5
                      space-y-4 md:space-y-5">

        {/* Active job — small floating pill pinned bottom-right (portaled to
             body). Collapsed by default; expands on hover to show full detail.
             Renders nothing when there's no in-progress job. */}
        <ActiveJobBanner job={activeJob} role="user" floating />

        {/* ── DISCOVERY ─────────────────────────────────────────
             Action-first, no search bar or marketing copy: a short greeting +
             location, then the category grid. Tapping a category opens its
             services in a popup. */}
        <section className="bg-card border border-border rounded-[12px] shadow-card
                            px-5 md:px-8 lg:px-10 py-5 md:py-6">
          {/* Greeting + location. Stacks on phones (chip full-width) so a long
              address can't crush the greeting; side-by-side from sm+. */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between
                          gap-3 mb-5 md:mb-6">
            <div className="min-w-0">
              <p className="font-display text-[17px] md:text-[20px] font-extrabold text-text truncate">
                {greeting}{firstName ? `, ${firstName}` : ''} 👋
              </p>
              <p className="text-[12px] md:text-[13px] text-muted mt-0.5">
                What do you need help with today?
              </p>
            </div>
            <LocationEditChip className="w-full sm:w-auto shrink-0" />
          </div>

          {/* Category grid — the primary action. Flex-wrap so the last,
              incomplete row centers (no empty trailing cell); each tile's width
              is pinned to the balanced column count. */}
          {cats.length === 0 ? (
            <GridSkeleton count={10} cols="grid-cols-2 sm:grid-cols-3 md:grid-cols-5" />
          ) : (
            <div className="grid gap-2"
                 style={{ gridTemplateColumns: `repeat(${catCols}, minmax(0, 1fr))` }}>
              {cats.map((c) => {
                const t = themeFor(c.name)
                return (
                  <button key={c.name} onClick={() => openCategory(c.name)}
                    className="bg-card border border-border rounded-[12px]
                               px-3 py-4 md:py-[18px] text-center
                               hover:border-accent transition focus:outline-none">
                    <div className="w-9 h-9 mx-auto mb-2.5 rounded-[10px]
                                    flex items-center justify-center"
                         style={{ background: t.bg }}>
                      <span className="text-[16px]" style={{ color: t.fg }}>
                        {c.icon || '🔧'}
                      </span>
                    </div>
                    <p className="text-[12px] font-bold text-text truncate">
                      {c.display_name || c.name}
                    </p>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        {/* Category → services popup (replaces navigating to a works page) */}
        <CategoryWorksModal
          open={!!openCat}
          catMeta={openCatMeta}
          works={workList}
          workCounts={workCounts}
          onClose={() => setOpenCat(null)}
        />

        {/* ── TWO PATHS + HOW IT WORKS ──────────────────────────
             Stacked on mobile; on lg+ the two-path cards sit beside the
             how-it-works panel so the fold stays packed instead of leaving
             half the screen empty. */}
        <section className="grid gap-2.5 lg:gap-4
                            grid-cols-1 lg:grid-cols-[1fr_1fr_minmax(280px,1.1fr)]">
          {/* For customers */}
          <div className="bg-card border border-border rounded-[12px] p-4 md:p-5
                          flex flex-col">
            <p className="text-[11px] tracking-[0.5px] font-bold uppercase text-muted mb-2">
              For customers
            </p>
            <p className="text-[15px] md:text-[16px] font-bold text-text leading-tight mb-1">
              Need something fixed?
            </p>
            <p className="text-[12px] text-muted leading-[1.5] mb-3 flex-1">
              Browse services and book a verified pro.
            </p>
            <button onClick={() => nav('/categories')}
              className="self-start inline-flex items-center gap-1.5 bg-accent text-white
                         text-[12px] font-bold px-4 py-2 rounded-[8px]
                         hover:brightness-90 transition">
              Find a service →
            </button>
          </div>

          {/* For service pros */}
          <div className="rounded-[12px] p-4 md:p-5 text-white flex flex-col"
               style={{ background: '#2C2C2A' }}>
            <p className="text-[11px] tracking-[0.5px] font-bold uppercase mb-2"
               style={{ color: '#F5C4B3' }}>
              For service pros
            </p>
            <p className="text-[15px] md:text-[16px] font-bold leading-tight mb-1">
              Grow your work.
            </p>
            <p className="text-[12px] leading-[1.5] mb-3 flex-1"
               style={{ color: 'rgba(255,255,255,0.65)' }}>
              Join early. No listing fees.
            </p>
            <button onClick={becomePartner} disabled={switchingRole}
              className="self-start inline-flex items-center gap-1.5 bg-white
                         text-[12px] font-bold px-4 py-2 rounded-[8px]
                         hover:bg-white/90 transition
                         disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ color: '#2C2C2A' }}>
              {switchingRole ? 'Switching…' : 'Become a partner →'}
            </button>
          </div>

          {/* How it works — one button into the full explainer page */}
          <div className="bg-card border border-border rounded-[12px] p-4 md:p-5 flex flex-col">
            <p className="text-[11px] tracking-[0.5px] font-bold uppercase text-muted mb-2">
              New here?
            </p>
            <p className="text-[15px] md:text-[16px] font-bold text-text leading-tight mb-1">
              How it works
            </p>
            <p className="text-[12px] text-muted leading-[1.5] mb-3 flex-1">
              See every step — booking, matching, firm pricing and a verified pro at your door.
            </p>
            <button onClick={() => nav('/how-it-works')}
              className="self-start inline-flex items-center gap-1.5 bg-surface border border-border
                         text-text text-[12px] font-bold px-4 py-2 rounded-[8px]
                         hover:border-accent hover:text-accent transition">
              See how it works →
            </button>
          </div>
        </section>

        {/* ── QUIET FOOTER ──────────────────────────────────── */}
        <footer className="flex flex-col sm:flex-row items-center justify-between
                           gap-2 px-1 pt-1 text-[11px] text-muted">
          <span>
            {cityTag
              ? `Currently serving ${cityTag}, Tamil Nadu`
              : 'Currently serving Tamil Nadu'}
          </span>
          <div className="flex gap-4">
            <button onClick={() => nav('/help')} className="hover:text-text transition">Help</button>
            <span className="opacity-60">Privacy</span>
            <button onClick={() => nav('/help')} className="hover:text-text transition">Contact</button>
          </div>
        </footer>

      </div>
    </div>
  )
}

// Popup that lists the services (works) under a tapped category. Bottom-sheet
// on phones, centered dialog on desktop — matches the app's other modals
// (backdrop click + Escape close, portal to body).
//
// The desktop popup WIDTH is driven by the service count: it sizes to exactly
// fit the balanced column count, so one or two services make a compact card
// instead of stretching a tile across a fixed 640px. Mobile/tablet stay a
// full-width bottom sheet.
const COL_PX = 168   // target tile width
const GAP_PX = 8     // gap-2
const PADX_PX = 20   // px-5
const MIN_POPUP_PX = 380  // floor so the header (icon + title + close) never cramps
const MAX_POPUP_PX = 760

function CategoryWorksModal ({ open, catMeta, works, workCounts, onClose }) {
  // Viewport width so we can size the popup on desktop. Only listens while open.
  const [vw, setVw] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1024))
  // Two-step flow: pick a service (null) → decide how to book it (WorkDecisionView).
  const [selectedWork, setSelectedWork] = useState(null)

  useEffect(() => {
    if (!open) return undefined
    const onResize = () => setVw(window.innerWidth)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (selectedWork) setSelectedWork(null)   // back to the service list
      else onClose?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose, selectedWork])

  // Reset to the service list whenever the popup closes or the category changes.
  useEffect(() => { setSelectedWork(null) }, [open, catMeta?.name])

  if (!open) return null

  const t = themeFor(catMeta?.name)
  const title    = catMeta?.display_name || catMeta?.name || 'Services'
  const decision = !!selectedWork

  // List mode: width balanced to the service count (capped by screen, never
  // below the header floor). Decision mode: a fixed, comfortable width for the
  // two option cards. Mobile/tablet stay a full-width bottom sheet either way.
  const isDesktop = vw >= 1024
  const loading   = works.length === 0
  const n         = loading ? 3 : works.length
  const capCols   = vw >= 1024 ? 5 : vw >= 768 ? 4 : vw >= 640 ? 3 : 2
  const rows      = Math.ceil(n / capCols)
  // 1–3 services always sit on a single row (3 → 3 columns, no 2 + 1 orphan).
  const cols      = n <= 3 ? n : Math.max(1, Math.ceil(n / rows))
  const fitWidth  = cols * COL_PX + (cols - 1) * GAP_PX + PADX_PX * 2
  const cardStyle = isDesktop
    ? { maxWidth: decision ? 640 : Math.min(MAX_POPUP_PX, Math.max(MIN_POPUP_PX, fitWidth)) }
    : undefined

  return createPortal(
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
         className="fixed inset-0 z-[9999] flex items-end lg:items-center justify-center p-0 lg:p-4
                    bg-[rgba(10,15,30,0.6)] backdrop-blur-[4px] animate-pgIn">
      <div style={cardStyle}
           className="bg-card w-full rounded-t-[24px] lg:rounded-[20px]
                      shadow-[0_20px_60px_rgba(0,0,0,0.25)] overflow-hidden
                      animate-slideUp lg:animate-none
                      max-h-[85vh] flex flex-col">

        {decision ? (
          /* Step 2 — decide how to book, in-popup (no navigation) */
          <div className="px-5 py-5 overflow-y-auto">
            <WorkDecisionView
              work={selectedWork}
              onBack={() => setSelectedWork(null)}
              onClose={onClose} />
          </div>
        ) : (
          <>
            {/* Step 1 header — category */}
            <div className="px-5 pt-5 pb-4 border-b border-border flex items-center gap-3">
              <div className="w-11 h-11 rounded-[14px] flex items-center justify-center shrink-0"
                   style={{ background: t.bg }}>
                <span className="text-[22px]" style={{ color: t.fg }}>{catMeta?.icon || '🔧'}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-display font-extrabold text-[16px] text-text truncate">{title}</div>
                <div className="text-[11px] text-muted">Pick a service to book</div>
              </div>
              <button onClick={onClose} aria-label="Close"
                className="w-8 h-8 rounded-full bg-surface border border-border text-muted text-[16px]
                           hover:text-text hover:border-muted transition shrink-0">✕</button>
            </div>

            {/* Step 1 body — services grid balanced to the popup width */}
            <div className="px-5 py-4 overflow-y-auto">
              {loading ? (
                <GridSkeleton count={8} cols="grid-cols-3" />
              ) : (
                <div className="flex flex-wrap justify-center gap-2">
                  {works.map((w) => {
                    const count = Number(workCounts[w.name] ?? w.online_count ?? 0)
                    return (
                      <button key={w.name} onClick={() => setSelectedWork(w.name)}
                        style={{ flex: `0 1 calc((100% - ${cols - 1} * 0.5rem) / ${cols})` }}
                        className="relative bg-surface border border-border rounded-[12px]
                                   px-3 py-3.5 text-center hover:border-accent hover:bg-card
                                   transition focus:outline-none">
                        {count > 0 && (
                          <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-1
                                           px-1.5 py-[1px] rounded-full text-[9px] font-bold
                                           bg-[#dcfce7] text-[#166534]">
                            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                            {count}
                          </span>
                        )}
                        <div className="text-[22px] mb-1">{w.icon || '🔧'}</div>
                        <p className="text-[12px] font-bold text-text truncate">
                          {w.display_name || w.name}
                        </p>
                        <p className={`text-[10px] mt-0.5 truncate
                                      ${count > 0 ? 'text-muted' : 'text-accent font-semibold'}`}>
                          {count > 0 ? `${count} online` : 'Schedule instead'}
                        </p>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
