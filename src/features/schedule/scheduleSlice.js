import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import * as api from '@/services/api'

export const loadSchedules = createAsyncThunk('schedule/load', async (as = 'customer') => {
  const res = await api.fetchSchedules(as)
  return res?.scheduled || []
})

export const createScheduleThunk = createAsyncThunk('schedule/create', async (payload) => {
  const res = await api.createSchedule(payload)
  return res?.scheduled || null
})

export const acceptScheduleThunk = createAsyncThunk('schedule/accept', async (id) => {
  await api.acceptSchedule(id)
  return id
})

export const declineScheduleThunk = createAsyncThunk('schedule/decline', async ({ id, reason }) => {
  await api.declineSchedule(id, reason)
  return { id, reason }
})

export const cancelScheduleThunk = createAsyncThunk('schedule/cancel', async ({ id, reason, note }) => {
  await api.cancelSchedule(id, reason, note)
  return { id, reason, note }
})

export const startScheduleThunk = createAsyncThunk('schedule/start', async (id) => {
  const res = await api.startSchedule(id)
  return { id, job: res?.job || null }
})

const slice = createSlice({
  name: 'schedule',
  initialState: {
    list:        [],
    loading:     false,
    activeAlert: null,   // { id, type, service, scheduled_at, partner_name, customer_name, ... }
    startNow:    null,   // schedule:start-now payload — partner's "time to start" prompt
  },
  reducers: {
    receiveIncoming: (s, { payload }) => {
      if (!payload) return
      if (s.list.some((j) => j.id === payload.id)) return
      s.list = [payload, ...s.list]
    },
    patchStatus: (s, { payload }) => {
      const { id, status, ...extra } = payload || {}
      const i = s.list.findIndex((j) => j.id === id)
      if (i < 0) return
      s.list[i] = { ...s.list[i], status, ...extra }
    },
    // Realtime alert from cron (24h / 1h / 15m / now / overdue)
    receiveAlert: (s, { payload }) => {
      s.activeAlert = payload || null
    },
    dismissAlert: (s) => { s.activeAlert = null },
    // Partner's start-now prompt
    receiveStartNow: (s, { payload }) => { s.startNow = payload || null },
    dismissStartNow: (s) => { s.startNow = null },
  },
  extraReducers: (b) => {
    b.addCase(loadSchedules.pending,      (s) => { s.loading = true })
     .addCase(loadSchedules.fulfilled,    (s, { payload }) => { s.list = payload; s.loading = false })
     .addCase(loadSchedules.rejected,     (s) => { s.loading = false })
     .addCase(createScheduleThunk.fulfilled, (s, { payload }) => {
       if (payload) s.list = [payload, ...s.list]
     })
     .addCase(acceptScheduleThunk.fulfilled, (s, { payload: id }) => {
       const i = s.list.findIndex((j) => j.id === id)
       if (i >= 0) s.list[i] = { ...s.list[i], status: 'accepted' }
     })
     .addCase(declineScheduleThunk.fulfilled, (s, { payload }) => {
       const i = s.list.findIndex((j) => j.id === payload.id)
       if (i >= 0) s.list[i] = { ...s.list[i], status: 'declined', cancel_reason: payload.reason || null }
     })
     .addCase(cancelScheduleThunk.fulfilled, (s, { payload }) => {
       const i = s.list.findIndex((j) => j.id === payload.id)
       if (i >= 0) s.list[i] = { ...s.list[i], status: 'cancelled',
         cancel_reason: payload.reason || null, cancel_note: payload.note || null }
     })
     .addCase(startScheduleThunk.fulfilled, (s, { payload }) => {
       const i = s.list.findIndex((j) => j.id === payload.id)
       if (i >= 0) s.list[i] = { ...s.list[i], status: 'converted' }
       s.startNow = null
     })
  },
})

export const {
  receiveIncoming, patchStatus,
  receiveAlert, dismissAlert,
  receiveStartNow, dismissStartNow,
} = slice.actions

export const selectScheduleList         = (s) => s.schedule.list
export const selectScheduleLoading      = (s) => s.schedule.loading
export const selectActiveAlert          = (s) => s.schedule.activeAlert
export const selectStartNow             = (s) => s.schedule.startNow
export const selectPartnerPendingCount  = (s) =>
  s.schedule.list.filter((j) => j.status === 'pending').length
export default slice.reducer
