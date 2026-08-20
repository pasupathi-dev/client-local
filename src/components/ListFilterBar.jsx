// Shared filter bar used by list pages (All Jobs, Transactions, Notifications).
// Design goals:
//   - Search input up top — debounced by the caller, not here.
//   - Status/category chips beneath the search (horizontal scroll on narrow).
//   - Collapsible date range (From · To · Clear). Collapsed by default so
//     the default view stays clean.
//   - Authoritative total count next to the page title.
//
// The bar itself is pure UI — it doesn't trigger fetches. Callers own the
// filter state and wire it to their list fetch. That keeps the component
// reusable across very different list shapes.

import { useState } from 'react'
import Loader from '@/components/Loader'

export default function ListFilterBar ({
  title,
  total, totalLabel = 'items', loading = false,
  onBack,
  search, onSearchChange, searchPlaceholder = 'Search…',
  chipOptions = [], chipValue, onChipChange,
  from, to, onFromChange, onToChange, onClearDates,
  maxDate,
  extras,
}) {
  const [dateOpen, setDateOpen] = useState(Boolean(from || to))
  const hasDates = Boolean(from || to)

  return (
    <div className="mb-4">
      {/* Title row */}
      <div className="flex items-center gap-3 mb-3">
        {onBack && (
          <button onClick={onBack}
            className="w-9 h-9 rounded-full bg-card border border-border
                       flex items-center justify-center hover:border-accent transition">
            ←
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-display font-extrabold text-[18px] text-text truncate">{title}</div>
            <TotalBadge total={total} label={totalLabel} loading={loading} />
          </div>
        </div>
        {extras}
      </div>

      {/* Search */}
      {onSearchChange && (
        <div className="relative mb-3">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">🔎</span>
          <input
            type="search"
            value={search ?? ''}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full h-11 pl-9 pr-10 rounded-[var(--r)] bg-card border border-border
                       text-[13px] text-text placeholder:text-muted
                       focus:outline-none focus:border-accent transition" />
          {loading && (
            <span className="absolute right-10 top-1/2 -translate-y-1/2"><Loader size={14}/></span>
          )}
          {search && (
            <button onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full
                         text-muted hover:text-text hover:bg-surface transition">
              ✕
            </button>
          )}
        </div>
      )}

      {/* Chips + date-range toggle row */}
      <div className="flex items-center gap-2 mb-2">
        <div className="flex gap-2 overflow-x-auto no-scrollbar flex-1 min-w-0">
          {chipOptions.map((opt) => {
            const on = chipValue === opt.id
            return (
              <button key={opt.id} onClick={() => onChipChange?.(opt.id)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5
                            rounded-full text-[12px] font-semibold whitespace-nowrap
                            border-[1.5px] transition
                            ${on
                              ? 'bg-accent border-accent text-white shadow-[0_3px_10px_rgba(232,65,26,0.25)]'
                              : 'bg-card border-border text-muted hover:border-accent hover:text-accent'}`}>
                {opt.icon && <span>{opt.icon}</span>}
                {opt.label}
              </button>
            )
          })}
        </div>
        {onFromChange && (
          <button onClick={() => setDateOpen((o) => !o)}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full
                        text-[12px] font-bold whitespace-nowrap border-[1.5px] transition
                        ${hasDates
                          ? 'bg-accent/10 border-accent text-accent'
                          : 'bg-card border-border text-muted hover:border-accent hover:text-accent'}`}>
            📅 {hasDates ? 'Dates on' : 'Date range'}
          </button>
        )}
      </div>

      {onFromChange && dateOpen && (
        <div className="flex flex-wrap items-end gap-2 mt-2 mb-1 p-3 rounded-[var(--r)]
                        bg-card border border-border">
          <DateField label="From" value={from || ''} max={to || maxDate}
            onChange={(v) => onFromChange?.(v)} />
          <DateField label="To" value={to || ''} min={from || ''} max={maxDate}
            onChange={(v) => onToChange?.(v)} />
          {hasDates && (
            <button onClick={onClearDates}
              className="px-3 py-1.5 rounded-[var(--rs)] border-[1.5px] border-border bg-card
                         text-[12px] font-semibold text-text hover:border-muted transition">
              Clear dates
            </button>
          )}
          <span className="ml-auto text-[10px] text-muted">Server-filtered · no future dates</span>
        </div>
      )}
    </div>
  )
}

function DateField ({ label, value, onChange, min, max }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.5px] text-muted">{label}</span>
      <input type="date" value={value}
        min={min || undefined} max={max || undefined}
        onChange={(e) => onChange?.(e.target.value)}
        className="px-2.5 py-1.5 rounded-[var(--rs)] border-[1.5px] border-border bg-card
                   text-[12px] text-text outline-none focus:border-accent transition" />
    </label>
  )
}

function TotalBadge ({ total, label, loading }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-[3px] rounded-xl text-[10px] font-bold
                     bg-surface border border-border text-muted">
      {loading ? <Loader size={10}/> : <span className="text-text font-extrabold">{total ?? 0}</span>}
      <span className="opacity-70">{label}</span>
    </span>
  )
}
