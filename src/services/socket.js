// Singleton Socket.IO client — lazily created, one connection per app.
// Usage (inside a component / hook):
//   import { getSocket, disconnectSocket } from '@/services/socket'
//   const sock = await getSocket({ role: 'user' })
//   sock.on('request:accepted', fn)

import { io } from 'socket.io-client'
import { SOCKET_URL } from '@/constants/api'
import { auth } from './firebase'

let sockPromise = null

export async function getSocket ({ role = 'user' } = {}) {
  if (sockPromise) return sockPromise
  sockPromise = (async () => {
    const current = auth.currentUser
    if (!current) throw new Error('not_authenticated')
    const token = await current.getIdToken()
    const s = io(SOCKET_URL, {
      auth: { token, role },
      transports: ['websocket'],
      autoConnect: true,
    })
    s.on('disconnect', () => { /* auto-reconnect handled by engine */ })
    return s
  })()
  return sockPromise
}

export function disconnectSocket () {
  if (!sockPromise) return
  sockPromise.then((s) => s.disconnect()).catch(() => {})
  sockPromise = null
}
