import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import axios from 'axios'
import { BASE_URL } from '@/constants/api'

const FALLBACK = {
  availableDays:       ['Mon-Sat', 'Mon-Sun', 'Mon-Fri', 'Weekends only'],
  availableHours:      ['8am-8pm', '6am-10pm', '9am-6pm', '24/7'],
  requestTimerSeconds: 600,
  // M30 — sensible default until /api/config returns the real weekly P50.
  responseTimeP50Seconds: 120,
  // Phase 2 — default starting quote (₹). Server reads from app_config.
  defaultBasePriceInr: 299,
  // Phase 3 — windows + matching parameters mirrored from app_config.
  defaultSearchRadiusKm:  10,
  maxUserRadiusKm:        50,
  autoMatchRadiusRings:   [10, 25, 50, 100],
  partnerSnoozeMin:       5,
  freeCancelWindowSec:    90,
  disputeWindowHours:     48,
  rescheduleLockHours:    4,
  accountDeleteGraceDays: 7,
  // Phase 4 — limits + ETA formula
  maxTrustedContacts: 5,
  maxSavedAddresses: 8,
  etaSpeedKmph:      20,
  etaBufferMin:      5,
  liveEtaSpeedKmph:  22,
  etaInsideAreaM:    200,
  categories:          [],
  works:               [],
}

export const loadConfig = createAsyncThunk('config/load', async (_, { rejectWithValue }) => {
  try {
    const { data } = await axios.get(`${BASE_URL}config`)
    return data.data
  } catch {
    return rejectWithValue('config load failed')
  }
})

export const loadAnnouncements = createAsyncThunk('config/announcements', async (_, { rejectWithValue }) => {
  try {
    const { data } = await axios.get(`${BASE_URL}config/announcements`)
    return data.data
  } catch {
    return rejectWithValue('announcements load failed')
  }
})

const slice = createSlice({
  name: 'config',
  initialState: {
    ...FALLBACK,
    announcements: [],
    loaded: false,
    error: null,
  },
  reducers: {},
  extraReducers: (b) => {
    b
      .addCase(loadConfig.fulfilled, (s, { payload }) => {
        s.availableDays       = payload.availableDays       || FALLBACK.availableDays
        s.availableHours      = payload.availableHours      || FALLBACK.availableHours
        s.requestTimerSeconds = payload.requestTimerSeconds || FALLBACK.requestTimerSeconds
        s.responseTimeP50Seconds = payload.responseTimeP50Seconds
          ?? FALLBACK.responseTimeP50Seconds
        s.defaultBasePriceInr = payload.defaultBasePriceInr
          ?? FALLBACK.defaultBasePriceInr
        // Phase 3 mirrors
        s.defaultSearchRadiusKm  = payload.defaultSearchRadiusKm  ?? FALLBACK.defaultSearchRadiusKm
        s.maxUserRadiusKm        = payload.maxUserRadiusKm        ?? FALLBACK.maxUserRadiusKm
        s.autoMatchRadiusRings   = Array.isArray(payload.autoMatchRadiusRings)
                                     ? payload.autoMatchRadiusRings
                                     : FALLBACK.autoMatchRadiusRings
        s.partnerSnoozeMin       = payload.partnerSnoozeMin       ?? FALLBACK.partnerSnoozeMin
        s.freeCancelWindowSec    = payload.freeCancelWindowSec    ?? FALLBACK.freeCancelWindowSec
        s.disputeWindowHours     = payload.disputeWindowHours     ?? FALLBACK.disputeWindowHours
        s.rescheduleLockHours    = payload.rescheduleLockHours    ?? FALLBACK.rescheduleLockHours
        s.accountDeleteGraceDays = payload.accountDeleteGraceDays ?? FALLBACK.accountDeleteGraceDays
        // Phase 4 mirrors
        s.maxTrustedContacts = payload.maxTrustedContacts ?? FALLBACK.maxTrustedContacts
        s.maxSavedAddresses  = payload.maxSavedAddresses  ?? FALLBACK.maxSavedAddresses
        s.etaSpeedKmph       = payload.etaSpeedKmph       ?? FALLBACK.etaSpeedKmph
        s.etaBufferMin       = payload.etaBufferMin       ?? FALLBACK.etaBufferMin
        s.liveEtaSpeedKmph   = payload.liveEtaSpeedKmph   ?? FALLBACK.liveEtaSpeedKmph
        s.etaInsideAreaM     = payload.etaInsideAreaM     ?? FALLBACK.etaInsideAreaM
        s.categories          = payload.categories          || []
        s.works               = payload.works               || []
        s.loaded = true
      })
      .addCase(loadConfig.rejected, (s, { payload }) => {
        s.error  = payload
        s.loaded = true
      })
      .addCase(loadAnnouncements.fulfilled, (s, { payload }) => {
        s.announcements = payload
      })
  },
})

export const selectConfig             = (s) => s.config
export const selectAvailableDays      = (s) => s.config.availableDays
export const selectAvailableHours     = (s) => s.config.availableHours
export const selectRequestTimerSeconds= (s) => s.config.requestTimerSeconds
export const selectResponseTimeP50Seconds = (s) => s.config.responseTimeP50Seconds
export const selectDefaultBasePriceInr = (s) => s.config.defaultBasePriceInr
// Phase 3 selectors
export const selectDefaultSearchRadiusKm  = (s) => s.config.defaultSearchRadiusKm
export const selectMaxUserRadiusKm        = (s) => s.config.maxUserRadiusKm
export const selectAutoMatchRadiusRings   = (s) => s.config.autoMatchRadiusRings
export const selectPartnerSnoozeMin       = (s) => s.config.partnerSnoozeMin
export const selectFreeCancelWindowSec    = (s) => s.config.freeCancelWindowSec
export const selectDisputeWindowHours     = (s) => s.config.disputeWindowHours
export const selectRescheduleLockHours    = (s) => s.config.rescheduleLockHours
export const selectAccountDeleteGraceDays = (s) => s.config.accountDeleteGraceDays
// Phase 4 selectors
export const selectMaxTrustedContacts = (s) => s.config.maxTrustedContacts
export const selectMaxSavedAddresses  = (s) => s.config.maxSavedAddresses
export const selectEtaSpeedKmph       = (s) => s.config.etaSpeedKmph
export const selectEtaBufferMin       = (s) => s.config.etaBufferMin
export const selectLiveEtaSpeedKmph   = (s) => s.config.liveEtaSpeedKmph
export const selectEtaInsideAreaM     = (s) => s.config.etaInsideAreaM
export const selectDynamicCategories  = (s) => s.config.categories
export const selectDynamicWorks       = (s) => s.config.works
export const selectAnnouncements      = (s) => s.config.announcements
export const selectConfigLoaded       = (s) => s.config.loaded

export default slice.reducer
