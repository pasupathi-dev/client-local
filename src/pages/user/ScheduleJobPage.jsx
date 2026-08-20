// Customer schedule-job form — compact 2-step flow:
//   1) Pick a day  (quick day chips + calendar fallback)
//   2) Pick a time slot
// Service is the partner's category (no manual picker).
// Service address comes from the customer's saved profile (no manual entry).
// Notes are optional.

import { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  loadPartnerDetail, selectPartnerDetail, clearDetail,
} from '@/features/catalog/catalogSlice'
import { createScheduleThunk } from '@/features/schedule/scheduleSlice'
import { selectProfile } from '@/features/profile/profileSlice'
import { formatPrice } from '@/utils/format'
import * as api from '@/services/api'

const TIME_SLOTS = [
  '08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
  '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM', '06:00 PM',
]

// 7 quick day chips starting tomorrow.
const QUICK_DAYS = () => {
  const out = []
  const base = new Date()
  for (let i = 1; i <= 7; i++) {
    const d = new Date(base); d.setDate(base.getDate() + i)
    out.push({
      iso:   d.toISOString().slice(0, 10),
      day:   d.toLocaleDateString(undefined, { day: '2-digit' }),
      mon:   d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase(),
      wkday: d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase(),
    })
  }
  return out
}

const tomorrowISO = () => {
  const d = new Date(); d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

const initialsOf = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase() || 'P'

const formatNice = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' })
}

export default function ScheduleJobPage () {
  const { id } = useParams()
  const [qp]   = useSearchParams()
  const browseWork = qp.get('work') || null
  const dispatch = useDispatch()
  const nav = useNavigate()
  const data = useSelector(selectPartnerDetail)
  const me = useSelector(selectProfile)

  const [date, setDate]   = useState('')
  const [slot, setSlot]   = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState('')
  // L52 — optional pre-payment to firm up the slot.
  const [advancePct, setAdvancePct] = useState(0)  // 0 = skip
  // M83 — Partner's blocked dates. Fetched once; used to hide quick-pick
  // chips and reject the date input. Customer still gets a server 409 if
  // they bypass these checks somehow (e.g. older client).
  const [blockedDates, setBlockedDates] = useState([])

  useEffect(() => {
    if (id) dispatch(loadPartnerDetail({ id }))
    return () => dispatch(clearDetail())
  }, [id, dispatch])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    api.fetchPartnerBlockedDates(id)
      .then((r) => { if (!cancelled) setBlockedDates(r?.blocked || []) })
      .catch(() => { if (!cancelled) setBlockedDates([]) })
    return () => { cancelled = true }
  }, [id])

  const isBlocked = (iso) => !!iso && blockedDates.includes(iso)

  const p = data?.partner
  // Effective WORK to schedule: the browsed work if this partner serves it,
  // else their primary_work, else any priced work.
  const cat = useMemo(() => {
    const prices = p?.work_prices || []
    const serves = (w) => w && (w === p?.primary_work || prices.some((cp) => cp.work_name === w))
    if (serves(browseWork)) return browseWork
    return p?.primary_work || prices[0]?.work_name || p?.primary_category || 'Service'
  }, [p, browseWork])
  const days = useMemo(() => QUICK_DAYS(), [])

  const primaryPrice = useMemo(() => {
    if (!p) return null
    const prices = p.work_prices || []
    const own = prices.find((cp) => cp.work_name === cat)
    return own?.base_price ?? prices[0]?.base_price ?? null
  }, [p, cat])

  const canSubmit = !!date && !!slot && !busy

  const submit = async () => {
    setError('')
    if (!canSubmit) return
    if (!me?.address) {
      setError('Please add your address in your profile before booking.')
      return
    }
    setBusy(true)
    try {
      const advanceAmount = advancePct > 0
        ? Math.round(((primaryPrice || 0) * advancePct) / 100)
        : 0
      await dispatch(createScheduleThunk({
        partner_id:    p.user_id,
        work_name:     cat,
        // Server requires `service` — the work the partner is being booked for.
        service:       cat,
        service_icon:  p.service_icon || null,
        base_price:    primaryPrice || 0,
        schedule_date: date,
        time_slot:     slot,
        notes,
        // L52 — commitment value the server stores on the schedule row.
        advance_amount: advanceAmount || undefined,
      })).unwrap()
      nav('/scheduled')
    } catch (e) {
      setError(e?.message || 'Failed to schedule. Try again.')
      setBusy(false)
    }
  }

  if (!data) return <div className="p-6 text-muted">Loading partner…</div>
  if (!p)    return <div className="p-6 text-muted">Partner not found.</div>

  const avatarCls = p.avatar_class || 'pav-a'
  const meAddress = me?.address || ''
  const meCity    = me?.city || ''
  const mePin     = me?.pincode || ''

  return (
    <div className="min-h-full bg-surface">
      {/* ── Compact navy hero ────────────────────────────────────── */}
      <div className="relative overflow-hidden text-white"
           style={{ background: 'linear-gradient(160deg, var(--brand) 0%, #1e2d4a 100%)' }}>
        <div className="pointer-events-none absolute -top-6 -right-8 w-[160px] h-[160px]
                        rounded-full bg-[rgba(232,65,26,0.06)]" />

        <div className="relative z-[1] max-w-[820px] mx-auto px-4 md:px-6 pt-4 pb-5">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => nav(-1)}
              className="w-9 h-9 rounded-full bg-white/10 border border-white/20
                         text-white/80 hover:bg-white/20 transition">
              ←
            </button>
            <div className="flex-1 min-w-0">
              <div className="font-display font-extrabold text-[19px] md:text-[21px] leading-tight">
                Schedule a Booking
              </div>
              <div className="text-[11.5px] text-white/55 mt-0.5">
                Pick the day and a time slot — we'll send it for review.
              </div>
            </div>
          </div>

          {/* Combined partner + booking summary card */}
          <div className="bg-white/[0.07] rounded-[var(--r)] border border-white/[0.08]
                          p-3 grid grid-cols-[auto_1fr_auto] items-center gap-3">
            <div className={`w-11 h-11 rounded-full flex items-center justify-center
                             font-extrabold text-[13px] border-[2px] border-white/25 shrink-0
                             ${avatarCls}`}>
              {initialsOf(p.full_name)}
            </div>
            <div className="min-w-0">
              <div className="font-display font-extrabold text-[14px] text-white truncate">
                {p.full_name || 'Partner'}
              </div>
              <div className="text-[11px] text-white/60 truncate">
                {cat} · {formatPrice(primaryPrice)} / visit
              </div>
            </div>
            <div className="text-right pl-1 border-l border-white/10 pr-0.5">
              <div className="text-[9px] font-bold uppercase tracking-[0.5px] text-white/45">
                Booking
              </div>
              <div className="font-display font-extrabold text-[12.5px] text-white leading-tight">
                {date ? formatNice(date) : 'Pick a day'}
              </div>
              <div className="text-[10.5px] text-white/55 leading-tight">
                {slot || 'Pick a time'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Form body ────────────────────────────────────────────── */}
      <div className="max-w-[820px] mx-auto px-4 md:px-6 py-4 flex flex-col gap-3">

        {/* Day picker — quick chips + calendar fallback */}
        <Card>
          <CardHead step="1" title="Pick a day" hint="Earliest is tomorrow" />
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 mb-3">
            {days.map((d) => {
              const on = date === d.iso
              const blocked = isBlocked(d.iso)
              return (
                <button key={d.iso} type="button"
                  onClick={() => !blocked && setDate(d.iso)}
                  disabled={blocked}
                  title={blocked ? 'Partner unavailable on this day' : ''}
                  className={`flex flex-col items-center justify-center py-2 rounded-[var(--rs)]
                              border-[1.5px] transition leading-tight relative
                              ${blocked
                                ? 'bg-surface border-border text-muted opacity-50 cursor-not-allowed line-through'
                                : on
                                  ? 'bg-accent border-accent text-white shadow-[0_3px_10px_rgba(232,65,26,0.25)]'
                                  : 'bg-card border-border text-text hover:border-accent hover:text-accent'}`}>
                  <span className={`text-[9px] font-bold ${on ? 'text-white/70' : 'text-muted'}`}>
                    {d.wkday}
                  </span>
                  <span className="font-display font-extrabold text-[15px]">{d.day}</span>
                  <span className={`text-[9px] font-semibold ${on ? 'text-white/70' : 'text-muted'}`}>
                    {d.mon}
                  </span>
                </button>
              )
            })}
          </div>
          <details className="group">
            <summary className="text-[11.5px] text-muted cursor-pointer select-none
                                hover:text-accent transition flex items-center gap-1.5">
              <span className="group-open:rotate-90 transition">▸</span>
              Or choose another date
            </summary>
            <input type="date" value={date} min={tomorrowISO()}
              onChange={(e) => {
                const next = e.target.value
                if (isBlocked(next)) {
                  setError('Partner is not available on that day.')
                  return
                }
                setError('')
                setDate(next)
              }}
              className="mt-2 w-full px-3 py-2.5 rounded-[var(--rs)] border-[1.5px] border-border
                         bg-card text-[13.5px] text-text outline-none focus:border-accent transition" />
          </details>
          {/* M83 — surface the blocked dates as small chips so the customer
              understands why some days are greyed out. */}
          {blockedDates.length > 0 && (
            <div className="text-[10.5px] text-muted mt-2 leading-[1.55]">
              <span className="font-bold">Unavailable:</span>{' '}
              {blockedDates.slice(0, 5).map((d, i) => (
                <span key={d}>
                  {new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                  {i < Math.min(blockedDates.length, 5) - 1 ? ', ' : ''}
                </span>
              ))}
              {blockedDates.length > 5 && <span> +{blockedDates.length - 5} more</span>}
            </div>
          )}
        </Card>

        {/* Time slot */}
        <Card>
          <CardHead step="2" title="Pick a time slot" hint="Tap to select" />
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
            {TIME_SLOTS.map((t) => {
              const on = slot === t
              return (
                <button key={t} type="button" onClick={() => setSlot(t)}
                  className={`px-2 py-2 rounded-[var(--rs)] text-[12px] font-semibold
                              border-[1.5px] transition whitespace-nowrap
                              ${on
                                ? 'bg-accent border-accent text-white shadow-[0_3px_10px_rgba(232,65,26,0.25)]'
                                : 'bg-card border-border text-text hover:border-accent hover:text-accent'}`}>
                  {t}
                </button>
              )
            })}
          </div>
        </Card>

        {/* Saved-address read-only confirmation */}
        <Card>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center text-[15px] shrink-0"
                 style={{ background: '#fee2e2', color: '#b91c1c' }}>📍</div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-muted">
                Service address
              </div>
              <div className="text-[13px] font-semibold text-text leading-snug">
                {meAddress
                  ? `${meAddress}${meCity ? `, ${meCity}` : ''}${mePin ? ` - ${mePin}` : ''}`
                  : <span className="text-[#b91c1c]">No address on profile — please add one before booking.</span>}
              </div>
              {meAddress && (
                <button onClick={() => nav('/profile/edit')}
                  className="text-[11px] text-accent font-bold mt-1 hover:underline">
                  Change address →
                </button>
              )}
            </div>
          </div>
        </Card>

        {/* L52 — optional advance to firm up the slot. */}
        <Card>
          <CardHead step="3" title="Confirm with advance?"
            hint="Optional — refundable if cancelled 4 h+ before the slot" />
          <div className="flex flex-wrap gap-1.5">
            {[
              { pct: 0,  label: 'Skip' },
              { pct: 10, label: '10%' },
              { pct: 20, label: '20% (recommended)' },
              { pct: 50, label: '50%' },
            ].map((c) => {
              const on = advancePct === c.pct
              return (
                <button key={c.pct} type="button"
                  onClick={() => setAdvancePct(c.pct)}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border
                              ${on
                                ? 'border-accent bg-accent/10 text-accent'
                                : 'border-border bg-card text-muted hover:border-muted'}`}>
                  {c.label}
                </button>
              )
            })}
          </div>
          {advancePct > 0 && primaryPrice && (
            <div className="mt-2 text-[11.5px] text-muted">
              You'll commit ₹{Math.round((primaryPrice * advancePct) / 100)} now. Remaining
              balance is paid after the job. Cancellations 4 h+ before the slot are fully refundable.
            </div>
          )}
        </Card>

        {/* Notes — optional */}
        <Card>
          <CardHead step="4" title="Notes" hint="Optional — helps the partner prepare" />
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. AC not cooling well, gas refill may be needed…"
            className="w-full px-3 py-2.5 rounded-[var(--rs)] border-[1.5px] border-border
                       bg-card text-[13px] text-text outline-none focus:border-accent
                       resize-none transition" />
        </Card>

        {error && (
          <div className="text-[12px] text-[#ef4444] bg-[#fee2e2] rounded-[var(--rs)] px-3 py-2">
            {error}
          </div>
        )}

        {/* Confirm — sits in normal flow at the end of the form */}
        <Card>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-muted">
                Total (base)
              </div>
              <div className="font-display font-extrabold text-[17px] text-text leading-none">
                {formatPrice(primaryPrice)}
              </div>
            </div>
            <button onClick={submit} disabled={!canSubmit}
              className="px-5 md:px-6 py-2.5 rounded-[var(--rs)] bg-accent text-white
                         font-display font-extrabold text-[13.5px]
                         shadow-[0_4px_14px_rgba(232,65,26,0.35)]
                         hover:brightness-90 transition
                         disabled:bg-border disabled:text-muted disabled:shadow-none">
              {busy ? 'Scheduling…' : '📅 Confirm Booking →'}
            </button>
          </div>
        </Card>
      </div>
    </div>
  )
}

function Card ({ children }) {
  return (
    <section className="bg-card rounded-[var(--r)] border border-border p-3.5 md:p-4 shadow-card">
      {children}
    </section>
  )
}

function CardHead ({ step, title, hint }) {
  return (
    <div className="flex items-start gap-2.5 mb-3">
      <div className="w-6 h-6 rounded-full bg-accent/10 text-accent grid place-items-center
                      text-[11px] font-display font-extrabold shrink-0">
        {step}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-display font-extrabold text-[13px] text-text leading-tight">{title}</div>
        {hint && <div className="text-[11px] text-muted mt-0.5">{hint}</div>}
      </div>
    </div>
  )
}
