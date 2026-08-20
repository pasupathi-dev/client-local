import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import * as api from '@/services/api'

const PAGE_SIZE = 10
const VALID_CATS = ['jobs', 'payments', 'promos']

// H53 — load is now category-aware. Passing { category } resets the list
// to that category's first page. Missing/invalid category = "All".
export const loadNotifications = createAsyncThunk('notifications/load', async (arg = {}) => {
  const category = VALID_CATS.includes(arg.category) ? arg.category : null
  const params = { limit: PAGE_SIZE, offset: 0 }
  if (category) params.category = category
  const { notifications, total = 0, unread = 0, limit = PAGE_SIZE, offset = 0, nextBefore = null } =
    await api.fetchNotifications(params)
  return { notifications, total, unread, limit, offset, nextBefore, category }
})

// M57 — cursor-based "older". We send the oldest row's created_at as
// `before` so a new notification arriving mid-scroll doesn't cause a
// duplicate or a missed row (which offset-based pagination would).
// Falls back to offset if there's no cursor yet.
export const loadMoreNotifications = createAsyncThunk('notifications/loadMore', async (_, { getState }) => {
  const s = getState().notifications
  const params = { limit: PAGE_SIZE }
  if (s.category) params.category = s.category
  if (s.nextBefore) {
    params.before = s.nextBefore
  } else {
    params.offset = s.list.length
  }
  const { notifications, total = 0, unread = 0, limit = PAGE_SIZE, nextBefore = null } =
    await api.fetchNotifications(params)
  return { notifications, total, unread, limit, nextBefore, category: s.category }
})

export const markOneRead = createAsyncThunk('notifications/read', async (id) => {
  await api.markNotificationRead(id); return id
})

export const markAllRead = createAsyncThunk('notifications/readAll', async () => {
  await api.markAllNotificationsRead(); return true
})

const slice = createSlice({
  name: 'notifications',
  initialState: {
    list:    [],
    unread:  0,
    total:   0,
    category: null,   // null = "All"
    nextBefore: null, // M57 — cursor for the next "load more" page
    loading:     false,
    loadingMore: false,
    // H85 — tracks the most recent load failure so the page can render
    // <ListError onRetry/>. Cleared on every successful load.
    error: null,
  },
  reducers: {
    receive: (s, { payload }) => {
      // Only fold the incoming row into the visible list if it matches the
      // active category filter — otherwise the count still bumps but the
      // row stays hidden until the user switches tabs.
      const matches = !s.category || payload.category === s.category
      if (matches) {
        s.list = [payload, ...s.list].slice(0, 500)
        s.total += 1
      }
      s.unread += 1
    },
  },
  extraReducers: (b) => {
    b.addCase(loadNotifications.pending,   (s) => { s.loading = true; s.error = null })
     .addCase(loadNotifications.fulfilled, (s, { payload }) => {
       s.list = payload.notifications
       s.unread = payload.unread
       s.total = payload.total || payload.notifications.length
       s.category = payload.category
       s.nextBefore = payload.nextBefore || null
       s.loading = false
       s.error = null
     })
     .addCase(loadNotifications.rejected,  (s, { error }) => {
       s.loading = false
       s.error = error?.message || 'load_failed'
     })

     .addCase(loadMoreNotifications.pending,   (s) => { s.loadingMore = true })
     .addCase(loadMoreNotifications.fulfilled, (s, { payload }) => {
       // Ignore a stale loadMore that finishes after the user switched tabs.
       if (payload.category !== s.category) { s.loadingMore = false; return }
       // Dedupe by id — a realtime `receive` between pages could push an
       // item that's about to arrive in the next page.
       const seen = new Set(s.list.map((n) => n.id))
       s.list.push(...payload.notifications.filter((n) => !seen.has(n.id)))
       s.unread = payload.unread
       s.total = payload.total || s.total
       s.nextBefore = payload.nextBefore || null
       s.loadingMore = false
     })
     .addCase(loadMoreNotifications.rejected,  (s) => { s.loadingMore = false })

     .addCase(markOneRead.fulfilled, (s, { payload }) => {
       const row = s.list.find((n) => n.id === payload)
       if (row && !row.read) { row.read = true; s.unread = Math.max(0, s.unread - 1) }
     })
     .addCase(markAllRead.fulfilled, (s) => { s.list.forEach((n) => n.read = true); s.unread = 0 })
  },
})

export const { receive } = slice.actions
export const selectNotifications = (s) => s.notifications.list
export const selectUnread = (s) => s.notifications.unread
export const selectNotificationsTotal   = (s) => s.notifications.total
export const selectNotificationsLoading = (s) => s.notifications.loading
export const selectNotificationsLoadingMore = (s) => s.notifications.loadingMore
export const selectNotificationsCategory = (s) => s.notifications.category
export const selectNotificationsError = (s) => s.notifications.error
export default slice.reducer
