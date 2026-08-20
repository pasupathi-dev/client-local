// Partner Earnings — dedicated analytics page.
//
// Reached via Dashboard → "Earnings · Last 7 Days" → View All.
// Every filter change triggers a fresh API call (server does the bucketing
// and totals). There is NO local filtering — the client just renders
// whatever `/api/wallet/earnings?range=…` gives back.
//
// Ranges:  7d · 1m · 1y · custom (from/to date pickers, past dates only).

import { useEffect, useMemo, useRef, useState } from 'react'
import * as api from '@/services/api'
import Loader from '@/components/Loader'
import { StatGridSkeleton, ChartSkeleton } from '@/components/Skeleton'

const fmtRupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`

const RANGE_OPTIONS = [
  { id: '7d',     label: 'Last 7 Days' },
  { id: '1m',     label: '1 Month' },
  { id: '1y',     label: '1 Year' },
  { id: 'custom', label: 'Custom' },
]

// Clamp to YYYY-MM-DD for <input type="date">.
const toInputDate = (d) => {
  const x = d instanceof Date ? d : new Date(d)
  const pad = (n) => String(n).padStart(2, '0')
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`
}

export default function PartnerEarningsPage () {
  const [range, setRange] = useState('7d')
  const today = useMemo(() => new Date(), [])
  const todayStr = useMemo(() => toInputDate(today), [today])
  const defaultFrom = useMemo(() => {
    const d = new Date(today); d.setDate(d.getDate() - 29); return d
  }, [today])
  const defaultFromStr = useMemo(() => toInputDate(defaultFrom), [defaultFrom])

  const [from, setFrom] = useState(defaultFromStr)
  const [to,   setTo]   = useState(todayStr)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Guard against stale responses when the user spams filters.
  const reqSeq = useRef(0)

  const fetchData = (opts) => {
    const id = ++reqSeq.current
    // Keep the previous payload on screen while we fetch so filter toggles
    // don't flash the chart empty and back in. A subtle spinner on the chart
    // card is the only visual cue until the new data actually lands.
    setLoading(true); setError(null)
    api.fetchEarnings(opts)
      .then((r) => { if (id === reqSeq.current) setData(r) })
      .catch((e) => {
        if (id !== reqSeq.current) return
        setError(e?.response?.data?.message || e?.message || 'Failed to load earnings')
      })
      .finally(() => { if (id === reqSeq.current) setLoading(false) })
  }

  // Preset ranges auto-fetch on change. Custom only fetches on Apply so the
  // user can pick both dates before hitting the server.
  useEffect(() => {
    if (range === 'custom') return
    fetchData({ range })
  }, [range])

  const onApplyCustom = () => fetchData({ range: 'custom', from, to })
  const onClearCustom = () => { setFrom(defaultFromStr); setTo(todayStr) }

  const series = data?.series || []
  const hasAny = (data?.total_earned || 0) > 0 && series.some((b) => b.total > 0)
  const max = Math.max(1, ...series.map((b) => b.total || 0))

  // Only the very first load blocks the UI; subsequent fetches keep old data
  // visible and use an inline spinner overlay instead.
  const showFirstLoad = loading && !data

  return (
    <div className="p-5 animate-pgIn max-w-[1200px] mx-auto">
      <div className="font-display font-extrabold text-[22px] text-text mb-4">
        Earnings Analytics
      </div>

      {/* ── Filter strip ──────────────────────────── */}
      <div className="bg-card border border-border rounded-[var(--r)] shadow-card p-3 mb-4">
        <div className="flex flex-wrap gap-1.5">
          {RANGE_OPTIONS.map((opt) => {
            const on = range === opt.id
            return (
              <button key={opt.id}
                onClick={() => setRange(opt.id)}
                className={`px-3 py-1.5 rounded-full text-[12px] font-bold border transition
                            ${on
                              ? 'bg-accent text-white border-accent shadow-[0_3px_10px_rgba(232,65,26,0.25)]'
                              : 'bg-card text-text border-border hover:border-accent hover:text-accent'}`}>
                {opt.label}
              </button>
            )
          })}
        </div>

        {range === 'custom' && (
          <div className="flex flex-wrap items-end gap-2 mt-3 pt-3 border-t border-border">
            {/* Both fields are capped at today — users can backtrack into the
                past but can't pick future dates. From is also capped by To,
                and To is floored by From, so the pair always stays valid. */}
            <DateField label="From" value={from}
              max={to || todayStr}
              onChange={(v) => setFrom(v)} />
            <DateField label="To" value={to}
              min={from}
              max={todayStr}
              onChange={(v) => setTo(v)} />
            <button onClick={onApplyCustom} disabled={loading || !from || !to || from > to}
              className="px-4 py-2 rounded-[var(--rs)] bg-accent text-white text-[12px] font-bold
                         shadow-[0_4px_14px_rgba(232,65,26,0.3)]
                         hover:brightness-90 transition disabled:opacity-60">
              Apply
            </button>
            <button onClick={onClearCustom} disabled={loading}
              className="px-4 py-2 rounded-[var(--rs)] border-[1.5px] border-border bg-card
                         text-text text-[12px] font-semibold hover:border-muted transition
                         disabled:opacity-60">
              Clear
            </button>
          </div>
        )}
      </div>

      {/* ── Summary cards ────────────────────────── */}
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <Summary label="Total Earned" value={fmtRupees(data?.total_earned)} tone="var(--success)" />
        <Summary label="Jobs Paid"    value={data?.jobs_count ?? 0} />
      </div>

      {/* ── Main chart ───────────────────────────── */}
      <div className="relative bg-card border border-border rounded-[var(--r)] shadow-card overflow-hidden">
        <div className="flex items-center justify-between px-[18px] py-3.5 border-b border-border">
          <span className="font-display font-bold text-[13px]">Earnings over time</span>
          <span className="text-[11px] font-semibold text-muted uppercase tracking-[0.5px]">
            {data?.granularity === 'month' ? 'Monthly' : 'Daily'}
          </span>
        </div>

        <div className="px-4 md:px-5 pt-5 pb-4 min-h-[240px]">
          {showFirstLoad ? (
            <div className="flex flex-col gap-4"><StatGridSkeleton count={4} /><ChartSkeleton /></div>
          ) : error ? (
            <div className="py-10 text-center text-[12px] text-[#b91c1c]">{error}</div>
          ) : !hasAny ? (
            <div className="py-10 text-center text-[12px] font-semibold text-muted leading-[1.5]">
              📈 No earnings in this range yet.
            </div>
          ) : (
            <Chart series={series} max={max} granularity={data?.granularity} />
          )}
        </div>

        {/* Inline loading overlay — keeps previous data visible underneath so
            the user sees the filter swap rather than a full reset. */}
        {loading && data && (
          <div className="absolute top-3 right-3 bg-card/90 backdrop-blur-sm
                          border border-border rounded-full px-2.5 py-1
                          flex items-center gap-1.5 shadow-card">
            <Loader size={12} />
            <span className="text-[10px] font-semibold text-muted">Updating…</span>
          </div>
        )}
      </div>
    </div>
  )
}

function DateField ({ label, value, onChange, min, max }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.5px] text-muted">{label}</span>
      <input type="date" value={value}
        min={min} max={max}
        onChange={(e) => onChange(e.target.value)}
        className="px-2.5 py-1.5 rounded-[var(--rs)] border-[1.5px] border-border bg-card
                   text-[12px] text-text outline-none focus:border-accent transition" />
    </label>
  )
}

function Summary ({ label, value, tone }) {
  return (
    <div className="bg-card border border-border rounded-[var(--r)] shadow-card p-4 text-center">
      <div className="font-display font-extrabold text-[20px] md:text-[22px] leading-none"
        style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.3px] text-muted mt-1.5">
        {label}
      </div>
    </div>
  )
}

// Bar chart — same div-based technique as the dashboard's 7-day chart, but
// scaled to arbitrary bucket counts (7 → ~30 → 12 → N). Hover reveals the
// exact figure; labels thin out automatically when there are too many bars.
function Chart ({ series, max, granularity }) {
  const labelEvery = useMemo(() => {
    if (series.length <= 10) return 1
    if (series.length <= 20) return 2
    if (series.length <= 40) return 4
    return Math.ceil(series.length / 10)
  }, [series.length])

  return (
    <>
      <div className="flex items-end justify-between gap-1 md:gap-1.5 h-[180px] mb-2">
        {series.map((b) => {
          const pct = b.total ? Math.max(4, (b.total / max) * 100) : 4
          const empty = b.total === 0
          return (
            <div key={b.key} className="flex-1 relative group cursor-default min-w-0">
              <div
                className={`w-full rounded-t-md rounded-b-[2px] transition-all
                            ${empty ? 'opacity-50' : ''}`}
                style={{
                  height: `${pct}%`,
                  minHeight: '4px',
                  background: empty
                    ? 'var(--border)'
                    : 'linear-gradient(180deg, var(--accent), #f97316)',
                  position: 'absolute',
                  bottom: 0, left: 0, right: 0,
                }}/>
              <span
                className="absolute left-1/2 -translate-x-1/2 -top-6 whitespace-nowrap z-10
                           bg-text text-white text-[10px] font-extrabold px-2 py-[3px] rounded-md
                           opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                {fmtRupees(b.total)}{b.jobs ? ` · ${b.jobs} jobs` : ''}
              </span>
              <div className="h-[180px]"/>
            </div>
          )
        })}
      </div>
      <div className="flex justify-between gap-1 md:gap-1.5">
        {series.map((b, i) => {
          const show = i % labelEvery === 0 || i === series.length - 1
          return (
            <span key={b.key} className="flex-1 text-center text-[9px] font-bold text-muted
                                         uppercase tracking-[0.4px] truncate min-w-0">
              {show ? (granularity === 'month' ? b.short : b.short || b.key.slice(5)) : ''}
            </span>
          )
        })}
      </div>
    </>
  )
}
