// H90 — Top banner shown when an admin is impersonating a user / partner.
//
// On boot (main.jsx), `consumeImpersonateParam()` reads `?impersonate=...`
// off the URL, stores the token in localStorage, and reloads cleanly so
// the new auth header is picked up on every request from this tab onward.
//
// When the token is present, this banner renders above everything, the
// app's API requests use it (apiClient.js), and the server's writeGuard
// rejects any non-GET attempt with 403 read_only_session.

import { useEffect, useState } from 'react'

const TOKEN_KEY = 'impersonate_token'
const NAME_KEY  = 'impersonate_name'

// Call once at boot — before React renders. Hangs on to the token across
// reloads so the banner survives navigation.
export function consumeImpersonateParam () {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  const token = url.searchParams.get('impersonate')
  const name  = url.searchParams.get('as')
  if (!token) return
  try {
    localStorage.setItem(TOKEN_KEY, token)
    if (name) localStorage.setItem(NAME_KEY, name)
  } catch { /* private mode */ }
  // Clean the URL so the token doesn't sit in history / shared screenshots.
  url.searchParams.delete('impersonate')
  url.searchParams.delete('as')
  window.history.replaceState({}, '', url.toString())
}

export function isImpersonating () {
  try { return !!localStorage.getItem(TOKEN_KEY) } catch { return false }
}

export function endImpersonation () {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(NAME_KEY)
  } catch { /* */ }
  // Drop back to the admin's login state. We don't try to restore the
  // admin's own session — that lives in the portal tab; this one just
  // closes.
  if (typeof window !== 'undefined') {
    window.close()
    // Fallback for browsers that block close() on non-script-opened tabs.
    setTimeout(() => { try { window.location.href = '/' } catch { /* */ } }, 200)
  }
}

export default function ImpersonationBanner () {
  const [active, setActive] = useState(isImpersonating())
  const [name, setName] = useState(() => {
    try { return localStorage.getItem(NAME_KEY) || '' } catch { return '' }
  })

  // Re-check on storage events so closing the tab in one window updates
  // peer windows that are open on the same browser profile.
  useEffect(() => {
    const onStorage = () => {
      setActive(isImpersonating())
      try { setName(localStorage.getItem(NAME_KEY) || '') } catch { /* */ }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  if (!active) return null

  return (
    <div className="fixed top-0 inset-x-0 z-[10001] bg-amber-500 text-white
                    text-[12.5px] font-bold py-2 px-3
                    flex items-center justify-center gap-3 shadow-md">
      <span aria-hidden>👁️</span>
      <span className="truncate">
        Viewing as {name || 'this user'} — read only
      </span>
      <button onClick={endImpersonation}
        className="ml-auto bg-white/20 hover:bg-white/30 text-white text-[11px]
                   font-bold px-2.5 py-1 rounded-full transition">
        Exit
      </button>
    </div>
  )
}
