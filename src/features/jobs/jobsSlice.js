import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import * as api from '@/services/api'

export const fetchActiveJobThunk = createAsyncThunk('jobs/active', async (as) => {
  const { job } = await api.fetchActiveJob(as)
  return job
})

export const fetchJobThunk = createAsyncThunk('jobs/detail', async (id) => {
  const { job } = await api.fetchJob(id)
  return job
})

export const createRequestThunk = createAsyncThunk('jobs/createRequest', async (payload) => {
  const { request } = await api.createRequest(payload)
  return request
})

// Server-driven "do I have a search in flight?" — the live request row is the
// source of truth, so this restores the searching state after a refresh and
// powers the global searching bar. Returns the request or null.
export const loadActiveSearch = createAsyncThunk('jobs/activeSearch', async () => {
  const { request } = await api.fetchActiveRequest()
  return request || null
})

// M35 — pass through optional eta_min so the partner's chip selection rides
// along with the accept call. Falsy etas are omitted server-side.
// Errors surface as a structured rejectWithValue so the caller can detect
// the 409 "no longer live" race (e.g. someone else accepted while the
// partner was choosing an ETA) and dismiss the toast gracefully instead
// of showing it as a hard failure.
export const acceptRequestThunk = createAsyncThunk(
  'jobs/acceptRequest',
  async (payload, { rejectWithValue }) => {
    const arg = typeof payload === 'string' ? { id: payload } : (payload || {})
    const { id, eta_min } = arg
    try {
      const { job } = await api.acceptRequest(id, eta_min ? { eta_min } : {})
      return job
    } catch (err) {
      return rejectWithValue({
        status:  err?.response?.status,
        message: err?.response?.data?.message || err?.message || 'Accept failed',
      })
    }
  },
)

// rejectWithValue so the caller can surface the server's message verbatim
// (e.g. C46 "Resolve the pending price proposal before completing").
export const setStateThunk = createAsyncThunk(
  'jobs/setState',
  async ({ id, to }, { rejectWithValue }) => {
    try {
      const { job } = await api.setJobState(id, to)
      return job
    } catch (err) {
      return rejectWithValue({
        status:  err?.response?.status,
        code:    err?.response?.data?.code,
        message: err?.response?.data?.message || err?.message || `Failed to ${to}`,
      })
    }
  },
)

// C46 — Carries an optional reason. The thunk no longer mutates agreed_price
// optimistically — the customer must approve via the chat bubble first.
export const proposePriceThunk = createAsyncThunk('jobs/price', async ({ id, agreed_price, reason }) => {
  const { job } = await api.proposeJobPrice(id, agreed_price, reason)
  return job
})

export const cancelJobThunk = createAsyncThunk(
  'jobs/cancel',
  async ({ id, reason, note, confirm_fee }, { rejectWithValue }) => {
    try {
      const r = await api.cancelJob(id, reason, note, { confirm_fee })
      return { id, reason, note, ...r }
    } catch (err) {
      // H27 — surface the fee-confirmation prompt as a typed rejection so
      // the caller can ask the user to confirm and retry.
      const body = err?.response?.data
      if (body?.code === 'fee_confirmation_required') {
        return rejectWithValue({
          code: 'fee_confirmation_required',
          fee_inr: body.fee_inr,
          message: body.message,
        })
      }
      return rejectWithValue({ message: err?.response?.data?.message || err?.message || 'Cancel failed' })
    }
  },
)

const slice = createSlice({
  name: 'jobs',
  initialState: {
    activeJob: null,
    currentRequest: null,
    loading: false,
  },
  reducers: {
    setActiveJob: (s, { payload }) => { s.activeJob = payload },
    applyJobPatch: (s, { payload }) => { if (s.activeJob) Object.assign(s.activeJob, payload) },
    clearActive: (s) => { s.activeJob = null; s.currentRequest = null },
    // The current in-flight search (a live request). Set when a request is
    // created/reassigned, cleared when it resolves. Drives the global bar.
    setCurrentRequest:   (s, { payload }) => { s.currentRequest = payload || null },
    clearCurrentRequest: (s) => { s.currentRequest = null },
  },
  extraReducers: (b) => {
    b.addCase(fetchActiveJobThunk.fulfilled, (s, { payload }) => { s.activeJob = payload })
     .addCase(fetchJobThunk.fulfilled,       (s, { payload }) => { s.activeJob = payload })
     .addCase(createRequestThunk.fulfilled,  (s, { payload }) => { s.currentRequest = payload })
     .addCase(loadActiveSearch.fulfilled,    (s, { payload }) => { s.currentRequest = payload })
     // Accepted → it's a job now, the search is over.
     .addCase(acceptRequestThunk.fulfilled,  (s, { payload }) => { s.activeJob = payload; s.currentRequest = null })
     .addCase(setStateThunk.fulfilled,       (s, { payload }) => { s.activeJob = payload })
     .addCase(proposePriceThunk.fulfilled,   (s, { payload }) => { s.activeJob = payload })
     .addCase(cancelJobThunk.fulfilled,      (s, { payload }) => {
       if (s.activeJob && s.activeJob.id === payload.id) {
         Object.assign(s.activeJob, {
           state: 'cancelled',
           cancel_reason: payload.reason || null,
           cancel_note:   payload.note   || null,
           cancelled_by:  payload.cancelled_by || 'user',
         })
       }
     })
  },
})

export const { setActiveJob, applyJobPatch, clearActive, setCurrentRequest, clearCurrentRequest } = slice.actions
export const selectActiveJob      = (s) => s.jobs.activeJob
export const selectCurrentRequest = (s) => s.jobs.currentRequest
export default slice.reducer
