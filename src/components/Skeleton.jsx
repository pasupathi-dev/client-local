// Skeleton component library — shimmer placeholders that mirror the eventual
// layout so loading feels like content taking shape (no spinners, no layout
// shift). Theme-aware (light + dark) via the app's CSS tokens.
//
// Base:   <Skeleton className="h-3 w-1/2" />   — compose anything from it
// Shapes: <SkeletonText lines /> · <SkeletonAvatar /> · <SkeletonChip />
// Composites (match real layouts):
//   <RowSkeleton /> <CardSkeleton /> <GridSkeleton /> <ListSkeleton />
//   <TableSkeleton /> <StatGridSkeleton /> <ChartSkeleton /> <ProfileSkeleton />
//   <FormSkeleton /> <MapSkeleton /> <DetailSkeleton />
//
// Every placeholder uses `animate-shimmer` (keyframes in tailwind.config.js).

/* ── base ─────────────────────────────────────────────────────────────── */

export function Skeleton ({ className = '', rounded = 'rounded-md', style }) {
  return (
    <span
      aria-hidden="true"
      style={style}
      className={`relative block overflow-hidden align-middle
                  bg-black/[0.07] dark:bg-white/[0.09] ${rounded} ${className}`}>
      <span className="absolute inset-0 -translate-x-full animate-shimmer
                       bg-gradient-to-r from-transparent via-white/40 dark:via-white/10 to-transparent" />
    </span>
  )
}

export function SkeletonText ({ lines = 3, className = '', lastWidth = '60%' }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-3" rounded="rounded"
          style={{ width: i === lines - 1 ? lastWidth : `${85 - (i * 7) % 20}%` }} />
      ))}
    </div>
  )
}

export function SkeletonAvatar ({ size = 40, className = '' }) {
  return <Skeleton rounded="rounded-full" className={className} style={{ width: size, height: size }} />
}

export function SkeletonChip ({ w = 64, className = '' }) {
  return <Skeleton rounded="rounded-full" className={`h-6 ${className}`} style={{ width: w }} />
}

/* ── composites ───────────────────────────────────────────────────────── */

// Short horizontal rows: avatar + two text lines + trailing value.
// (notifications, wallet transactions, my-jobs rows, chat list)
export function RowSkeleton ({ count = 4, className = '' }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-card border border-border rounded-[var(--rs)] p-3.5 flex items-center gap-3">
          <Skeleton rounded="rounded-full" className="w-10 h-10 shrink-0" />
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            <Skeleton className="h-3" style={{ width: `${60 + (i * 7) % 25}%` }} />
            <Skeleton className="h-2.5" style={{ width: `${40 + (i * 13) % 30}%` }} />
          </div>
          <Skeleton className="h-2.5 w-10 shrink-0" />
        </div>
      ))}
    </div>
  )
}

// Taller cards: header (avatar + title/sub) + body lines + action chips.
// (partner cards, scheduled job cards, list detail cards)
export function CardSkeleton ({ count = 3, className = '' }) {
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-card border border-border rounded-[var(--r)] p-3.5 shadow-card flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <Skeleton rounded="rounded-full" className="w-10 h-10 shrink-0" />
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              <Skeleton className="h-3.5" style={{ width: `${55 + (i * 11) % 30}%` }} />
              <Skeleton className="h-2.5" style={{ width: `${35 + (i * 9) % 30}%` }} />
            </div>
          </div>
          <Skeleton className="h-2.5" style={{ width: '92%' }} />
          <Skeleton className="h-2.5" style={{ width: '68%' }} />
          <div className="flex gap-2 mt-1">
            <Skeleton rounded="rounded-full" className="h-6 w-20" />
            <Skeleton rounded="rounded-full" className="h-6 w-16" />
          </div>
        </div>
      ))}
    </div>
  )
}

// Responsive tile grid — category/work/partner grids, "all categories".
export function GridSkeleton ({ count = 8, cols = 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4', className = '' }) {
  return (
    <div className={`grid ${cols} gap-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-card border border-border rounded-[var(--r)] p-4 flex flex-col items-center gap-2">
          <Skeleton rounded="rounded-xl" className="w-12 h-12" />
          <Skeleton className="h-3 w-3/5 mt-1" />
          <Skeleton className="h-2.5 w-2/5" />
        </div>
      ))}
    </div>
  )
}

// Simple stacked icon + text-line list (search hits, menu items).
export function ListSkeleton ({ count = 6, className = '' }) {
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton rounded="rounded-lg" className="w-8 h-8 shrink-0" />
          <Skeleton className="h-3 flex-1" style={{ maxWidth: `${70 - (i * 5) % 30}%` }} />
        </div>
      ))}
    </div>
  )
}

// Generic table: header + N rows × M cols.
export function TableSkeleton ({ rows = 8, cols = 5, className = '' }) {
  return (
    <div className={`w-full ${className}`}>
      <div className="flex gap-3 px-3 py-2.5 border-b border-border">
        {Array.from({ length: cols }).map((_, c) => (
          <Skeleton key={c} className="h-3 flex-1" style={{ maxWidth: c === 0 ? '20%' : undefined }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3 px-3 py-3.5 border-b border-border/60 items-center">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-3 flex-1" style={{ maxWidth: c === 0 ? '20%' : `${60 + (r * (c + 1) * 7) % 35}%` }} />
          ))}
        </div>
      ))}
    </div>
  )
}

// Dashboard stat cards row.
export function StatGridSkeleton ({ count = 4, className = '' }) {
  return (
    <div className={`grid grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-card border border-border rounded-[var(--r)] p-5 flex flex-col gap-3">
          <Skeleton rounded="rounded-xl" className="w-9 h-9" />
          <Skeleton className="h-6 w-3/5" />
          <Skeleton className="h-2.5 w-2/5" />
        </div>
      ))}
    </div>
  )
}

// Chart placeholder — bars of varying height under a title.
export function ChartSkeleton ({ className = '', height = 200 }) {
  const bars = [60, 85, 45, 95, 70, 55, 80, 40, 90, 65]
  return (
    <div className={`bg-card border border-border rounded-[var(--r)] p-5 ${className}`}>
      <Skeleton className="h-3.5 w-1/3 mb-5" />
      <div className="flex items-end gap-2" style={{ height }}>
        {bars.map((h, i) => (
          <Skeleton key={i} rounded="rounded-t-md" className="flex-1" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  )
}

// Profile / detail header — avatar + name + meta lines + stat row.
export function ProfileSkeleton ({ className = '' }) {
  return (
    <div className={`bg-card border border-border rounded-[var(--r)] p-5 ${className}`}>
      <div className="flex items-center gap-4">
        <Skeleton rounded="rounded-full" className="w-20 h-20 shrink-0" />
        <div className="flex-1 flex flex-col gap-2">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 mt-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <Skeleton className="h-6 w-12" />
            <Skeleton className="h-2.5 w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}

// Form skeleton — labelled fields + a submit bar.
export function FormSkeleton ({ fields = 5, className = '' }) {
  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-2.5 w-24" />
          <Skeleton rounded="rounded-[var(--rs)]" className="h-11 w-full" />
        </div>
      ))}
      <Skeleton rounded="rounded-[var(--rs)]" className="h-11 w-40 mt-2" />
    </div>
  )
}

// Map placeholder — big rounded block with a faint pin.
export function MapSkeleton ({ className = '', height = 280 }) {
  return (
    <div
      aria-hidden="true"
      className={`relative overflow-hidden rounded-[var(--r)] border border-border bg-black/[0.04] dark:bg-white/[0.05] ${className}`}
      style={{ height }}>
      <span className="absolute inset-0 -translate-x-full animate-shimmer
                       bg-gradient-to-r from-transparent via-white/30 dark:via-white/10 to-transparent" />
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl opacity-30">📍</span>
    </div>
  )
}

// Full detail page (header + body sections) — partner/job detail loading.
export function DetailSkeleton ({ className = '' }) {
  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      <ProfileSkeleton />
      <div className="bg-card border border-border rounded-[var(--r)] p-5 flex flex-col gap-2.5">
        <Skeleton className="h-3.5 w-1/4 mb-1" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-11/12" />
        <Skeleton className="h-3 w-3/4" />
      </div>
      <RowSkeleton count={3} />
    </div>
  )
}

export default Skeleton
