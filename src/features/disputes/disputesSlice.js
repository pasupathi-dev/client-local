// Tiny slice that owns just the open-dispute count for the current user.
// Drives the badge in the app shell nav. We don't store the full list here
// — MyDisputesPage fetches that itself. Keeping the slice minimal lets us
// refresh the count from anywhere without re-rendering the whole list.

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import * as api from '@/services/api'

export const loadOpenDisputeCount = createAsyncThunk(
  'disputes/loadOpenCount',
  async (_, { rejectWithValue }) => {
    try {
      const { disputes } = await api.fetchMyDisputes()
      return (disputes || []).filter((d) => d.status === 'open').length
    } catch (err) {
      return rejectWithValue(err.message || 'failed')
    }
  },
)

const slice = createSlice({
  name: 'disputes',
  initialState: { openCount: 0, loaded: false },
  reducers: {
    bumpOpenCount: (s, { payload }) => { s.openCount = Math.max(0, s.openCount + (payload || 1)) },
    resetOpenCount: (s) => { s.openCount = 0 },
  },
  extraReducers: (b) => {
    b.addCase(loadOpenDisputeCount.fulfilled, (s, { payload }) => {
      s.openCount = Number(payload) || 0
      s.loaded    = true
    })
    b.addCase(loadOpenDisputeCount.rejected, (s) => { s.loaded = true })
  },
})

export const { bumpOpenCount, resetOpenCount } = slice.actions
export const selectOpenDisputeCount = (s) => s.disputes?.openCount || 0
export default slice.reducer
