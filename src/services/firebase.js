// src/services/firebase.js
// ─────────────────────────────────────────────
// Firebase app init. Import `auth` from here everywhere — never call
// initializeApp() twice.
//
// All config is read from Vite env vars so a different deployment can
// point at a different Firebase project without changing source. The
// keys here are public per Firebase's own guidance — `apiKey` is not a
// secret, it's a project identifier that the SDK uses to address the
// project. Security is enforced by Firebase Rules + Auth.
//
// Required vars (must be set at build time):
//   VITE_FIREBASE_API_KEY
//   VITE_FIREBASE_AUTH_DOMAIN
//   VITE_FIREBASE_PROJECT_ID
//   VITE_FIREBASE_STORAGE_BUCKET
//   VITE_FIREBASE_MESSAGING_SENDER_ID
//   VITE_FIREBASE_APP_ID
// Optional:
//   VITE_FIREBASE_MEASUREMENT_ID      (Analytics)
//   VITE_FCM_VAPID_KEY                (read from where messaging tokens are minted)
//
// If any of the required values are missing we log a loud warning and
// the app still tries to boot — sign-in will fail, which is the correct
// signal that the env was misconfigured.
// ─────────────────────────────────────────────

import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getMessaging, isSupported } from 'firebase/messaging'

const env = (k) => import.meta.env[k]

export const firebaseConfig = {
  apiKey:            env('VITE_FIREBASE_API_KEY'),
  authDomain:        env('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId:         env('VITE_FIREBASE_PROJECT_ID'),
  storageBucket:     env('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: env('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId:             env('VITE_FIREBASE_APP_ID'),
  measurementId:     env('VITE_FIREBASE_MEASUREMENT_ID'),
}

// Loud fail-fast warning so a missing env doesn't silently 401 every
// request later. We log all missing required keys at once so the dev
// can fix everything in one pass.
const REQUIRED = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
]
const missing = REQUIRED.filter((k) => !env(k))
if (missing.length) {
  // eslint-disable-next-line no-console
  console.error(
    '[firebase] Missing required env vars — sign-in WILL fail until you set:\n  '
    + missing.join('\n  ')
    + '\nSee client/.env.example for the full list.'
  )
}

const app             = initializeApp(firebaseConfig)
export const auth     = getAuth(app)
export const googleProvider = new GoogleAuthProvider()

// Messaging is gated behind feature detection — older browsers (and most iOS
// before 16.4) don't support web push. We expose a promise that resolves to
// the messaging instance or null so callers can opt in safely.
export const messagingPromise = (async () => {
  try {
    if (typeof window === 'undefined') return null
    if (!(await isSupported())) return null
    return getMessaging(app)
  } catch {
    return null
  }
})()
