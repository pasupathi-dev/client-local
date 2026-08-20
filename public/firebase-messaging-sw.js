/* eslint-disable no-undef */
// FCM background message handler. Registered by services/fcm.js when push
// support is detected. Lives at the app origin root so browsers can claim
// it as the messaging worker.
//
// ⚠️  KEEP IN SYNC with `client/.env` (which feeds src/services/firebase.js).
// This file runs in a Service Worker context — no bundler, no env imports
// — so the Firebase config must be inlined here as plain JS.
// If you rotate Firebase keys, update BOTH:
//   1. client/.env             (VITE_FIREBASE_* vars)
//   2. this file               (the literal values below)

importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: 'AIzaSyDo5ua5yuh32vr6oQFEcOpjQzoAU7h8zjg',
  authDomain: 'pasupathi0757-10668.firebaseapp.com',
  projectId: 'pasupathi0757-10668',
  storageBucket: 'pasupathi0757-10668.firebasestorage.app',
  messagingSenderId: '1084561019428',
  appId: '1:1084561019428:web:1413f38fee562c24c3feb1',
})

const messaging = firebase.messaging()

// Background — Firebase normally renders the notification block automatically
// when the app sends a `notification` payload. We add a small custom handler
// so we can attach the `route` from `data` to the notification's click target.
messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || 'ServiceLink'
  const body  = payload?.notification?.body  || ''
  const data  = payload?.data || {}
  self.registration.showNotification(title, {
    body,
    icon:  '/logo.png',
    badge: '/favicon.svg',
    data,
    tag: data?.jobId || data?.requestId || 'sl-default',
  })
})

// Click → focus an existing tab if open, otherwise open a new one at the
// route the server attached.
self.addEventListener('notificationclick', (event) => {
  const route = event.notification?.data?.route || '/'
  event.notification.close()
  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of allClients) {
      try {
        const url = new URL(c.url)
        if (url.origin === self.location.origin) {
          await c.focus()
          if ('navigate' in c) await c.navigate(route)
          return
        }
      } catch { /* ignore */ }
    }
    if (self.clients.openWindow) await self.clients.openWindow(route)
  })())
})
