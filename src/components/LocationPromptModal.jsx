// Two-state location modal:
//   1. 'pre'      — explainer + "Enable Location" CTA
//   2. 'denied'   — instructions to unblock browser permission + "Try Again"
//
// No manual fallback: location MUST come from the device.
// If the user blocks it, they can re-open the modal and try again.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import useLocation from '@/hooks/useLocation'

function ModalShell ({ children, onClose, allowBackdropClose = true }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && allowBackdropClose) onClose?.() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, allowBackdropClose])

  return createPortal(
    <div
      onClick={(e) => { if (allowBackdropClose && e.target === e.currentTarget) onClose?.() }}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4
                 bg-[rgba(10,15,30,0.6)] backdrop-blur-[4px] animate-pgIn">
      <div className="bg-card text-text rounded-[20px] px-7 py-7 w-full max-w-[400px]
                      shadow-[0_20px_60px_rgba(0,0,0,0.25)] animate-popIn">
        {children}
      </div>
    </div>,
    document.body,
  )
}

// Persists the user's response (granted / denied / skipped) so the home
// page doesn't keep re-popping the rationale sheet on every visit. The flag
// is keyed per browser (localStorage) with a 7-day TTL — long enough to
// avoid pester-fatigue, short enough that we re-ask after a quiet week.
const RATIONALE_KEY    = 'sl:locRationaleResponse'
const RATIONALE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export function readLocationRationaleResponse () {
  try {
    const raw = localStorage.getItem(RATIONALE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.at || Date.now() - parsed.at > RATIONALE_TTL_MS) return null
    return parsed.value || null   // 'granted' | 'denied' | 'manual'
  } catch { return null }
}

function writeLocationRationaleResponse (value) {
  try {
    localStorage.setItem(RATIONALE_KEY, JSON.stringify({ value, at: Date.now() }))
  } catch { /* localStorage disabled — non-fatal */ }
}

export default function LocationPromptModal ({
  open, onClose, onGranted, onManual,
  requireSuccess = false, title, body,
}) {
  const loc = useLocation()
  const [step, setStep] = useState('pre')   // 'pre' | 'fetching' | 'denied'

  // Reset internal step whenever the modal opens
  useEffect(() => {
    if (!open) return
    if (loc.status === 'denied' || loc.status === 'unavailable') setStep('denied')
    else                                                          setStep('pre')
  }, [open, loc.status])

  const enable = async () => {
    setStep('fetching')
    const r = await loc.request({ highAccuracy: true })
    if (r.ok) {
      writeLocationRationaleResponse('granted')
      onGranted?.(r)
      onClose?.()
    } else {
      writeLocationRationaleResponse('denied')
      setStep('denied')
    }
  }

  const goManual = () => {
    writeLocationRationaleResponse('manual')
    onManual?.()
    onClose?.()
  }

  if (!open) return null

  return (
    <ModalShell onClose={onClose} allowBackdropClose={!requireSuccess}>
      {step === 'pre' && (
        <>
          <div className="w-16 h-16 rounded-full mx-auto mb-4 grid place-items-center text-[28px]
                          bg-[linear-gradient(135deg,rgba(37,99,235,0.12),rgba(37,99,235,0.04))]
                          border-2 border-[rgba(37,99,235,0.15)]">
            📍
          </div>
          <h2 className="font-display font-extrabold text-lg text-center mb-2">
            {title || 'Find verified partners near you'}
          </h2>
          <p className="text-[13px] text-muted leading-[1.6] text-center mb-2">
            {body || "We use your location to find verified partners within 10 km. We never share it without a job."}
          </p>
          {/* Small reassurance bullets — kept tight so the sheet still
              feels like a confirmation, not a wall of legal copy. */}
          <ul className="text-[11px] text-muted leading-[1.6] mb-5 space-y-1 px-2">
            <li>• Only used while you're using ServiceLink</li>
            <li>• Never shared with a partner until you book a job</li>
            <li>• You can switch to manual address any time</li>
          </ul>
          <div className="flex flex-col gap-2">
            <button onClick={enable}
              className="w-full py-3 rounded-[var(--rs)] bg-accent text-white
                         font-display font-bold text-sm
                         shadow-[0_4px_16px_rgba(232,65,26,0.3)]
                         hover:brightness-90 transition">
              Continue
            </button>
            {!requireSuccess && (
              <button onClick={goManual}
                className="w-full py-2.5 rounded-[var(--rs)] border border-border bg-card
                           text-text text-sm font-semibold hover:border-muted transition">
                Not now — enter address manually
              </button>
            )}
          </div>
        </>
      )}

      {step === 'fetching' && (
        <div className="text-center py-6">
          <div className="w-12 h-12 mx-auto mb-3 border-4 border-border border-t-accent rounded-full animate-spin"/>
          <div className="text-sm font-bold">Getting your location…</div>
          <div className="text-xs text-muted mt-1">Please tap "Allow" on the browser prompt.</div>
        </div>
      )}

      {step === 'denied' && (
        <>
          <div className="w-16 h-16 rounded-full mx-auto mb-4 grid place-items-center text-[28px]
                          bg-[linear-gradient(135deg,rgba(239,68,68,0.12),rgba(239,68,68,0.04))]
                          border-2 border-[rgba(239,68,68,0.15)]">
            🚫
          </div>
          <h2 className="font-display font-extrabold text-lg text-center mb-2">
            Location blocked
          </h2>
          <p className="text-[13px] text-muted leading-[1.6] text-center mb-4">
            Your browser is blocking location for this site. To unblock:
          </p>
          <ol className="text-[12px] text-muted leading-[1.7] mb-5 pl-5 list-decimal">
            <li>Click the <b className="text-text">lock icon 🔒</b> in the address bar</li>
            <li>Find <b className="text-text">Location</b> and set it to <b className="text-text">Allow</b></li>
            <li>Reload the page, then tap <b className="text-text">Try Again</b></li>
          </ol>
          <div className="flex flex-col gap-2">
            <button onClick={enable}
              className="w-full py-3 rounded-[var(--rs)] bg-accent text-white
                         font-display font-bold text-sm
                         shadow-[0_4px_16px_rgba(232,65,26,0.3)]">
              📍 Try Again
            </button>
            {!requireSuccess && (
              <button onClick={onClose}
                className="text-xs text-muted hover:text-text transition mt-1">
                Cancel
              </button>
            )}
          </div>
        </>
      )}
    </ModalShell>
  )
}
