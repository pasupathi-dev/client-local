// Location gate. Mounted globally inside <Shell> so it never shows on
// the login page. After login, if the session doesn't already have GPS
// coords saved, we open a non-dismissable modal asking the user to share
// location. Once granted, the existing locationSlice persists the fix
// into sessionStorage under `sl_location_v1`, so subsequent navigations
// within the same tab won't re-prompt.
//
// Status handling:
//   - granted        → modal closes (or never opens)
//   - idle           → modal opens with the "Allow location" CTA
//   - fetching       → modal stays open with a spinner
//   - denied         → modal explains how to re-enable + offers to
//                       continue without location (escape hatch so a
//                       browser that hard-blocks GPS isn't a dead end)
//   - unavailable    → same as denied (no GPS API in this browser)
//   - error          → retry CTA
//
// Gating:
//   - Only renders for authenticated users (the Shell already gates this)
//   - Skips render on /track/:token (public live-trip page) — that view
//     is opened by a non-logged-in trusted contact and doesn't need GPS.

import { useEffect } from 'react'
import { useSelector } from 'react-redux'
import { useLocation as useRouterLocation } from 'react-router-dom'
import { selectIsAuthenticated } from '@/features/auth/authSlice'
import { selectStatus, selectIsKnown } from '@/features/location/locationSlice'
import useLocation from '@/hooks/useLocation'
import Loader from '@/components/Loader'

// Routes where we deliberately suppress the gate. `/track` is a public
// share-link visitor with no Firebase auth, so they shouldn't see any of
// the in-app modals.
const SKIP_PATHS = ['/track', '/login', '/onboarding']
const shouldSkip = (pathname) => SKIP_PATHS.some((p) => pathname.startsWith(p))

export default function LocationGate () {
  const authed   = useSelector(selectIsAuthenticated)
  const status   = useSelector(selectStatus)
  const isKnown  = useSelector(selectIsKnown)
  const loc      = useLocation()
  const route    = useRouterLocation()

  // Auto-fire one request on first mount when status is still idle. Saves
  // the user the extra tap when their browser remembers a prior grant.
  useEffect(() => {
    if (!authed) return
    if (shouldSkip(route.pathname)) return
    if (status === 'idle' && !isKnown) {
      loc.request().catch(() => {})
    }
    // We deliberately only depend on `status` here; otherwise loc.request
    // would re-fire on every render (its reference is memoised but state
    // updates from the dispatch still trigger this effect).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, status])

  if (!authed) return null
  if (shouldSkip(route.pathname)) return null
  // Once we have ANY known coords on file (manual pick, prior GPS grant,
  // sessionStorage hydrate) we never re-open the gate. A refresh fired
  // from the in-app picker will run as a quiet background fetch instead
  // of blacking out the screen with this modal.
  if (isKnown) return null

  // ── Body content varies with status ─────────────────────────────────
  const body = (() => {
    if (status === 'fetching') {
      return {
        icon:  '📍',
        title: 'Finding you…',
        copy:  'Hold on while we read your current location.',
        primary: null,
        secondary: null,
      }
    }
    if (status === 'denied') {
      return {
        icon:  '🚫',
        title: 'Location is blocked',
        copy:  'We need your location to find nearby partners and route your job. Re-enable it from your browser settings, then tap Try again.',
        primary: { label: 'Try again', onClick: () => loc.request({ force: true }) },
        secondary: null,
      }
    }
    if (status === 'unavailable') {
      return {
        icon:  '⚠️',
        title: 'Location not available',
        copy:  'This browser doesn\'t support location, or the page is on an insecure connection. Open the app on a phone or use HTTPS.',
        primary: null,
        secondary: null,
      }
    }
    if (status === 'error') {
      return {
        icon:  '⚠️',
        title: 'Couldn\'t read your location',
        copy:  loc.error || 'Something went wrong while reading GPS. Try again.',
        primary: { label: 'Try again', onClick: () => loc.request({ force: true }) },
        secondary: null,
      }
    }
    // idle (rare — auto-fire above should bump us past this within ms)
    return {
      icon:  '📍',
      title: 'Share your location',
      copy:  'We use it to find nearby partners and route your job. You\'ll see a browser prompt — tap Allow.',
      primary: { label: 'Allow location', onClick: () => loc.request() },
      secondary: null,
    }
  })()

  return (
    <div className="fixed inset-0 z-[10002] bg-black/60 backdrop-blur-sm
                    flex items-center justify-center p-4 animate-fadeIn">
      <div className="w-full max-w-[400px] bg-card border border-border rounded-[16px]
                      shadow-[0_20px_60px_rgba(0,0,0,0.35)] overflow-hidden">
        <div className="h-1 bg-accent w-full" />
        <div className="p-6 text-center">
          <div className="text-[40px] mb-2">{body.icon}</div>
          <h2 className="font-display text-[17px] font-extrabold text-text m-0">
            {body.title}
          </h2>
          <p className="text-[12.5px] text-muted m-0 mt-2 leading-[1.55]">
            {body.copy}
          </p>

          {status === 'fetching' && (
            <div className="mt-4 flex justify-center">
              <Loader size={20} />
            </div>
          )}

          {body.primary && (
            <button
              onClick={body.primary.onClick}
              disabled={status === 'fetching'}
              className="w-full mt-5 py-2.5 rounded-[10px] bg-accent text-white
                         text-[13px] font-bold hover:brightness-90 transition
                         shadow-[0_4px_12px_rgba(232,65,26,0.3)]
                         disabled:opacity-60 disabled:cursor-not-allowed">
              {body.primary.label}
            </button>
          )}

          {/* No "skip" button on first ask — the gate is mandatory.
              When denied/unavailable/error, the helper text already
              explains how to recover. */}
        </div>
      </div>
    </div>
  )
}
