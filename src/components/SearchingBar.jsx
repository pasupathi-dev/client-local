// Global "still searching" indicator. Collapsed to a small circular FAB at the
// bottom-right (like a floating action button); on hover it expands leftward to
// reveal the full detail. Tapping resumes the waiting screen. Shown for a
// customer whenever they have a live auto-match request in flight and they're
// not already on the waiting screen. State is server-truth (jobs.currentRequest,
// hydrated from GET /api/requests/active) — no localStorage.

import { useNavigate, useLocation } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { motion, AnimatePresence } from 'framer-motion'
import { selectCurrentRequest } from '@/features/jobs/jobsSlice'
import { selectMode } from '@/features/app/appSlice'

export default function SearchingBar () {
  const nav  = useNavigate()
  const loc  = useLocation()
  const mode = useSelector(selectMode)
  const req  = useSelector(selectCurrentRequest)

  const onWaiting = /^\/waiting\//.test(loc.pathname)
  const show = mode === 'user' && req && req.status === 'live' && !onWaiting
  const label = req?.service || req?.work_name || 'partner'

  return (
    <AnimatePresence>
      {show && (
        <motion.div key="searching-fab"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.6, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 360, damping: 24 }}
          className="fixed z-[60] right-4 bottom-[88px] sm:bottom-6">
          <button onClick={() => nav(`/waiting/${req.id}`)} title={`Finding your ${label}… — tap to view`}
            className="group flex items-center bg-ink text-white rounded-full p-1.5
                       shadow-[0_14px_34px_-6px_rgba(0,0,0,0.5)] hover:brightness-110 transition">
            {/* Detail — collapsed by default, slides open on hover */}
            <span className="flex flex-col max-w-0 opacity-0 overflow-hidden whitespace-nowrap text-left
                             group-hover:max-w-[230px] group-hover:opacity-100 group-hover:pl-3.5 group-hover:pr-1
                             transition-all duration-300 ease-out">
              <span className="flex items-center gap-1.5 text-[13px] font-bold leading-tight">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                Finding your {label}…
              </span>
              <span className="text-[11px] text-white/55 leading-tight mt-0.5">Tap to view the live search</span>
            </span>
            {/* The always-visible circle */}
            <span className="relative grid place-items-center w-12 h-12 rounded-full bg-white/10 shrink-0">
              <span className="absolute inline-flex w-12 h-12 rounded-full border-2 border-accent/60 animate-ping" />
              <span className="text-[18px]">{req.service_icon || '🔍'}</span>
            </span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
