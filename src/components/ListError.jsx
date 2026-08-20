// H85 — Standardised "couldn't load" error block for list pages. Replaces
// silent fetch failures with a visible state + a Retry button that fires
// the caller's refetch (usually a thunk dispatch). Keeps users from having
// to reload the whole app when a network blip kills the first request.
//
// Usage:
//   <ListError onRetry={() => dispatch(loadXxx())} />
//   <ListError message="Could not load wallet" onRetry={refetch} compact />

export default function ListError ({
  message = "Couldn't load. Tap to retry.",
  onRetry,
  compact = false,
}) {
  return (
    <div className={`text-center ${compact ? 'py-6 px-4' : 'py-12 px-6'}`}>
      <div className={`${compact ? 'text-[28px]' : 'text-[40px]'} mb-2 opacity-90`}>
        📡
      </div>
      <div className={`font-display font-extrabold text-text
                       ${compact ? 'text-[13px]' : 'text-[15px]'} mb-1`}>
        Something didn't load
      </div>
      <div className={`text-muted mx-auto leading-[1.55]
                       ${compact ? 'text-[11.5px] max-w-[260px]' : 'text-[12px] max-w-[320px]'}`}>
        {message}
      </div>
      {onRetry && (
        <button onClick={onRetry}
          className="inline-flex items-center justify-center gap-1.5 mt-4
                     px-4 py-2 rounded-full bg-accent text-white
                     text-[12px] font-bold hover:brightness-90 transition
                     shadow-[0_4px_12px_rgba(232,65,26,0.25)]">
          ↻ Try again
        </button>
      )}
    </div>
  )
}
