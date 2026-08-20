// Partner-side state: own profile, dashboard summary, live incoming requests,
// wallet, activity log. Only loaded when user is in partner mode.

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import * as api from '@/services/api'

export const loadMyPartner = createAsyncThunk('partner/me', async () => {
  const { partner } = await api.fetchMyPartner()
  return partner
})

export const updateMyPartnerThunk = createAsyncThunk('partner/update', async (patch) => {
  const { partner } = await api.updateMyPartner(patch)
  return partner
})

export const toggleOnlineThunk = createAsyncThunk('partner/online', async (online) => {
  await api.setPartnerOnline(online)
  return online
})

export const loadDashboard = createAsyncThunk('partner/dashboard', async () => {
  return api.fetchDashboard()
})

export const loadLiveRequests = createAsyncThunk('partner/requests', async () => {
  const { requests } = await api.fetchLiveRequests()
  return requests
})

export const loadWallet = createAsyncThunk('partner/wallet', async () => {
  return api.fetchWallet()
})

const slice = createSlice({
  name: 'partner',
  initialState: {
    profile: null,
    online: false,
    summary: null,
    settings: null,
    incoming: [],
    wallet: null,
  },
  reducers: {
    receiveIncoming: (s, { payload }) => {
      if (s.incoming.some((r) => r.id === payload.id)) return
      // _receivedAt is the LOCAL wall-clock at the moment the request landed
      // in this client. The toast countdown anchors on this instead of the
      // server's expires_at so the timer is immune to clock skew between the
      // partner device and the server. Without this anchor a partner whose
      // clock is even a few seconds ahead would see the toast vanish before
      // the user-side timer reached zero.
      s.incoming = [{ ...payload, _receivedAt: Date.now() }, ...s.incoming]
    },
    resolveIncoming: (s, { payload }) => {
      s.incoming = s.incoming.filter((r) => r.id !== payload)
    },
    // Server-driven online flip (e.g. auto-pause when accepting a job).
    applyOnlineState: (s, { payload }) => {
      s.online = !!payload
      if (s.profile) s.profile.is_online = !!payload
      // Offline → drop any pending incoming requests so no toast lingers.
      if (!payload) s.incoming = []
    },
  },
  extraReducers: (b) => {
    b.addCase(loadMyPartner.fulfilled, (s, { payload }) => { s.profile = payload; s.online = !!payload?.is_online })
     .addCase(updateMyPartnerThunk.fulfilled, (s, { payload }) => { s.profile = payload })
     .addCase(toggleOnlineThunk.fulfilled, (s, { payload }) => { s.online = payload; if (s.profile) s.profile.is_online = payload; if (!payload) s.incoming = [] })
     .addCase(loadDashboard.fulfilled, (s, { payload }) => { s.summary = payload.summary; s.settings = payload.settings })
     .addCase(loadLiveRequests.fulfilled, (s, { payload }) => {
       // Preserve `_receivedAt` for requests we already had locally — otherwise
       // a routine refetch (page navigation, reconnect) would wipe the local
       // anchor and the toast would fall back to the clock-skew-vulnerable
       // expires_at formula, causing premature auto-decline. For genuinely
       // new entries (loaded from the API for the first time, e.g. on page
       // refresh while a request is mid-life), stamp `Date.now()` so the
       // partner gets a fresh, monotonic countdown driven entirely by their
       // own local clock.
       const prev = new Map(s.incoming.map((r) => [r.id, r._receivedAt]))
       s.incoming = (payload || []).map((r) => ({
         ...r,
         _receivedAt: prev.get(r.id) ?? Date.now(),
       }))
     })
     .addCase(loadWallet.fulfilled, (s, { payload }) => { s.wallet = payload })
  },
})

export const { receiveIncoming, resolveIncoming, applyOnlineState } = slice.actions
export const selectPartnerProfile = (s) => s.partner.profile
export const selectPartnerOnline  = (s) => s.partner.online
export const selectDashboard      = (s) => s.partner.summary
export const selectIncoming       = (s) => s.partner.incoming
export const selectWallet         = (s) => s.partner.wallet
export default slice.reducer
