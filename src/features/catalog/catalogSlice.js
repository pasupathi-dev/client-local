import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import * as api from '@/services/api'

export const loadCategories = createAsyncThunk('catalog/load', async () => {
  const { categories, online_counts } = await api.fetchCategories()
  return { categories, counts: online_counts || {} }
})

// Works under one parent category (taxonomy v2 two-step drill-down).
export const loadWorks = createAsyncThunk('catalog/works', async (category) => {
  const { works, online_counts } = await api.fetchWorks(category)
  return { category, works: works || [], counts: online_counts || {} }
})

// First page (or filter/sort change) — replaces the list.
export const loadPartners = createAsyncThunk('catalog/partners', async (params = {}) => {
  const { partners, total, limit, offset } = await api.fetchPartners({ offset: 0, ...params })
  return { partners, total, limit, offset }
})

// Next page — appends to the existing list.
export const loadMorePartners = createAsyncThunk('catalog/partnersMore', async (params = {}) => {
  const { partners, total, limit, offset } = await api.fetchPartners(params)
  return { partners, total, limit, offset }
})

export const loadPartnerDetail = createAsyncThunk('catalog/partner', async ({ id, lat, lng } = {}) => {
  const params = (lat != null && lng != null) ? { lat, lng } : undefined
  const res = await api.fetchPartner(id, params)
  return res
})

// Loads a single page of reviews for a partner. Replaces (not appends to)
// state.detail.reviews so the pager swaps the visible page on each click.
export const loadPartnerReviewsPage = createAsyncThunk(
  'catalog/partnerReviewsPage',
  async ({ id, offset, limit }) => {
    const { reviews, total, offset: o, limit: l } = await api.fetchPartnerReviews(
      id, { offset, limit },
    )
    return { reviews, total, offset: o, limit: l }
  },
)

const slice = createSlice({
  name: 'catalog',
  initialState: {
    categories: [],
    categoryCounts: {},          // { [categoryName]: number-online } — real-time (parent rollup)
    worksByCategory: {},         // { [categoryName]: Work[] }
    workCounts: {},              // { [workName]: number-online } — real-time
    partners:   [],
    partnersTotal:  0,
    partnersOffset: 0,
    partnersLimit:  10,
    detail:     null,
    loading:    false,
    partnersLoading:    false,
    partnersLoadingMore: false,
    reviewsLoading:     false,
  },
  reducers: {
    clearDetail: (s) => { s.detail = null },
    clearPartners: (s) => {
      s.partners = []; s.partnersTotal = 0; s.partnersOffset = 0
    },
    // Socket-driven: server recalculates online counts whenever a partner
    // toggles online/offline or auto-offlines on accept. We re-apply them to
    // both the counts map and the categories array so any consumer stays in
    // sync without refetching.
    applyCategoryCounts: (s, { payload }) => {
      const counts = payload?.counts || {}
      s.categoryCounts = counts
      s.categories = s.categories.map((c) => ({
        ...c, online_count: counts[c.name] || 0,
      }))
      // Per-work counts (taxonomy v2) — keep work badges + cached work lists live.
      if (payload?.workCounts) {
        const wc = payload.workCounts
        s.workCounts = wc
        for (const cat of Object.keys(s.worksByCategory)) {
          s.worksByCategory[cat] = s.worksByCategory[cat].map((w) => ({
            ...w, online_count: wc[w.name] || 0,
          }))
        }
      }
    },
  },
  extraReducers: (b) => {
    b.addCase(loadCategories.fulfilled, (s, { payload }) => {
       s.categories = payload.categories
       s.categoryCounts = payload.counts
     })
     .addCase(loadWorks.fulfilled, (s, { payload }) => {
       s.worksByCategory[payload.category] = payload.works
       s.workCounts = { ...s.workCounts, ...payload.counts }
     })
     .addCase(loadPartners.pending,    (s) => { s.partnersLoading = true; s.partnersError = null })
     .addCase(loadPartners.fulfilled,  (s, { payload }) => {
       s.partners       = payload.partners
       s.partnersTotal  = payload.total
       s.partnersOffset = payload.offset + payload.partners.length
       s.partnersLimit  = payload.limit
       s.partnersLoading = false
       s.partnersError  = null
     })
     .addCase(loadPartners.rejected,   (s, { error }) => {
       s.partnersLoading = false
       s.partnersError = error?.message || 'load_failed'
     })
     .addCase(loadMorePartners.pending,   (s) => { s.partnersLoadingMore = true })
     .addCase(loadMorePartners.fulfilled, (s, { payload }) => {
       // Append while deduping on user_id (belt-and-braces against races).
       const seen = new Set(s.partners.map((p) => p.user_id))
       s.partners.push(...payload.partners.filter((p) => !seen.has(p.user_id)))
       s.partnersTotal  = payload.total
       s.partnersOffset = payload.offset + payload.partners.length
       s.partnersLoadingMore = false
     })
     .addCase(loadMorePartners.rejected,  (s) => { s.partnersLoadingMore = false })
     .addCase(loadPartnerDetail.fulfilled, (s, { payload }) => { s.detail = payload })
     .addCase(loadPartnerReviewsPage.pending,   (s) => { s.reviewsLoading = true })
     .addCase(loadPartnerReviewsPage.fulfilled, (s, { payload }) => {
       s.reviewsLoading = false
       if (s.detail) {
         s.detail.reviews = payload.reviews
         s.detail.reviews_total = payload.total
         s.detail.reviews_limit = payload.limit
       }
     })
     .addCase(loadPartnerReviewsPage.rejected,  (s) => { s.reviewsLoading = false })
  },
})

export const { clearDetail, clearPartners, applyCategoryCounts } = slice.actions
export const selectCategories = (s) => s.catalog.categories
export const selectCategoryCounts = (s) => s.catalog.categoryCounts
export const selectWorkCounts = (s) => s.catalog.workCounts
export const selectWorksFor = (category) => (s) => s.catalog.worksByCategory[category] || []
export const selectPartners = (s) => s.catalog.partners
export const selectPartnersTotal  = (s) => s.catalog.partnersTotal
export const selectPartnersOffset = (s) => s.catalog.partnersOffset
export const selectPartnersLimit  = (s) => s.catalog.partnersLimit
export const selectPartnersLoading = (s) => s.catalog.partnersLoading
export const selectPartnersLoadingMore = (s) => s.catalog.partnersLoadingMore
export const selectPartnersError = (s) => s.catalog.partnersError
export const selectPartnerDetail = (s) => s.catalog.detail
export const selectReviewsLoading = (s) => s.catalog.reviewsLoading
export default slice.reducer
