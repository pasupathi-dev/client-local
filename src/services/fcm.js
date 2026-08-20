// FCM client integration.
//
//   initFcm()        — registers the service worker, asks for permission,
//                      gets the device token, sends it to the backend, and
//                      attaches a foreground onMessage handler.
//   teardownFcm()    — calls DELETE /devices/:token (used on logout).
//
// All operations are best-effort: if the browser doesn't support web push,
// the user denies permission, or the VAPID key isn't configured, we log a
// warning and exit cleanly. The rest of the app (in-app socket notifications)
// keeps working.

import { getToken, onMessage, deleteToken } from 'firebase/messaging'
import { messagingPromise } from './firebase'
import * as api from './api'

// VAPID web-push key from Firebase Console → Project Settings → Cloud Messaging
// → Web Push certificates. Surface a single env knob so it can rotate without
// a code change.
const VAPID_KEY = import.meta.env.VITE_FCM_VAPID_KEY || ''

// We hold the active token here so logout can deregister it.
let activeToken = null
let unsubscribeForeground = null
let initPromise = null

async function registerServiceWorker () {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.register('/firebase-messaging-sw.js')
  } catch (err) {
    console.warn('[fcm] service worker registration failed:', err.message)
    return null
  }
}

async function requestPermission () {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  try {
    const result = await Notification.requestPermission()
    return result === 'granted'
  } catch {
    return false
  }
}

// Foreground onMessage — when a push arrives while the tab is open, the OS
// won't show it. We hand the payload to a caller-supplied handler so the app
// can show an in-app toast (or fall through to nothing).
function attachForegroundListener (messaging, onMessageReceived) {
  unsubscribeForeground = onMessage(messaging, (payload) => {
    try { onMessageReceived?.(payload) }
    catch (err) { console.warn('[fcm] onMessage handler threw:', err.message) }
  })
}

export async function initFcm ({ onForeground } = {}) {
  // De-dupe concurrent init calls (e.g. App.jsx re-mounts in StrictMode).
  if (initPromise) return initPromise
  initPromise = (async () => {
    if (!VAPID_KEY) {
      console.warn('[fcm] VITE_FCM_VAPID_KEY missing — push disabled')
      return null
    }
    const messaging = await messagingPromise
    if (!messaging) {
      console.warn('[fcm] messaging not supported in this browser')
      return null
    }
    const granted = await requestPermission()
    if (!granted) {
      console.info('[fcm] notification permission denied or dismissed')
      return null
    }
    const swReg = await registerServiceWorker()
    if (!swReg) return null

    let token
    try {
      token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: swReg,
      })
    } catch (err) {
      console.warn('[fcm] getToken failed:', err.message)
      return null
    }
    if (!token) return null

    activeToken = token
    try {
      await api.registerDevice({
        token,
        platform: 'web',
        user_agent: navigator.userAgent,
      })
    } catch (err) {
      console.warn('[fcm] registerDevice failed:', err?.response?.data?.message || err.message)
    }

    attachForegroundListener(messaging, onForeground)
    return token
  })().catch((err) => {
    console.warn('[fcm] init failed:', err.message)
    return null
  })
  return initPromise
}

export async function teardownFcm () {
  // Detach foreground listener first
  try { unsubscribeForeground?.() } catch { /* ignore */ }
  unsubscribeForeground = null

  // Tell the server to drop the token, then revoke it locally so the next
  // user's init() gets a fresh one.
  if (activeToken) {
    try { await api.unregisterDevice(activeToken) }
    catch { /* ignore — server-side cleanup will catch it eventually */ }
    try {
      const messaging = await messagingPromise
      if (messaging) await deleteToken(messaging)
    } catch { /* ignore */ }
    activeToken = null
  }
  initPromise = null
}
