// Saved-partner state (M21). Holds:
//   - `ids`:      Set-ish dict for O(1) star-state lookups on cards
//   - `saved`:    full partner rows (avatar + rating + distance) for the
//                 home "Saved" rail
//
// We keep a thin Redux slice rather than a per-component hook so the toggle
// state stays consistent between PartnersListPage / PartnerDetailPage /
// HomeLandingPage. Optimistic updates: we flip `ids` immediately on toggle
// and let the API call settle in the background.

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import * as api from '@/services/api'

export const loadFavouriteIds = createAsyncThunk('favourites/ids', async () => {
  const { ids } = await api.fetchFavouriteIds()
  return ids || []
})

export const loadFavourites = createAsyncThunk('favourites/list', async ({ lat, lng } = {}) => {
  const params = (lat != null && lng != null) ? { lat, lng } : {}
  const { partners } = await api.fetchFavourites(params)
  return partners || []
})

// Optimistic toggle — flips state first, calls the API, and reverts on error.
export const toggleFavourite = createAsyncThunk(
  'favourites/toggle',
  async ({ partner_id, currentlyFavourited }, { rejectWithValue }) => {
    try {
      if (currentlyFavourited) await api.removeFavourite(partner_id)
      else                     await api.addFavourite(partner_id)
      return { partner_id, favourited: !currentlyFavourited }
    } catch (err) {
      return rejectWithValue({ partner_id, currentlyFavourited })
    }
  },
)

const slice = createSlice({
  name: 'favourites',
  initialState: {
    ids:   {},     // { [partner_id]: true } — Set-ish for O(1) lookup
    saved: [],     // full partner cards for the home rail
    loaded: false,
  },
  reducers: {
    // Synchronous optimistic flip — used by the toggle thunk before the
    // API call lands so the star reacts immediately.
    _optimisticFlip: (s, { payload }) => {
      const id = payload?.partner_id
      const want = !!payload?.next
      if (!id) return
      if (want) s.ids[id] = true
      else      delete s.ids[id]
    },
  },
  extraReducers: (b) => {
    b.addCase(loadFavouriteIds.fulfilled, (s, { payload }) => {
       s.ids = Object.fromEntries(payload.map((id) => [id, true]))
       s.loaded = true
     })
     .addCase(loadFavourites.fulfilled, (s, { payload }) => {
       s.saved = payload
       // Keep `ids` in sync — covers the case where /favourites resolves
       // before /favourites/ids on cold load.
       payload.forEach((p) => { s.ids[p.user_id] = true })
     })
     .addCase(toggleFavourite.fulfilled, (s, { payload }) => {
       const { partner_id, favourited } = payload
       if (favourited) s.ids[partner_id] = true
       else            delete s.ids[partner_id]
       // Strip from the cached `saved` list on un-favourite so the home
       // rail updates without a refetch.
       if (!favourited) s.saved = s.saved.filter((p) => p.user_id !== partner_id)
     })
     .addCase(toggleFavourite.rejected, (s, { payload }) => {
       // Revert the optimistic flip.
       if (!payload?.partner_id) return
       if (payload.currentlyFavourited) s.ids[payload.partner_id] = true
       else                              delete s.ids[payload.partner_id]
     })
  },
})

export const { _optimisticFlip } = slice.actions
export const selectFavouriteIds   = (st) => st.favourites.ids
export const selectFavouriteList  = (st) => st.favourites.saved
export const selectFavouritesLoaded = (st) => st.favourites.loaded
export const isFavourite = (st, partnerId) => !!st.favourites.ids[partnerId]
export default slice.reducer
