// API / Socket endpoints — auto-resolved from the window's current host so
// the app works from any device: localhost, LAN IP, or through a tunnel.
//
// Resolution order:
//   1. Explicit env override: VITE_API_URL  / VITE_SOCKET_URL
//   2. Auto-derived: same hostname as the page, backend port (default 5000)
//   3. SSR / Node fallback: http://localhost:5000
//
// Backend port is configurable via VITE_API_PORT (defaults to 5000).

const API_PORT = import.meta.env.VITE_API_PORT || '5000'

function deriveHost () {
  if (typeof window === 'undefined' || !window.location?.hostname) {
    return `http://localhost:${API_PORT}`
  }
  const { protocol, hostname } = window.location
  // Always use http for LAN IPs; otherwise mirror the page's protocol.
  // (A phone hitting http://192.168.0.4:5173 should keep http for the API.)
  return `${protocol}//${hostname}:${API_PORT}`
}

const envBase   = import.meta.env.VITE_API_URL
const envSocket = import.meta.env.VITE_SOCKET_URL

export const BASE_URL   = envBase   || `${deriveHost()}/api/`
export const SOCKET_URL = envSocket || deriveHost()
// Origin of the API server, with no trailing slash. Used to resolve server-
// relative asset URLs returned by the upload controller (e.g. /uploads/...).
export const API_ORIGIN = BASE_URL.replace(/\/api\/?$/, '').replace(/\/$/, '')

// Resolve a server-relative URL (e.g. "/uploads/foo.jpg") into an absolute
// URL usable by <img src>. Pass-through for anything that already looks
// absolute (http://, https://, data:).
export function resolveAssetUrl (u) {
  if (!u) return null
  if (/^(https?:|data:)/i.test(u)) return u
  return `${API_ORIGIN}${u.startsWith('/') ? u : `/${u}`}`
}

export const ENDPOINTS = {
  AUTH: {
    SYNC:    'auth/sync',
    ME:      'auth/me',
    ROLE:    'auth/role',
    PROFILE: 'auth/profile',
    FINISH:  'auth/finish-onboarding',
  },
  CATEGORIES:    'categories',
  PARTNERS:      'partners',
  PARTNERS_ME:   'partners/me',
  PARTNER_ONLINE:'partners/online',
  PARTNER_DASH:  'partners/me/dashboard',
  REQUESTS:      'requests',
  JOBS:          'jobs',
  MESSAGES:      'messages',
  PAYMENTS:      'payments',
  WALLET:        'wallet',
  REVIEWS:       'reviews',
  SCHEDULE:      'schedule',
  NOTIFICATIONS: 'notifications',
  SETTINGS:      'settings',
  ACTIVITY:      'activity',
  LOCATION:      'location',
  SAFETY:        'safety',
  DISPUTES:      'disputes',
  TRUSTED_CONTACTS: 'trusted-contacts',
  FAVOURITES:       'favourites',
  SAVED_ADDRESSES:  'saved-addresses',
  UPLOADS:          'uploads',
  SUPPORT:          'support',
}
