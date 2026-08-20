// Shared onboarding wrapper.
//  - Mobile   (<768px):  horizontal topbar  [back] [progress track] [step N of M]
//                        body scrolls,  sticky footer CTA at bottom.
//  - Desktop  (≥768px):  50/50 grid — left = dark brand panel (wrench + wordmark + tag),
//                        right = body with desktop progress row above the title + sticky footer.
//
// Usage:
//   <OnboardingShell
//     step={2} total={4}
//     onBack={...}
//     footer={<button className="ob-cta">Continue →</button>}
//   >
//     {...page body...}
//   </OnboardingShell>

function BrandSide () {
  return (
    <div className="hidden md:flex flex-col items-center justify-center text-center gap-4
                    bg-brand text-white px-8 lg:px-12 py-10 h-full
                    border-r border-white/10 shadow-[1px_0_0_rgba(0,0,0,0.25)]">
      <div className="w-24 h-24 rounded-3xl grid place-items-center text-5xl"
        style={{ background: 'rgba(232,65,26,0.15)', border: '2px solid rgba(232,65,26,0.25)' }}>
        🔧
      </div>
      <div className="font-display font-extrabold text-white leading-none text-[38px] lg:text-[52px] tracking-tight">
        Service<span className="text-accent">Link</span>
      </div>
      <div className="text-white/50 text-base font-medium tracking-[0.3px]">
        Local services, instantly
      </div>
    </div>
  )
}

export default function OnboardingShell ({
  step = 1, total = 4, onBack, footer, children,
  hideFooter = false, hideProgress = false,
}) {
  const pct = Math.min(100, Math.max(0, Math.round((step / total) * 100)))

  return (
    <div className="fixed inset-0 bg-surface text-text overflow-hidden
                    grid grid-rows-[auto_1fr_auto] md:grid-rows-1 md:grid-cols-2">
      {/* MOBILE topbar (row 1) */}
      <div className="md:hidden flex items-center gap-3 px-5 py-4 bg-card border-b border-border">
        {step > 1 && (
          <button onClick={onBack} type="button"
            className="text-[20px] text-muted hover:text-accent transition">
            ←
          </button>
        )}
        {!hideProgress && (
          <>
            <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
              <div className="h-full bg-accent transition-[width] duration-[350ms]" style={{ width: `${pct}%` }} />
            </div>
            <div className="text-xs text-muted font-semibold whitespace-nowrap">Step {step} of {total}</div>
          </>
        )}
      </div>

      {/* DESKTOP brand panel (col 1) */}
      <BrandSide />

      {/* Body (mobile row 2 / desktop col 2) */}
      <div className="overflow-y-auto relative md:row-span-1 md:col-start-2
                      px-5 md:px-9 lg:px-12 pt-6 md:pt-10 lg:pt-12 pb-24 animate-pgIn">
        {/* Desktop-only progress cluster — step label over the track, back arrow inline only if > step 1 */}
        {!hideProgress && (
          <div className="hidden md:block mb-6 lg:mb-7">
            <div className="flex items-center justify-between gap-4 mb-2">
              {step > 1 ? (
                <button onClick={onBack} type="button"
                  className="text-[20px] text-muted hover:text-accent transition flex items-center gap-1.5 text-sm font-semibold">
                  ← Back
                </button>
              ) : <span />}
              <div className="text-sm text-muted font-semibold whitespace-nowrap">Step {step} of {total}</div>
            </div>
            <div className="w-full h-[5px] bg-border rounded-full overflow-hidden">
              <div className="h-full bg-accent transition-[width] duration-[350ms]" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {children}
      </div>

      {/* Sticky footer (mobile row 3 / desktop fixed to bottom of col 2) */}
      {!hideFooter && (
        <div className="bg-card border-t border-border px-5 md:px-9 lg:px-12 py-4 md:py-[18px] lg:py-5
                        md:col-start-2 md:fixed md:bottom-0 md:right-0 md:w-1/2
                        flex gap-3">
          {footer}
        </div>
      )}
    </div>
  )
}
