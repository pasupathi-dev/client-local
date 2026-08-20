// src/services/apiClient.js
// ─────────────────────────────────────────────
// Central Axios instance.
// All API calls go through this — never import
// axios directly anywhere else in the project.
//
// Handles:
//   ✅ Base URL
//   ✅ Auth token injected on every request
//   ✅ Global error handling (401, 403, 500…)
//   ✅ Request / response interceptors
//   ✅ Timeout
// ─────────────────────────────────────────────

import axios from 'axios'
import { BASE_URL } from '@/constants/api'
import { auth } from '@/services/firebase'

// Request timeout — overridable via VITE_API_TIMEOUT_MS for slow networks
// (e.g. raise to 30000 for tunnel / 3G testing). Default 10s covers normal LAN.
const TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS) || 10_000

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
})

// ── Request interceptor ───────────────────────
// Runs before every request.
// Reads token from localStorage and attaches it.
apiClient.interceptors.request.use(
  (config) => {
    // H90 — When an admin impersonation token is in play, send it as
    // "Authorization: Impersonate …". The server middleware recognises
    // that prefix, sets req.user.readOnly = true, and 403s any write.
    const impersonate = localStorage.getItem('impersonate_token')
    if (impersonate) {
      config.headers.Authorization = `Impersonate ${impersonate}`
      return config
    }

    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// ── Response interceptor: 401 recovery ──────────────────────────────
//
// Firebase ID tokens expire after 60 minutes. The SDK auto-refreshes
// them in the background via `onIdTokenChanged` (wired in App.jsx),
// but if a request fires the same second the cached token expires —
// or if the browser was just unsuspended and the silent refresh
// hasn't completed yet — we still get a 401 from the server with
// "Invalid or expired token".
//
// This interceptor catches that one specific case and:
//   1. Force-refreshes the ID token via getIdToken(true).
//   2. Retries the original request with the new token.
//   3. If that ALSO fails (or there's no Firebase user) we surface
//      the original 401 so the auth-state effect can sign the user
//      out cleanly.
//
// We deliberately don't auto-redirect to /login here — the server's
// own 401 from a genuinely revoked session is rare enough that the
// existing onAuthStateChanged → setUser(null) path already routes
// the user to the login page. This just stops the transient
// "session expired" flash for everyone whose token simply aged out.
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error?.config
    const status   = error?.response?.status

    // Only handle 401 once, and only when we actually have a Firebase
    // user we can refresh. Impersonation tokens are HMAC, not
    // refreshable — fall through if one is in play.
    const usingImpersonate = !!localStorage.getItem('impersonate_token')
    if (
      status === 401
      && !usingImpersonate
      && original
      && !original.__didRetry
      && auth?.currentUser
    ) {
      original.__didRetry = true
      try {
        const fresh = await auth.currentUser.getIdToken(true)
        localStorage.setItem('token', fresh)
        original.headers = original.headers || {}
        original.headers.Authorization = `Bearer ${fresh}`
        return apiClient.request(original)
      } catch {
        // Refresh failed — propagate the original 401.
      }
    }
    return Promise.reject(error)
  },
)

export default apiClient
