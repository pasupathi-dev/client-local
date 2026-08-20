// Backend-side profile (our DB row) — separate from Firebase `auth` state.
// Drives onboarding gate + role-aware UI.

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import * as api from '@/services/api'

export const hydrateProfile = createAsyncThunk('profile/hydrate', async (_, { rejectWithValue }) => {
  try {
    await api.syncUser()
    const { user } = await api.getMe()
    return user
  } catch (err) { return rejectWithValue(err.response?.data?.message || err.message) }
})

export const pickRoleThunk = createAsyncThunk('profile/pickRole', async (role) => {
  const { user } = await api.pickRole(role)
  return user
})

export const saveProfileThunk = createAsyncThunk('profile/save', async (patch) => {
  const { user } = await api.saveProfile(patch)
  return user
})

export const finishOnboardingThunk = createAsyncThunk('profile/finish', async () => {
  const { user } = await api.finishOnboarding()
  return user
})

const slice = createSlice({
  name: 'profile',
  initialState: { user: null, loading: false, error: null, hydrated: false },
  reducers: {
    clearProfile: (s) => { s.user = null; s.error = null; s.hydrated = false },
  },
  extraReducers: (b) => {
    const assign = (s, { payload }) => { s.user = payload; s.loading = false; s.error = null; s.hydrated = true }
    b.addCase(hydrateProfile.pending,    (s) => { s.loading = true; s.error = null })
     .addCase(hydrateProfile.fulfilled,  assign)
     .addCase(hydrateProfile.rejected,   (s, { payload }) => { s.loading = false; s.error = payload; s.hydrated = true })
     .addCase(pickRoleThunk.fulfilled,   assign)
     .addCase(saveProfileThunk.fulfilled,assign)
     .addCase(finishOnboardingThunk.fulfilled, assign)
  },
})

export const { clearProfile } = slice.actions
export const selectProfile = (s) => s.profile.user
export const selectProfileLoading = (s) => s.profile.loading
export const selectProfileError   = (s) => s.profile.error
export const selectProfileHydrated = (s) => s.profile.hydrated
export default slice.reducer
