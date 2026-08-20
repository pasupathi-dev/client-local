// H81 — Week + day calendar view for the partner's scheduled jobs.
//
// Layout:
//   - Week header: 7 day columns with date + count badge for that day
//   - Day pane: time-sorted list of slots for the picked day
//
// We keep things simple: no third-party calendar lib (none are installed).
// All date math is vanilla JS. Time slots come from the scheduled_jobs row
// as-is (e.g. "09:00 AM") and we sort using the row's `scheduled_at`
// timestamp when present, falling back to lexical time_slot order.

import { useMemo, useState } from 'react'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// Returns the Sunday (00:00) of the same week as `date`.
function startOfWeek (date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return d
}

// Returns a string YYYY-MM-DD for the local date. The server stores
// `schedule_date` in the same format so we can match by string compare
// rather than parsing back into Date objects.
function isoDate (date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function sameDay (a, b) {
  return a.getFullYear() === b.getFullYear()
      && a.getMonth()    === b.getMonth()
      && a.getDate()     === b.getDate()
}

export default function PartnerScheduleCalendar ({ jobs, onPick }) {
  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d }, [])
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today))
  const [selectedDate, setSelectedDate] = useState(today)

  // 7-day grid of Date objects, anchored on the week's Sunday.
  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart); d.setDate(d.getDate() + i); return d
    })
  }, [weekStart])

  // Bucket jobs by ISO date for fast count lookups.
  const byDate = useMemo(() => {
    const out = {}
    for (const j of jobs || []) {
      const key = j.schedule_date
      if (!key) continue
      ;(out[key] = out[key] || []).push(j)
    }
    return out
  }, [jobs])

  const selectedJobs = useMemo(() => {
    const key = isoDate(selectedDate)
    const arr = byDate[key] || []
    // Sort by scheduled_at when present (it's an ISO timestamp), otherwise
    // by the raw time_slot string which sorts reasonably for HH:MM AM/PM.
    return [...arr].sort((a, b) => {
      const ta = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0
      const tb = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0
      if (ta && tb) return ta - tb
      return String(a.time_slot || '').localeCompare(String(b.time_slot || ''))
    })
  }, [byDate, selectedDate])

  const shiftWeek = (deltaDays) => {
    const next = new Date(weekStart)
    next.setDate(next.getDate() + deltaDays)
    setWeekStart(next)
  }
  const jumpToday = () => {
    setWeekStart(startOfWeek(today))
    setSelectedDate(today)
  }

  // Header label like "Apr 14 – 20, 2026" (or spans months: "Apr 28 – May 4").
  const weekLabel = (() => {
    const last = new Date(weekStart); last.setDate(last.getDate() + 6)
    const sameMonth = last.getMonth() === weekStart.getMonth()
    if (sameMonth) {
      return `${MONTH_NAMES[weekStart.getMonth()]} ${weekStart.getDate()} – ${last.getDate()}, ${last.getFullYear()}`
    }
    return `${MONTH_NAMES[weekStart.getMonth()]} ${weekStart.getDate()} – ${MONTH_NAMES[last.getMonth()]} ${last.getDate()}, ${last.getFullYear()}`
  })()

  return (
    <div className="bg-card border border-border rounded-[var(--r)] shadow-card overflow-hidden">
      {/* Week header — nav controls + label */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border">
        <button onClick={() => shiftWeek(-7)}
          className="w-7 h-7 rounded-full bg-surface border border-border
                     flex items-center justify-center text-muted hover:text-text transition"
          aria-label="Previous week">←</button>
        <div className="flex-1 text-center text-[12.5px] font-bold text-text">
          {weekLabel}
        </div>
        <button onClick={jumpToday}
          className="text-[10.5px] font-bold px-2 py-1 rounded-full
                     bg-card border border-border text-accent hover:border-accent transition">
          Today
        </button>
        <button onClick={() => shiftWeek(7)}
          className="w-7 h-7 rounded-full bg-surface border border-border
                     flex items-center justify-center text-muted hover:text-text transition"
          aria-label="Next week">→</button>
      </div>

      {/* Week day strip */}
      <div className="grid grid-cols-7 border-b border-border">
        {days.map((d, i) => {
          const key = isoDate(d)
          const count = (byDate[key] || []).length
          const isToday = sameDay(d, today)
          const isSelected = sameDay(d, selectedDate)
          return (
            <button key={key}
              onClick={() => setSelectedDate(d)}
              className={`flex flex-col items-center gap-0.5 py-2.5 transition
                          ${isSelected
                            ? 'bg-accent text-white'
                            : 'bg-card hover:bg-surface text-text'}`}>
              <span className={`text-[10px] font-bold uppercase tracking-[0.5px]
                                ${isSelected ? 'text-white/80' : 'text-muted'}`}>
                {DAY_NAMES[i]}
              </span>
              <span className={`text-[15px] font-extrabold relative
                                ${isToday && !isSelected ? 'text-accent' : ''}`}>
                {d.getDate()}
                {isToday && !isSelected && (
                  <span aria-hidden className="absolute -bottom-0.5 left-1/2 -translate-x-1/2
                                               w-1 h-1 rounded-full bg-accent" />
                )}
              </span>
              {count > 0 && (
                <span className={`text-[9px] font-bold px-1.5 py-[1px] rounded-full
                                  ${isSelected
                                    ? 'bg-white/30 text-white'
                                    : 'bg-accent/10 text-accent'}`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Day pane */}
      <div className="p-3 min-h-[160px]">
        <div className="text-[10px] uppercase tracking-[0.5px] font-extrabold text-muted mb-2">
          {DAY_NAMES[selectedDate.getDay()]}, {MONTH_NAMES[selectedDate.getMonth()]} {selectedDate.getDate()}
        </div>
        {selectedJobs.length === 0 && (
          <div className="text-center py-6 text-[12px] text-muted">
            Nothing scheduled this day.
          </div>
        )}
        <div className="flex flex-col gap-2">
          {selectedJobs.map((j) => (
            <button key={j.id} onClick={() => onPick?.(j)}
              className="bg-surface border border-border rounded-[10px] px-3 py-2.5
                         flex items-center gap-3 text-left
                         hover:border-accent transition">
              <div className="shrink-0 text-center w-[58px]">
                <div className="text-[12.5px] font-extrabold text-text leading-tight">
                  {j.time_slot || '—'}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold text-text truncate">
                  {j.service_icon ? `${j.service_icon} ` : ''}{j.service}
                </div>
                <div className="text-[11px] text-muted truncate">
                  with {j.customer_name || 'customer'} · ₹{j.base_price ?? 0}
                </div>
              </div>
              <span className="text-[9px] font-extrabold uppercase tracking-[0.4px]
                               px-1.5 py-[2px] rounded-full bg-card border border-border text-muted">
                {j.status}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
