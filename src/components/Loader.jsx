// Shared tiny spinner — one visual for every loading state in the app.
// Use <Loader/>            — inline 16px spinner.
// Use <Loader size={24}/>  — bigger.
// Use <Loader label="…"/>  — centered block w/ caption (lists, empty panels).
// Use <Loader fullScreen/> — fills the viewport (auth/session loading).

export default function Loader ({ size = 18, label, fullScreen = false, className = '' }) {
  const ring = (
    <span
      aria-label="Loading"
      role="status"
      className={`inline-block rounded-full border-[2.5px] border-border border-t-accent animate-spin ${className}`}
      style={{ width: size, height: size }}
    />
  )

  if (fullScreen) {
    return (
      <div className="min-h-screen flex flex-col gap-3 items-center justify-center bg-surface text-text">
        <span className="inline-block rounded-full border-[3px] border-border border-t-accent animate-spin"
              style={{ width: 32, height: 32 }} />
        {label && <div className="text-xs text-muted">{label}</div>}
      </div>
    )
  }

  if (label) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted">
        {ring}
        <div className="text-[11px]">{label}</div>
      </div>
    )
  }

  return ring
}
