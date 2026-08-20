// ReviewNagContext — global owner of the "you have an unrated job" modal.
//
// Two consumers:
//   useReviewNag().pending          — the pending job, or null
//   useReviewNag().requireReview()  — promise that resolves once nothing is
//                                     owed. Booking flows await this before
//                                     making their request, so a single line
//                                     gates every booking entry point:
//
//       if (!(await requireReview())) return  // user cancelled (skipped)
//
// The modal itself is rendered by <ReviewNagModal /> (see modal file). It's
// non-dismissable: only Submit (rates the job) or Skip (marks it skipped on
// the server so we don't ask again for that job) closes it.

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { selectIsAuthenticated } from '@/features/auth/authSlice'
import { selectMode } from '@/features/app/appSlice'
import { selectProfile } from '@/features/profile/profileSlice'
import * as api from '@/services/api'

const Ctx = createContext(null)

export function useReviewNag () {
  const v = useContext(Ctx)
  if (!v) throw new Error('useReviewNag must be used inside ReviewNagProvider')
  return v
}

export function ReviewNagProvider ({ children }) {
  const authed   = useSelector(selectIsAuthenticated)
  const mode     = useSelector(selectMode)
  const profile  = useSelector(selectProfile)
  const isCustomer = mode !== 'partner' && profile?.role !== 'partner'

  const [pending, setPending] = useState(null)
  const [open, setOpen]       = useState(false)

  // Pulls the latest pending review. Only gated for authenticated customers
  // who've completed onboarding — partners don't see review nags.
  const refresh = useCallback(async () => {
    if (!authed || !isCustomer || !profile?.onboarding_done) {
      setPending(null)
      return null
    }
    try {
      const { pending: p } = await api.fetchPendingReview()
      setPending(p || null)
      return p || null
    } catch {
      setPending(null)
      return null
    }
  }, [authed, isCustomer, profile?.onboarding_done])

  // Initial check + whenever auth/role changes.
  useEffect(() => { refresh() }, [refresh])

  // Re-check when the user comes back to the tab — paid-then-elapsed-an-hour
  // is the trigger and the elapsed-hour boundary won't fire any event of its
  // own.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [refresh])

  // Booking flows await this. If a pending review exists, we open the modal
  // and resolve when the user closes it (via submit OR skip). Returns true
  // when the booking should proceed.
  const requireReview = useCallback(async () => {
    const p = await refresh()
    if (!p) return true
    // Open the modal and wait for it to close. We track the promise here so
    // multiple concurrent callers all resolve when the modal closes once.
    return new Promise((resolve) => {
      pendingResolversRef.current.push(resolve)
      setOpen(true)
    })
  }, [refresh])

  // Resolvers stored in a ref so we don't churn React state on each push.
  const pendingResolversRef = useNoSyncRef([])

  const submitted = useCallback(async () => {
    setOpen(false)
    setPending(null)
    flushResolvers(pendingResolversRef, true)
    // Refresh in the background — there could be more than one unrated job.
    refresh()
  }, [refresh])

  const skipped = useCallback(async () => {
    if (pending?.id) {
      try { await api.skipReview(pending.id) } catch { /* swallow */ }
    }
    setOpen(false)
    setPending(null)
    flushResolvers(pendingResolversRef, true)
    refresh()
  }, [pending?.id, refresh])

  return (
    <Ctx.Provider value={{ pending, open, refresh, requireReview, submitted, skipped }}>
      {children}
    </Ctx.Provider>
  )
}

// Tiny local helpers to avoid extra hooks files.
function useNoSyncRef (initial) {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [r] = useState(() => ({ current: initial }))
  return r
}
function flushResolvers (ref, value) {
  const list = ref.current
  ref.current = []
  list.forEach((resolve) => { try { resolve(value) } catch { /* ignore */ } })
}
