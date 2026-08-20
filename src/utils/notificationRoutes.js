// H54 — Client-side allowlist for notification deep-link routes.
//
// Every Notification.create() on the server stores a `route` string we
// navigate to on tap. A typo on the server (`/chat/123` → `/chat-x/123`)
// or a stale route (page moved) would otherwise dump the customer onto
// React Router's catch-all and redirect them to `/`, silently losing
// the deep link.
//
// We validate here using regex patterns lifted from <Routes> in App.jsx
// so a route that doesn't match a real page falls back to the
// notifications list — and we log it in dev so a regression is loud.

const PATTERNS = [
  // Shared
  /^\/chat\/[^/]+\/?$/,                  // /chat/:jobId
  /^\/notifications\/?$/,
  /^\/partner\/notifications\/?$/,
  /^\/settings\/?$/,
  /^\/partner\/settings\/?$/,
  /^\/help\/?$/,
  /^\/partner\/help\/?$/,

  // Customer
  /^\/\??$/,                              // home
  /^\/categories\/?$/,
  /^\/category\/[^/]+\/?$/,
  /^\/partners\/?$/,
  /^\/partners\/[^/]+\/?$/,
  /^\/schedule\/[^/]+\/?$/,
  /^\/scheduled\/?$/,
  /^\/waiting\/[^/]+\/?$/,
  /^\/pay\/[^/]+\/?$/,
  /^\/done\/[^/]+\/?$/,
  /^\/my-jobs\/?$/,
  /^\/my-jobs\/all\/?$/,
  /^\/my-jobs\/[^/]+\/?$/,
  /^\/my-disputes\/?$/,
  /^\/profile\/?$/,
  /^\/profile\/edit\/?$/,

  // Partner
  /^\/partner\/?$/,
  /^\/partner\/requests\/?$/,
  /^\/partner\/scheduled\/?$/,
  /^\/partner\/work\/?$/,
  /^\/partner\/wallet\/?$/,
  /^\/partner\/earnings\/?$/,
  /^\/partner\/transactions\/?$/,
  /^\/partner\/transactions\/[^/]+\/?$/,
  /^\/partner\/disputes\/?$/,
  /^\/partner\/bank\/?$/,
  /^\/partner\/profile\/?$/,
  /^\/partner\/profile\/edit\/?$/,
  /^\/partner\/reviews\/?$/,
]

export function isAllowedRoute (route) {
  if (typeof route !== 'string' || !route.startsWith('/')) return false
  // Strip query/hash so /chat/123?foo=1 still matches /chat/:jobId.
  const path = route.split(/[?#]/, 1)[0]
  return PATTERNS.some((re) => re.test(path))
}

// Returns the normalised route to navigate to, OR null if the route is
// either invalid, missing, or points at the portal (which the
// customer/partner apps don't render).
export function safeNotificationRoute (route) {
  if (typeof route !== 'string' || !route.startsWith('/')) return null
  // Portal routes are admin-only; never navigate the customer/partner
  // app to them.
  if (/^\/portal\b/.test(route)) return null
  if (!isAllowedRoute(route)) {
    if (typeof window !== 'undefined' && window?.console && import.meta?.env?.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[notif] dropped unknown route:', route)
    }
    return null
  }
  return route
}
