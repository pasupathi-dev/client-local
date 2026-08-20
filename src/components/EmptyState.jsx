// H84 — Standardised empty state for list pages. Every list page should
// use this so the user always sees: a visual cue, one-line copy, and the
// next action they can take.
//
// Usage:
//   <EmptyState icon="📋" title="No active job" copy="…"
//     ctaLabel="Find a partner" onCta={() => nav('/categories')} />
//
// Pass `compact` for in-card placements (e.g. wallet transactions list).

export default function EmptyState ({
  icon = '📭',
  title,
  copy,
  ctaLabel,
  onCta,
  compact = false,
}) {
  return (
    <div className={`text-center ${compact ? 'py-6 px-4' : 'py-12 px-6'}`}>
      <div className={`${compact ? 'text-[28px]' : 'text-[40px]'} mb-2 opacity-90`}>
        {icon}
      </div>
      {title && (
        <div className={`font-display font-extrabold text-text
                          ${compact ? 'text-[13px]' : 'text-[15px]'} mb-1`}>
          {title}
        </div>
      )}
      {copy && (
        <div className={`text-muted mx-auto leading-[1.55]
                          ${compact ? 'text-[11.5px] max-w-[260px]' : 'text-[12px] max-w-[320px]'}`}>
          {copy}
        </div>
      )}
      {ctaLabel && onCta && (
        <button onClick={onCta}
          className="inline-flex items-center justify-center gap-1.5 mt-4
                     px-4 py-2 rounded-full bg-accent text-white
                     text-[12px] font-bold hover:brightness-90 transition
                     shadow-[0_4px_12px_rgba(232,65,26,0.25)]">
          {ctaLabel}
        </button>
      )}
    </div>
  )
}
