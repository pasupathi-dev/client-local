// App-wide state: theme, current mode (user|partner), nav, toasts.
import { createSlice } from '@reduxjs/toolkit'

const applyTheme = (theme) => {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme
}

// Busy partner IDs survive a refresh via sessionStorage so the
// "took another job" redirect on PartnerDetailPage still works after F5.
// Tab close clears them — by then the partner is likely free anyway and
// the next /partners fetch reveals real state.
const BUSY_KEY = 'busy_partner_ids'
const readBusy = () => {
  try { const raw = sessionStorage.getItem(BUSY_KEY); return raw ? JSON.parse(raw) : [] }
  catch { return [] }
}
const persistBusy = (ids) => {
  try { sessionStorage.setItem(BUSY_KEY, JSON.stringify(ids)) } catch { /* ignore quota */ }
}

const initial = {
  theme: localStorage.getItem('theme') || 'light',
  mode:  localStorage.getItem('mode')  || 'user',   // user | partner
  toasts: [],
  busyPartnerIds: readBusy(),
}
applyTheme(initial.theme)

const slice = createSlice({
  name: 'app',
  initialState: initial,
  reducers: {
    setTheme: (s, { payload }) => {
      s.theme = payload
      localStorage.setItem('theme', payload)
      applyTheme(payload)
    },
    toggleTheme: (s) => {
      s.theme = s.theme === 'dark' ? 'light' : 'dark'
      localStorage.setItem('theme', s.theme)
      applyTheme(s.theme)
    },
    setMode: (s, { payload }) => {
      s.mode = payload
      localStorage.setItem('mode', payload)
    },
    pushToast: (s, { payload }) => {
      s.toasts = [{ id: Date.now() + Math.random(), ...payload }, ...s.toasts].slice(0, 3)
    },
    dismissToast: (s, { payload }) => {
      s.toasts = s.toasts.filter((t) => t.id !== payload)
    },
    markPartnerBusy: (s, { payload }) => {
      if (!payload) return
      if (!s.busyPartnerIds.includes(payload)) {
        s.busyPartnerIds.push(payload)
        persistBusy(s.busyPartnerIds)
      }
    },
    clearPartnerBusy: (s, { payload }) => {
      s.busyPartnerIds = s.busyPartnerIds.filter((id) => id !== payload)
      persistBusy(s.busyPartnerIds)
    },
  },
})

export const {
  setTheme, toggleTheme, setMode, pushToast, dismissToast,
  markPartnerBusy, clearPartnerBusy,
} = slice.actions
export const selectTheme  = (s) => s.app.theme
export const selectMode   = (s) => s.app.mode
export const selectToasts = (s) => s.app.toasts
export const selectBusyPartnerIds = (s) => s.app.busyPartnerIds
export const selectIsPartnerBusy = (partnerId) => (s) =>
  partnerId ? s.app.busyPartnerIds.includes(partnerId) : false
export default slice.reducer
