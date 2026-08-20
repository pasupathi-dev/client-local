import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { onAuthStateChanged, onIdTokenChanged } from 'firebase/auth'
import { auth } from '@/services/firebase'
import { setUser, selectIsAuthenticated, logoutUser } from '@/features/auth/authSlice'
import {
  hydrateProfile, selectProfile, selectProfileHydrated, selectProfileError,
} from '@/features/profile/profileSlice'
import { setMode, pushToast } from '@/features/app/appSlice'
import { loadConfig, selectEtaSpeedKmph, selectEtaBufferMin } from '@/features/config/configSlice'
import { setEtaConfig } from '@/utils/format'
import { receive as receiveNotification, loadNotifications } from '@/features/notifications/notificationsSlice'
import { loadOpenDisputeCount, bumpOpenCount, resetOpenCount } from '@/features/disputes/disputesSlice'
import { loadFavouriteIds } from '@/features/favourites/favouritesSlice'
import useRealtime from '@/hooks/useRealtime'
import { initFcm, teardownFcm } from '@/services/fcm'
import { ReviewNagProvider } from '@/features/reviewNag/ReviewNagContext'
import ReviewNagModal from '@/features/reviewNag/ReviewNagModal'

import AppShell                from '@/components/AppShell'
import SearchingBar            from '@/components/SearchingBar'
import IncomingRequestToast    from '@/components/IncomingRequestToast'
import ScheduleAlertToast      from '@/components/ScheduleAlertToast'
import ToastContainer          from '@/components/ToastContainer'
import PaymentIncomingOverlay  from '@/components/PaymentIncomingOverlay'
import TrustedContactPrompt    from '@/components/TrustedContactPrompt'
import ImpersonationBanner     from '@/components/ImpersonationBanner'
import LocationGate            from '@/components/LocationGate'
import ProtectedRoute          from '@/components/ProtectedRoute'
import RoleRoute               from '@/components/RoleRoute'
import Loader                  from '@/components/Loader'
import LoginPage        from '@/pages/LoginPage'
import RolePickPage     from '@/pages/onboarding/RolePickPage'
import BasicProfilePage from '@/pages/onboarding/BasicProfilePage'
import PartnerServicesPage from '@/pages/onboarding/PartnerServicesPage'
import ReviewPage          from '@/pages/onboarding/ReviewPage'
import SuccessPage         from '@/pages/onboarding/SuccessPage'

// MapHomePage is preserved for future use — re-add to the `/` route below if
// you want the Leaflet map back. Keep the import even when unused so the file
// is part of the dep graph and won't be tree-shaken away.
import MapHomePage        from '@/pages/user/MapHomePage'   // eslint-disable-line no-unused-vars
import HomeLandingPage    from '@/pages/user/HomeLandingPage'
import HowItWorksPage     from '@/pages/user/HowItWorksPage'
import CategoryDecisionPage from '@/pages/user/CategoryDecisionPage'
import WorksPage from '@/pages/user/WorksPage'
import PublicTrackPage    from '@/pages/PublicTrackPage'
import MyDisputesPage     from '@/pages/MyDisputesPage'
import AllCategoriesPage  from '@/pages/user/AllCategoriesPage'
import PartnersListPage   from '@/pages/user/PartnersListPage'
import PartnerDetailPage  from '@/pages/user/PartnerDetailPage'
import ScheduleJobPage    from '@/pages/user/ScheduleJobPage'
import UserScheduledPage  from '@/pages/user/UserScheduledPage'
import WaitingPage        from '@/pages/user/WaitingPage'
import PaymentPage        from '@/pages/user/PaymentPage'
import DonePage           from '@/pages/user/DonePage'
import MyJobsPage         from '@/pages/user/MyJobsPage'
import UserJobDetailPage  from '@/pages/user/UserJobDetailPage'
import UserAllJobsPage    from '@/pages/user/UserAllJobsPage'

import ChatPage          from '@/pages/ChatPage'
import NotificationsPage from '@/pages/NotificationsPage'
import ProfilePage       from '@/pages/ProfilePage'
import SettingsPage      from '@/pages/SettingsPage'
import HelpPage          from '@/pages/HelpPage'

import PartnerDashboardPage from '@/pages/partner/PartnerDashboardPage'
import PartnerReviewsPage   from '@/pages/partner/PartnerReviewsPage'
import PartnerRequestsPage  from '@/pages/partner/PartnerRequestsPage'
import PartnerScheduledPage from '@/pages/partner/PartnerScheduledPage'
import PartnerWorkPage      from '@/pages/partner/PartnerWorkPage'
import PartnerServicesEditPage from '@/pages/partner/PartnerServicesEditPage'
import PartnerWalletPage    from '@/pages/partner/PartnerWalletPage'
import PartnerTransactionsPage      from '@/pages/partner/PartnerTransactionsPage'
import PartnerTransactionDetailPage from '@/pages/partner/PartnerTransactionDetailPage'
import PartnerEarningsPage   from '@/pages/partner/PartnerEarningsPage'
import BankAccountPage      from '@/pages/partner/BankAccountPage'
import EditProfilePage      from '@/pages/EditProfilePage'

function Shell ({ children, showRequestToast = false }) {
  useRealtime()
  return (
    <>
      <AppShell>{children}</AppShell>
      {/* Customer-only: persistent "still searching" bar that survives nav +
          refresh and resumes the waiting screen on tap. */}
      <SearchingBar />
      {/* Only shown on the partner dashboard — not on every page */}
      {showRequestToast && <IncomingRequestToast />}
      <ScheduleAlertToast />
      <ToastContainer />
      {/* Partner-side payment popup — listens to socket events itself and
          only renders when one arrives, so it's safe to mount globally. */}
      <PaymentIncomingOverlay />
      {/* M76 — One-time prompt during the customer's first active job
          (renders null otherwise). Self-gates on role + active job. */}
      <TrustedContactPrompt />
      {/* H90 — admin impersonation top-strip + Exit button */}
      <ImpersonationBanner />
      {/* Mandatory location gate — only renders inside Shell, so the
          login + onboarding flows are unaffected. Once granted, the
          existing locationSlice caches into sessionStorage and this
          modal stays hidden for the rest of the session. */}
      <LocationGate />
    </>
  )
}

// Onboarding gate — assumes profile has been hydrated. (App.jsx blocks routes until then.)
// A brand-new account has `role='user'` (DB default) but no `full_name` yet, so we use
// `full_name` as the "has the user filled anything" signal. Role pick is ALWAYS first.
function OnboardingGate ({ children }) {
  const profile = useSelector(selectProfile)
  if (!profile) return <Navigate to="/onboarding/role" replace />

  // Brand-new account — no profile data saved yet. Start from role pick.
  if (!profile.full_name || !profile.address || !profile.pincode) {
    return <Navigate to="/onboarding/role" replace />
  }

  // Partner onboarding isn't finished → back to services step.
  if (profile.role === 'partner' && !profile.onboarding_done) {
    return <Navigate to="/onboarding/partner-services" replace />
  }

  // User never hit the review/finish step.
  if (!profile.onboarding_done) {
    return <Navigate to="/onboarding/review" replace />
  }

  return children
}

function FullPageSpinner ({ label = 'Loading…' }) {
  return <Loader fullScreen label={label} />
}

function BackendErrorScreen ({ error, onRetry, onSignOut }) {
  const is401 = /invalid or expired/i.test(error || '')
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-6">
      <div className="card p-6 max-w-md w-full">
        <div className="text-3xl mb-2">⚠️</div>
        <h1 className="font-display text-lg font-extrabold">Can't reach the backend</h1>
        <p className="text-sm text-muted mt-1">
          The server rejected the request: <span className="font-mono text-danger">{error || 'Unknown error'}</span>
        </p>

        {is401 && (
          <div className="mt-4 bg-surface rounded-lg p-3 text-xs text-muted leading-relaxed">
            <div className="font-bold text-text mb-1">This is almost always a missing Firebase Admin key.</div>
            <ol className="list-decimal pl-4 space-y-1">
              <li>Firebase Console → Project Settings → Service Accounts</li>
              <li>Click <b>Generate new private key</b></li>
              <li>Save the JSON as <code className="bg-card px-1 py-0.5 rounded">server/firebase-service-account.json</code></li>
              <li>Restart the server, then click Retry below</li>
            </ol>
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <button onClick={onSignOut} className="btn-secondary flex-1">Sign out</button>
          <button onClick={onRetry}   className="btn-primary flex-[2]">Retry</button>
        </div>
      </div>
    </div>
  )
}

export default function App () {
  const dispatch         = useDispatch()
  const isAuthenticated  = useSelector(selectIsAuthenticated)
  const profile          = useSelector(selectProfile)
  const profileHydrated  = useSelector(selectProfileHydrated)
  const profileError     = useSelector(selectProfileError)
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    // Finish any redirect-based sign-in first (Google on mobile).
    // It's a no-op if the user didn't come back from a redirect.
    import('@/services/authService').then(({ default: authService }) => {
      authService.consumeRedirect().catch(() => {})
    })

    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        const token = await fbUser.getIdToken()
        localStorage.setItem('token', token)
        localStorage.setItem('uid', fbUser.uid)
        dispatch(setUser({
          uid: fbUser.uid, email: fbUser.email,
          name: { firstname: fbUser.displayName?.split(' ')[0] ?? 'User', lastname: fbUser.displayName?.split(' ')[1] ?? '' },
          photo: fbUser.photoURL ?? null,
        }))
        dispatch(hydrateProfile())   // don't await — UI reacts via hydrated flag
        // Pre-load the open-dispute count so the nav badge is correct on
        // first paint. Best-effort; the slice handles failure quietly.
        dispatch(loadOpenDisputeCount())
        // M21 — fetch saved-partner IDs is moved to a profile-role gated
        // effect below — the endpoint is customer-only, so firing it here
        // (before we know the role) 403s for partners. See line ~234.

        // FCM — register the device token with the backend so push works
        // even when the app is backgrounded. Best-effort; silently no-ops if
        // the browser doesn't support push or the user denies permission.
        initFcm({
          onForeground: (payload) => {
            // App is in the foreground when this fires. Show a toast so the
            // user sees something, and re-pull the notifications list so the
            // bell badge updates.
            const n = payload?.notification || {}
            dispatch(pushToast({ text: n.title || 'New notification', sub: n.body || '' }))
            dispatch(loadNotifications())
            // If the server included a server-shaped notification row in
            // `data`, mirror it into Redux so the bell list updates without
            // a refetch round-trip. Otherwise the loadNotifications above
            // will catch up shortly.
            const data = payload?.data || {}
            if (data.serverNotification) {
              try { dispatch(receiveNotification(JSON.parse(data.serverNotification))) }
              catch { /* ignore */ }
            }
            // Dispute lifecycle pushes — keep the nav badge fresh without
            // refetching the full list. Refund/warn/dismiss/resolved → the
            // count drops; opened → the count goes up.
            const t = data?.type || ''
            if (t === 'dispute:opened') {
              dispatch(bumpOpenCount(1))
            } else if (t === 'dispute:refund' || t === 'dispute:warn_partner'
                    || t === 'dispute:dismiss' || t === 'dispute:resolved') {
              // Cheaper than refetching; the count can't go negative.
              dispatch(bumpOpenCount(-1))
            }
          },
        }).catch(() => {})
      } else {
        // Tear down FCM before dropping the auth tokens so the unregister
        // call still has the bearer header.
        await teardownFcm().catch(() => {})
        localStorage.removeItem('token'); localStorage.removeItem('uid')
        dispatch(setUser(null))
        dispatch(resetOpenCount())
      }
      setAuthChecked(true)
    })
    return () => unsub()
  }, [dispatch])

  // Keep the Bearer token in localStorage fresh.
  // Firebase ID tokens expire after 1 hour. The SDK refreshes them in
  // the background automatically — `onIdTokenChanged` fires every time
  // a new token is minted (initial sign-in, ~55-minute refresh cycle,
  // and any forced refresh via getIdToken(true)). We mirror that into
  // localStorage so the next API call carries a valid Bearer header
  // instead of getting a 401 "Invalid or expired token".
  useEffect(() => {
    const unsubToken = onIdTokenChanged(auth, async (fbUser) => {
      if (!fbUser) return
      try {
        const token = await fbUser.getIdToken()
        localStorage.setItem('token', token)
      } catch { /* SDK will retry on next call */ }
    })
    return () => unsubToken()
  }, [])

  // Load dynamic config (categories, enums) from server on boot
  useEffect(() => { dispatch(loadConfig()) }, [dispatch])

  // Mirror ETA formula into the pure formatter module whenever config changes.
  // formatEta is called from many non-React places, so a setter is cleaner
  // than threading the speed/buffer through every call site.
  const etaSpeed  = useSelector(selectEtaSpeedKmph)
  const etaBuffer = useSelector(selectEtaBufferMin)
  useEffect(() => {
    setEtaConfig({ speedKmph: etaSpeed, bufferMin: etaBuffer })
  }, [etaSpeed, etaBuffer])

  // Keep nav mode in sync with backend role
  useEffect(() => {
    if (profile?.role) dispatch(setMode(profile.role === 'partner' ? 'partner' : 'user'))
  }, [profile?.role, dispatch])

  // M21 — customer-only saved-partner ID hydration. Gated on the resolved
  // profile role so a partner session doesn't hit /api/favourites/ids and
  // catch a noisy 403 in the console.
  useEffect(() => {
    if (profile?.role && profile.role !== 'partner') {
      dispatch(loadFavouriteIds()).catch(() => {})
    }
  }, [profile?.role, dispatch])

  if (!authChecked) return <FullPageSpinner label="Checking session…" />

  // Logged in → wait for profile hydration (or show error)
  if (isAuthenticated) {
    if (!profileHydrated) return <FullPageSpinner label="Syncing profile…" />
    if (profileError && !profile) {
      return (
        <BackendErrorScreen
          error={profileError}
          onRetry={() => dispatch(hydrateProfile())}
          onSignOut={() => dispatch(logoutUser())}
        />
      )
    }
  }

  return (
    <ReviewNagProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />} />

        {/* Public live-trip tracking — no auth, opened from an SMS link */}
        <Route path="/track/:token" element={<PublicTrackPage />} />

        {/* Onboarding */}
        <Route path="/onboarding/role"              element={<ProtectedRoute><RolePickPage /></ProtectedRoute>} />
        <Route path="/onboarding/profile"           element={<ProtectedRoute><BasicProfilePage /></ProtectedRoute>} />
        <Route path="/onboarding/partner-services"  element={<ProtectedRoute><PartnerServicesPage /></ProtectedRoute>} />
        <Route path="/onboarding/review"            element={<ProtectedRoute><ReviewPage /></ProtectedRoute>} />
        <Route path="/onboarding/success"           element={<ProtectedRoute><SuccessPage /></ProtectedRoute>} />

        {/* Shared */}
        <Route path="/chat/:jobId"    element={<ProtectedRoute><Shell><ChatPage /></Shell></ProtectedRoute>} />
        <Route path="/notifications"  element={<ProtectedRoute><Shell><NotificationsPage /></Shell></ProtectedRoute>} />
        {/* Partner-scoped alias so the bottom nav / topnav can deep-link
            without leaving the partner section. Same page, role-gated. */}
        <Route path="/partner/notifications" element={<ProtectedRoute><RoleRoute allow="partner"><Shell><NotificationsPage /></Shell></RoleRoute></ProtectedRoute>} />
        <Route path="/settings"       element={<ProtectedRoute><Shell><SettingsPage /></Shell></ProtectedRoute>} />
        <Route path="/partner/settings" element={<ProtectedRoute><Shell><SettingsPage /></Shell></ProtectedRoute>} />
        <Route path="/help"           element={<ProtectedRoute><Shell><HelpPage /></Shell></ProtectedRoute>} />
        <Route path="/partner/help"   element={<ProtectedRoute><Shell><HelpPage /></Shell></ProtectedRoute>} />

        {/* Customer — only role='user' can hit these */}
        {/* Customer home — category-first landing. To re-enable the Leaflet
            map view, swap <HomeLandingPage /> for <MapHomePage />. */}
        <Route path="/"               element={<ProtectedRoute><OnboardingGate><RoleRoute allow="user"><Shell><HomeLandingPage /></Shell></RoleRoute></OnboardingGate></ProtectedRoute>} />
        <Route path="/categories"     element={<ProtectedRoute><RoleRoute allow="user"><Shell><AllCategoriesPage /></Shell></RoleRoute></ProtectedRoute>} />
        <Route path="/how-it-works"   element={<ProtectedRoute><RoleRoute allow="user"><Shell><HowItWorksPage /></Shell></RoleRoute></ProtectedRoute>} />
        {/* Taxonomy v2: /category/:name lists works; /work/:name is the decision fork */}
        <Route path="/category/:name" element={<ProtectedRoute><RoleRoute allow="user"><Shell><WorksPage /></Shell></RoleRoute></ProtectedRoute>} />
        <Route path="/work/:name"     element={<ProtectedRoute><RoleRoute allow="user"><Shell><CategoryDecisionPage /></Shell></RoleRoute></ProtectedRoute>} />
        <Route path="/partners"       element={<ProtectedRoute><RoleRoute allow="user"><Shell><PartnersListPage /></Shell></RoleRoute></ProtectedRoute>} />
        <Route path="/partners/:id"   element={<ProtectedRoute><RoleRoute allow="user"><Shell><PartnerDetailPage /></Shell></RoleRoute></ProtectedRoute>} />
        <Route path="/schedule/:id"   element={<ProtectedRoute><RoleRoute allow="user"><Shell><ScheduleJobPage /></Shell></RoleRoute></ProtectedRoute>} />
        <Route path="/scheduled"      element={<ProtectedRoute><RoleRoute allow="user"><Shell><UserScheduledPage /></Shell></RoleRoute></ProtectedRoute>} />
        <Route path="/waiting/:requestId" element={<ProtectedRoute><RoleRoute allow="user"><Shell><WaitingPage /></Shell></RoleRoute></ProtectedRoute>} />
        <Route path="/pay/:jobId"     element={<ProtectedRoute><RoleRoute allow="user"><Shell><PaymentPage /></Shell></RoleRoute></ProtectedRoute>} />
        <Route path="/done/:jobId"    element={<ProtectedRoute><RoleRoute allow="user"><Shell><DonePage /></Shell></RoleRoute></ProtectedRoute>} />
        <Route path="/my-jobs"        element={<ProtectedRoute><RoleRoute allow="user"><Shell><MyJobsPage /></Shell></RoleRoute></ProtectedRoute>} />
        <Route path="/my-jobs/all"    element={<ProtectedRoute><RoleRoute allow="user"><Shell><UserAllJobsPage /></Shell></RoleRoute></ProtectedRoute>} />
        <Route path="/my-jobs/:id"    element={<ProtectedRoute><RoleRoute allow="user"><Shell><UserJobDetailPage /></Shell></RoleRoute></ProtectedRoute>} />
        <Route path="/my-disputes"    element={<ProtectedRoute><RoleRoute allow="user"><Shell><MyDisputesPage /></Shell></RoleRoute></ProtectedRoute>} />
        <Route path="/profile"        element={<ProtectedRoute><RoleRoute allow="user"><Shell><ProfilePage /></Shell></RoleRoute></ProtectedRoute>} />
        <Route path="/profile/edit"   element={<ProtectedRoute><RoleRoute allow="user"><Shell><EditProfilePage /></Shell></RoleRoute></ProtectedRoute>} />

        {/* Partner — only role='partner' can hit these */}
        <Route path="/partner"             element={<ProtectedRoute><OnboardingGate><RoleRoute allow="partner"><Shell showRequestToast><PartnerDashboardPage /></Shell></RoleRoute></OnboardingGate></ProtectedRoute>} />
        <Route path="/partner/requests"    element={<ProtectedRoute><RoleRoute allow="partner"><Shell><PartnerRequestsPage /></Shell></RoleRoute></ProtectedRoute>} />
        <Route path="/partner/scheduled"   element={<ProtectedRoute><RoleRoute allow="partner"><Shell><PartnerScheduledPage /></Shell></RoleRoute></ProtectedRoute>} />
        <Route path="/partner/work"        element={<ProtectedRoute><RoleRoute allow="partner"><Shell><PartnerWorkPage /></Shell></RoleRoute></ProtectedRoute>} />
        <Route path="/partner/wallet"      element={<ProtectedRoute><RoleRoute allow="partner"><Shell><PartnerWalletPage /></Shell></RoleRoute></ProtectedRoute>} />
        <Route path="/partner/earnings"    element={<ProtectedRoute><RoleRoute allow="partner"><Shell><PartnerEarningsPage /></Shell></RoleRoute></ProtectedRoute>} />
        <Route path="/partner/transactions"     element={<ProtectedRoute><RoleRoute allow="partner"><Shell><PartnerTransactionsPage /></Shell></RoleRoute></ProtectedRoute>} />
        <Route path="/partner/transactions/:id" element={<ProtectedRoute><RoleRoute allow="partner"><Shell><PartnerTransactionDetailPage /></Shell></RoleRoute></ProtectedRoute>} />
        <Route path="/partner/disputes"         element={<ProtectedRoute><RoleRoute allow="partner"><Shell><MyDisputesPage /></Shell></RoleRoute></ProtectedRoute>} />
        <Route path="/partner/bank"        element={<ProtectedRoute><RoleRoute allow="partner"><Shell><BankAccountPage /></Shell></RoleRoute></ProtectedRoute>} />
        <Route path="/partner/profile"      element={<ProtectedRoute><RoleRoute allow="partner"><Shell><ProfilePage /></Shell></RoleRoute></ProtectedRoute>} />
        <Route path="/partner/profile/edit" element={<ProtectedRoute><RoleRoute allow="partner"><Shell><EditProfilePage /></Shell></RoleRoute></ProtectedRoute>} />
        <Route path="/partner/services/edit" element={<ProtectedRoute><RoleRoute allow="partner"><Shell><PartnerServicesEditPage /></Shell></RoleRoute></ProtectedRoute>} />
        <Route path="/partner/reviews"      element={<ProtectedRoute><RoleRoute allow="partner"><Shell><PartnerReviewsPage /></Shell></RoleRoute></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {/* Global review nag — non-dismissable modal that shows when the
          customer has any paid job from > 1h ago they haven't rated. */}
      <ReviewNagModal />
    </BrowserRouter>
    </ReviewNagProvider>
  )
}
