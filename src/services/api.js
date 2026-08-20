// Thin wrappers over apiClient — one function per backend endpoint.
// Components & thunks import from here, never from apiClient directly.

import apiClient from './apiClient'
import { ENDPOINTS } from '@/constants/api'

const unwrap = (res) => res.data

// ── Auth / onboarding ──────────────────────────
export const syncUser        = (payload = {}) => apiClient.post(ENDPOINTS.AUTH.SYNC, payload).then(unwrap)
export const getMe           = () => apiClient.get(ENDPOINTS.AUTH.ME).then(unwrap)
export const pickRole        = (role) => apiClient.post(ENDPOINTS.AUTH.ROLE, { role }).then(unwrap)
export const saveProfile     = (patch) => apiClient.patch(ENDPOINTS.AUTH.PROFILE, patch).then(unwrap)
export const finishOnboarding = () => apiClient.post(ENDPOINTS.AUTH.FINISH).then(unwrap)

// ── Categories (parents) + Works (bookable leaf) ───
export const fetchCategories     = (params = {}) =>
  apiClient.get(ENDPOINTS.CATEGORIES, { params }).then(unwrap)
// Works under one parent category (the two-step drill-down).
export const fetchWorks          = (category, params = {}) =>
  apiClient.get(`${ENDPOINTS.CATEGORIES}/${encodeURIComponent(category)}/works`, { params }).then(unwrap)
// Search now returns WORK hits (each carries its parent category).
export const searchCategories    = (q, limit = 5) =>
  apiClient.get(`${ENDPOINTS.CATEGORIES}/search`, { params: { q, limit } }).then(unwrap)

// ── Partners ───────────────────────────────────
export const fetchPartners     = (params) => apiClient.get(ENDPOINTS.PARTNERS, { params }).then(unwrap)
export const fetchPartner      = (id, params) => apiClient.get(`${ENDPOINTS.PARTNERS}/${id}`, { params }).then(unwrap)
// Paginated reviews for the partner-detail page.
export const fetchPartnerReviews = (id, params = {}) =>
  apiClient.get(`${ENDPOINTS.PARTNERS}/${id}/reviews`, { params }).then(unwrap)
export const fetchMyPartner    = () => apiClient.get(ENDPOINTS.PARTNERS_ME).then(unwrap)
// M83 — Partner day-off blocks. Partner-side CRUD + customer-side read.
export const fetchMyBlockedDates  = () =>
  apiClient.get(`${ENDPOINTS.PARTNERS}/me/blocked-dates`).then(unwrap)
export const addBlockedDate       = (payload) =>
  apiClient.post(`${ENDPOINTS.PARTNERS}/me/blocked-dates`, payload).then(unwrap)
export const removeBlockedDate    = (id) =>
  apiClient.delete(`${ENDPOINTS.PARTNERS}/me/blocked-dates/${id}`).then(unwrap)
export const fetchPartnerBlockedDates = (partnerId) =>
  apiClient.get(`${ENDPOINTS.PARTNERS}/${partnerId}/blocked-dates`).then(unwrap)
// M68 — Report a partner. Customer-only.
export const flagPartner       = (id, payload) =>
  apiClient.post(`${ENDPOINTS.PARTNERS}/${id}/flag`, payload).then(unwrap)
export const fetchMyPartnerFlag = (id) =>
  apiClient.get(`${ENDPOINTS.PARTNERS}/${id}/flags/mine`).then(unwrap)
export const updateMyPartner   = (patch) => apiClient.patch(ENDPOINTS.PARTNERS_ME, patch).then(unwrap)
export const setPartnerOnline  = (online) => apiClient.post(ENDPOINTS.PARTNER_ONLINE, { online }).then(unwrap)
// setPartnerLocation can receive an optional address/city snapshot so the
// server doesn't have to reverse-geocode (which can leave the partner's
// `location_city` showing the OLD city if the geocoder fails or is slow).
export const setPartnerLocation = (lat, lng, opts = {}) =>
  apiClient.post(`${ENDPOINTS.PARTNERS}/location`, {
    lat, lng,
    address: opts.address,
    city:    opts.city,
  }).then(unwrap)
export const fetchDashboard    = () => apiClient.get(ENDPOINTS.PARTNER_DASH).then(unwrap)

// ── Requests ───────────────────────────────────
export const createRequest    = (payload) => apiClient.post(ENDPOINTS.REQUESTS, payload).then(unwrap)
// Auto-match: server picks the closest available partner and creates a
// direct request to them. Returns 404 if no match — caller should fall back
// to the browse flow on that case.
export const autoMatchRequest = (payload) => apiClient.post(`${ENDPOINTS.REQUESTS}/auto`, payload).then(unwrap)
export const fetchLiveRequests = () => apiClient.get(`${ENDPOINTS.REQUESTS}/live`).then(unwrap)
// Customer's current in-flight search (most recent live request) — drives the
// resume-on-refresh and the global "searching" bar. Server-truth, no storage.
export const fetchActiveRequest = () => apiClient.get(`${ENDPOINTS.REQUESTS}/active`).then(unwrap)
export const fetchRequest     = (id) => apiClient.get(`${ENDPOINTS.REQUESTS}/${id}`).then(unwrap)
// M35 — accept now carries an optional eta_min so the customer's active-job
// header can pin the partner's promised arrival time.
export const acceptRequest    = (id, payload = {}) =>
  apiClient.post(`${ENDPOINTS.REQUESTS}/${id}/accept`, payload).then(unwrap)
// H33 — partner-side decline now optionally carries a reason chip + note so
// admin gets a weekly breakdown and auto-fanout retries can use it.
export const declineRequest   = (id, payload = {}) =>
  apiClient.post(`${ENDPOINTS.REQUESTS}/${id}/decline`, payload).then(unwrap)
export const cancelRequest    = (id) => apiClient.post(`${ENDPOINTS.REQUESTS}/${id}/cancel`).then(unwrap)
// C23 — broadcast to nearby partners after the first one's silent for 60s.
export const fanoutRequest    = (id) => apiClient.post(`${ENDPOINTS.REQUESTS}/${id}/fanout`).then(unwrap)
// H34 — partner snoozes for 5 min: request stays live and goes to broadcast;
// the snoozer keeps the option to accept until someone else claims it.
export const snoozeRequest    = (id) => apiClient.post(`${ENDPOINTS.REQUESTS}/${id}/snooze`).then(unwrap)

// ── Jobs ───────────────────────────────────────
export const fetchActiveJob = (as) => apiClient.get(`${ENDPOINTS.JOBS}/active`, { params: { as } }).then(unwrap)
export const fetchMyJobs    = (as, params = {}) =>
  apiClient.get(`${ENDPOINTS.JOBS}/mine`, { params: { as, ...params } }).then(unwrap)
export const fetchJob       = (id) => apiClient.get(`${ENDPOINTS.JOBS}/${id}`).then(unwrap)
export const setJobState    = (id, to) => apiClient.post(`${ENDPOINTS.JOBS}/${id}/state`, { to }).then(unwrap)
// C46 — proposeJobPrice now creates a PROPOSAL (customer must approve).
// Reason is optional but recommended; the customer sees it in chat.
export const proposeJobPrice = (id, agreed_price, reason) =>
  apiClient.post(`${ENDPOINTS.JOBS}/${id}/price`, { agreed_price, reason }).then(unwrap)
export const respondPriceChange = (id, payload) =>
  apiClient.post(`${ENDPOINTS.JOBS}/${id}/price-change/respond`, payload).then(unwrap)
// H27 — accepts optional confirm_fee to acknowledge the ₹50 fee after the
// free-cancellation window. Without it the server replies with 409
// fee_confirmation_required and the client surfaces the warning.
export const cancelJob      = (id, reason, note, opts = {}) =>
  apiClient.post(`${ENDPOINTS.JOBS}/${id}/cancel`, { reason, note, confirm_fee: !!opts.confirm_fee })
    .then(unwrap)
// Partner pings their live coords during travelling/arrived. Server validates
// the caller is the partner on the job and the state allows streaming.
export const streamJobLocation = (id, payload) =>
  apiClient.post(`${ENDPOINTS.JOBS}/${id}/location`, payload).then(unwrap)
// Customer cold-start seed — last-known partner coords for a job. Used by
// the LivePartnerMap on mount and after a socket reconnect so the marker
// renders immediately instead of waiting for the next stream tick.
export const fetchJobLastLocation = (id) =>
  apiClient.get(`${ENDPOINTS.JOBS}/${id}/location`).then(unwrap)

// ── Messages ───────────────────────────────────
export const fetchMessages  = (jobId) => apiClient.get(`${ENDPOINTS.MESSAGES}/${jobId}`).then(unwrap)
export const sendMessage    = (jobId, body, attachment) => apiClient.post(`${ENDPOINTS.MESSAGES}/${jobId}`, { body, attachment }).then(unwrap)
export const editMessage    = (jobId, messageId, body) => apiClient.patch(`${ENDPOINTS.MESSAGES}/${jobId}/${messageId}`, { body }).then(unwrap)
export const deleteMessage  = (jobId, messageId) => apiClient.delete(`${ENDPOINTS.MESSAGES}/${jobId}/${messageId}`).then(unwrap)
export const markRead       = (jobId) => apiClient.post(`${ENDPOINTS.MESSAGES}/${jobId}/read`).then(unwrap)

// ── Payments (Razorpay two-step) ───────────────
// 1) create an order server-side → returns order_id + amount + key_id
// 2) open Razorpay Checkout with that data (see services/razorpay.js)
// 3) on success, post the Razorpay response back to /verify — the server
//    is the only thing that can actually mark the job paid.
// H48 — `tip` is optional; server clamps + ignores junk.
export const createPaymentOrder = (job_id, tip = 0) =>
  apiClient.post(`${ENDPOINTS.PAYMENTS}/create-order`, { job_id, tip }).then(unwrap)
// H47 — Server-side itemised quote (no Razorpay round-trip).
export const fetchJobBill   = (id, tip = 0) =>
  apiClient.get(`${ENDPOINTS.JOBS}/${id}/bill`, { params: { tip } }).then(unwrap)
export const setJobLineItems = (id, payload) =>
  apiClient.patch(`${ENDPOINTS.JOBS}/${id}/line-items`, payload).then(unwrap)
// M51 — Download the receipt PDF. Returns a blob URL the caller can
// either window.open() (preview) or trigger an <a download> on.
export const downloadJobReceipt = async (id) => {
  const res = await apiClient.get(`${ENDPOINTS.JOBS}/${id}/receipt`, {
    params: { dl: 1 },
    responseType: 'blob',
  })
  const blob = new Blob([res.data], { type: 'application/pdf' })
  return URL.createObjectURL(blob)
}
export const verifyPayment      = (payload) =>
  apiClient.post(`${ENDPOINTS.PAYMENTS}/verify`, payload).then(unwrap)
// Best-effort cancellation ping — fired when the customer dismisses the
// Razorpay sheet so the partner's payment popup flips out of "incoming".
export const cancelPayment      = (job_id) =>
  apiClient.post(`${ENDPOINTS.PAYMENTS}/cancelled`, { job_id }).then(unwrap).catch(() => null)
// M50 — Cash payment flow.
export const requestCashPayment = (job_id, tip = 0) =>
  apiClient.post(`${ENDPOINTS.PAYMENTS}/cash-request`, { job_id, tip }).then(unwrap)
export const confirmCashPayment = (job_id, accepted) =>
  apiClient.post(`${ENDPOINTS.PAYMENTS}/cash-confirm`, { job_id, accepted }).then(unwrap)

// ── Wallet ─────────────────────────────────────
export const fetchWallet       = () => apiClient.get(ENDPOINTS.WALLET).then(unwrap)
export const fetchTransactions = () => apiClient.get(`${ENDPOINTS.WALLET}/transactions`).then(unwrap)
export const fetchEarnings     = (params = {}) => apiClient.get(`${ENDPOINTS.WALLET}/earnings`, { params }).then(unwrap)
export const fetchWithdrawals  = () => apiClient.get(`${ENDPOINTS.WALLET}/withdrawals`).then(unwrap)
// Trust-gate breakdown for the "Withdrawal speed" panel on the partner Wallet.
export const fetchPayoutEligibility = () => apiClient.get(`${ENDPOINTS.WALLET}/payout-eligibility`).then(unwrap)
export const withdraw          = (amount) => apiClient.post(`${ENDPOINTS.WALLET}/withdraw`, { amount }).then(unwrap)
export const cancelWithdrawal  = (id) => apiClient.post(`${ENDPOINTS.WALLET}/withdraw/${id}/cancel`).then(unwrap)
export const getBank           = () => apiClient.get(`${ENDPOINTS.WALLET}/bank`).then(unwrap)
export const linkBank          = (payload) => apiClient.post(`${ENDPOINTS.WALLET}/bank`, payload).then(unwrap)
export const removeBank        = () => apiClient.delete(`${ENDPOINTS.WALLET}/bank`).then(unwrap)

// ── Reviews ────────────────────────────────────
export const createReview = (payload) => apiClient.post(ENDPOINTS.REVIEWS, payload).then(unwrap)
export const rateCustomer = (payload) => apiClient.post(`${ENDPOINTS.REVIEWS}/customer`, payload).then(unwrap)
// Partner reads own customer-rating for a job — drives the post-paid card.
export const fetchCustomerRating = (jobId) => apiClient.get(`${ENDPOINTS.REVIEWS}/customer/${jobId}`).then(unwrap)
// Drives the review-nag modal — returns { pending: jobRow | null }.
export const fetchPendingReview = () => apiClient.get(`${ENDPOINTS.REVIEWS}/pending`).then(unwrap)
export const skipReview         = (jobId) => apiClient.post(`${ENDPOINTS.REVIEWS}/skip`, { job_id: jobId }).then(unwrap)
// H60 — aspect chip aggregate for a partner. Returns { stats: { slug: { count, pct } }, total }.
export const fetchPartnerAspects = (partnerId) =>
  apiClient.get(`${ENDPOINTS.REVIEWS}/partner/${partnerId}/aspects`).then(unwrap)
// M61 — paginated reviews for a partner (role-neutral; partners use this
// for their own /partner/reviews infinite-scroll feed). Pass `{ limit,
// offset }` for paginated mode → server returns { reviews, total, limit,
// offset }. Omit both for the legacy flat-list response.
export const fetchReviewsForPartner = (partnerId, params = {}) =>
  apiClient.get(`${ENDPOINTS.REVIEWS}/partner/${partnerId}`, { params }).then(unwrap)
// M61 — partner posts a single public reply to one of their reviews.
export const replyToReview = (reviewId, reply) =>
  apiClient.post(`${ENDPOINTS.REVIEWS}/${reviewId}/reply`, { reply }).then(unwrap)
// M62 — customer attaches a private "what went wrong" follow-up to a ≤2★ review.
export const submitReviewSupport = (reviewId, note) =>
  apiClient.post(`${ENDPOINTS.REVIEWS}/${reviewId}/support`, { note }).then(unwrap)

// ── Schedule ───────────────────────────────────
export const createSchedule  = (payload) => apiClient.post(ENDPOINTS.SCHEDULE, payload).then(unwrap)
export const fetchSchedules  = (as) => apiClient.get(`${ENDPOINTS.SCHEDULE}/mine`, { params: { as } }).then(unwrap)
export const acceptSchedule  = (id) => apiClient.post(`${ENDPOINTS.SCHEDULE}/${id}/accept`).then(unwrap)
export const declineSchedule = (id, reason) => apiClient.post(`${ENDPOINTS.SCHEDULE}/${id}/decline`, { reason }).then(unwrap)
export const cancelSchedule  = (id, reason, note) => apiClient.post(`${ENDPOINTS.SCHEDULE}/${id}/cancel`, { reason, note }).then(unwrap)
export const startSchedule   = (id) => apiClient.post(`${ENDPOINTS.SCHEDULE}/${id}/start`).then(unwrap)
// M82 — reschedule flow
export const proposeReschedule = (id, payload) =>
  apiClient.post(`${ENDPOINTS.SCHEDULE}/${id}/reschedule`, payload).then(unwrap)
export const respondReschedule = (id, action) =>
  apiClient.post(`${ENDPOINTS.SCHEDULE}/${id}/reschedule/respond`, { action }).then(unwrap)

// ── Notifications ──────────────────────────────
// H53 — params can include { limit, offset, category } where category is
// one of 'jobs' | 'payments' | 'promos' (omit for "All").
export const fetchNotifications    = (params = {}) =>
  apiClient.get(ENDPOINTS.NOTIFICATIONS, { params }).then(unwrap)
export const markNotificationRead  = (id) => apiClient.post(`${ENDPOINTS.NOTIFICATIONS}/${id}/read`).then(unwrap)
export const markAllNotificationsRead = () => apiClient.post(`${ENDPOINTS.NOTIFICATIONS}/read-all`).then(unwrap)

// FCM device registration — called by services/fcm.js after we get a token.
export const registerDevice   = (payload) => apiClient.post(`${ENDPOINTS.NOTIFICATIONS}/devices`, payload).then(unwrap)
export const unregisterDevice = (token)   => apiClient.delete(`${ENDPOINTS.NOTIFICATIONS}/devices/${encodeURIComponent(token)}`).then(unwrap)

// ── Settings ───────────────────────────────────
export const fetchSettings  = () => apiClient.get(ENDPOINTS.SETTINGS).then(unwrap)
export const updateSettings = (patch) => apiClient.patch(ENDPOINTS.SETTINGS, patch).then(unwrap)

// ── Activity ───────────────────────────────────
export const fetchActivity = (params) => apiClient.get(ENDPOINTS.ACTIVITY, { params }).then(unwrap)

// ── Location ───────────────────────────────────
export const saveLocation     = (payload)   => apiClient.post(ENDPOINTS.LOCATION, payload).then(unwrap)
export const reverseGeocode   = (lat, lng)  => apiClient.post(`${ENDPOINTS.LOCATION}/reverse-geocode`, { lat, lng }).then(unwrap)
// Place search typeahead — used by the "Change location" picker on the
// customer + partner home. Returns up to 6 OpenStreetMap matches.
export const searchPlaces     = (q)         => apiClient.get(`${ENDPOINTS.LOCATION}/search`, { params: { q } }).then(unwrap)

// ── Safety ─────────────────────────────────────
export const safetySos       = (payload) => apiClient.post(`${ENDPOINTS.SAFETY}/sos`, payload).then(unwrap)
export const safetyShareTrip = (payload) => apiClient.post(`${ENDPOINTS.SAFETY}/share-trip`, payload).then(unwrap)
// H39 — Self-share track link. No SMS sent; the customer copies/shares it.
export const safetyTrackLink = (job_id)  => apiClient.post(`${ENDPOINTS.SAFETY}/track-link`, { job_id }).then(unwrap)
// Partner-side share-trip — same recipient page (/track/:token), different caller role.
export const safetyPartnerShare = (payload) => apiClient.post(`${ENDPOINTS.SAFETY}/partner-share`, payload).then(unwrap)
// Public — bearer token in the URL is the only auth.
export const publicTrack     = (token)   => apiClient.get(`${ENDPOINTS.SAFETY}/track/${encodeURIComponent(token)}`).then(unwrap)

// H65 — Send a "Report a bug" note from the Help page. Server creates an
// admin notification with the body + reporter identity.
export const reportBug = (payload) =>
  apiClient.post(`${ENDPOINTS.SUPPORT}/bug`, payload).then(unwrap)

// Images are uploaded to Cloudinary server-side. The client reads the file/blob
// into a base64 data URI and posts it as JSON; the server returns { url }.
export const blobToDataUri = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload  = () => resolve(r.result)
  r.onerror = () => reject(new Error('Could not read the image file'))
  r.readAsDataURL(blob)
})

// L78 — profile photo upload. `blob` is a square JPEG cropped client-side.
// Returns { url } which is the new avatar_url.
export const uploadAvatar = async (blob) => {
  const image = await blobToDataUri(blob)
  return apiClient.post(`${ENDPOINTS.UPLOADS}/avatar`, { image }).then(unwrap)
}
export const removeAvatar = () => apiClient.delete(`${ENDPOINTS.UPLOADS}/avatar`).then(unwrap)

// L79 — Delete account flow.
export const requestAccountDeletion = () =>
  apiClient.post(`${ENDPOINTS.AUTH.DELETE_REQUEST || 'auth/delete-request'}`).then(unwrap)
export const cancelAccountDeletion  = () =>
  apiClient.post(`${ENDPOINTS.AUTH.DELETE_CANCEL  || 'auth/delete-cancel'}`).then(unwrap)

// ── Disputes ───────────────────────────────────
export const createDispute   = (payload) => apiClient.post(ENDPOINTS.DISPUTES, payload).then(unwrap)
export const fetchMyDisputes = () => apiClient.get(`${ENDPOINTS.DISPUTES}/mine`).then(unwrap)
export const fetchJobDispute = (jobId) => apiClient.get(`${ENDPOINTS.DISPUTES}/by-job/${encodeURIComponent(jobId)}`).then(unwrap)
// M67 — self-serve resolutions
export const selfServeReschedule = (jobId, payload) =>
  apiClient.post(`${ENDPOINTS.JOBS}/${jobId}/self-serve/reschedule`, payload).then(unwrap)
export const selfServeRefund = (jobId, payload) =>
  apiClient.post(`${ENDPOINTS.JOBS}/${jobId}/self-serve/refund`, payload).then(unwrap)
export const selfServeNoShow = (jobId, payload) =>
  apiClient.post(`${ENDPOINTS.JOBS}/${jobId}/self-serve/no-show`, payload).then(unwrap)
// H64 — full dispute (with under_review_at / partner_response_at / resolved_at)
export const fetchDispute    = (id) => apiClient.get(`${ENDPOINTS.DISPUTES}/${id}`).then(unwrap)
// H64 — partner posts their side of a dispute
export const respondToDispute = (id, note) =>
  apiClient.post(`${ENDPOINTS.DISPUTES}/${id}/respond`, { note }).then(unwrap)

// ── Uploads (H25 — request photos) ─────────────────────────────────
// Returns the public (Cloudinary) URL the client embeds in the request
// payload's `photos` array.
export const uploadRequestPhoto = async (file) => {
  const image = await blobToDataUri(file)
  return apiClient.post(`${ENDPOINTS.UPLOADS}/request-photo`, { image }).then(unwrap)
}
// M43 — Partner uploads a before/after job photo.
export const uploadJobPhoto = async (file) => {
  const image = await blobToDataUri(file)
  return apiClient.post(`${ENDPOINTS.UPLOADS}/job-photo`, { image }).then(unwrap)
}
// M43 — Attach the uploaded photos to a job (after Working → Completed).
export const setJobCompletionPhotos = (id, photos) =>
  apiClient.patch(`${ENDPOINTS.JOBS}/${id}/completion-photos`, { photos }).then(unwrap)
// M44 — Partner proposes extra work; customer approves / declines.
export const proposeExtraWork  = (id, payload) =>
  apiClient.post(`${ENDPOINTS.JOBS}/${id}/extra-work`, payload).then(unwrap)
export const respondExtraWork  = (id, payload) =>
  apiClient.post(`${ENDPOINTS.JOBS}/${id}/extra-work/respond`, payload).then(unwrap)
export const listExtraWork     = (id) =>
  apiClient.get(`${ENDPOINTS.JOBS}/${id}/extra-work`).then(unwrap)

// ── Saved addresses (customer address book — H26) ──────────────────
export const fetchSavedAddresses  = () => apiClient.get(ENDPOINTS.SAVED_ADDRESSES).then(unwrap)
export const createSavedAddress   = (payload) =>
  apiClient.post(ENDPOINTS.SAVED_ADDRESSES, payload).then(unwrap)
export const updateSavedAddress   = (id, patch) =>
  apiClient.patch(`${ENDPOINTS.SAVED_ADDRESSES}/${id}`, patch).then(unwrap)
export const deleteSavedAddress   = (id) =>
  apiClient.delete(`${ENDPOINTS.SAVED_ADDRESSES}/${id}`).then(unwrap)

// ── Favourites (saved partners) ────────────────────────────────────
// M21 — customer-only API. Star/unstar a partner from any card or detail
// page; the home rail fetches via fetchFavourites so we don't re-N+1 on
// the partner profile endpoint.
export const fetchFavourites    = (params = {}) =>
  apiClient.get(ENDPOINTS.FAVOURITES, { params }).then(unwrap)
export const fetchFavouriteIds  = () => apiClient.get(`${ENDPOINTS.FAVOURITES}/ids`).then(unwrap)
export const addFavourite       = (partner_id) =>
  apiClient.post(ENDPOINTS.FAVOURITES, { partner_id }).then(unwrap)
export const removeFavourite    = (partner_id) =>
  apiClient.delete(`${ENDPOINTS.FAVOURITES}/${encodeURIComponent(partner_id)}`).then(unwrap)

// ── Trusted contacts (customer address book for share-trip) ────────
export const fetchTrustedContacts = () => apiClient.get(ENDPOINTS.TRUSTED_CONTACTS).then(unwrap)
export const createTrustedContact = (payload) => apiClient.post(ENDPOINTS.TRUSTED_CONTACTS, payload).then(unwrap)
export const updateTrustedContact = (id, patch) => apiClient.patch(`${ENDPOINTS.TRUSTED_CONTACTS}/${id}`, patch).then(unwrap)
export const removeTrustedContact = (id) => apiClient.delete(`${ENDPOINTS.TRUSTED_CONTACTS}/${id}`).then(unwrap)
