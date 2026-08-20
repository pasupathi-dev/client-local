// Shared Scheduled Job card — used on both the customer's /scheduled page
// and the partner's /partner/scheduled page. The `viewer` prop determines
// whose avatar + name to show and which action buttons are available.

import { formatPrice } from '@/utils/format'

const AV_CLASSES = ['pav-a','pav-b','pav-c','pav-d','pav-e']
const hashToAv = (seed = '') => {
  let h = 0
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AV_CLASSES[h % AV_CLASSES.length]
}
const initialsOf = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase() || '?'

const CAT_ICON = {
  Carpenter: '🔨', Electrician: '⚡', Plumber: '🚿', Mechanic: '🔧',
  Painter: '🎨', 'AC Repair': '❄️', Cleaning: '🧹', Tiling: '🔲',
  Welding: '🔩', 'Pest Control': '🐛', Laundry: '👕', Gardening: '🌱',
  'TV Repair': '📺', Cooking: '🍳', Driver: '🚗', Security: '🔒',
}

const formatDate = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

// Status → badge style.
const STATUS_BADGE = {
  pending:   { bg: '#fef3c7', fg: '#92400e', label: '⏳ Pending Review' },
  accepted:  { bg: '#dcfce7', fg: '#166534', label: '✓ Confirmed' },
  declined:  { bg: '#fee2e2', fg: '#b91c1c', label: '✗ Declined' },
  cancelled: { bg: '#f3f4f6', fg: '#4b5563', label: '🚫 Cancelled' },
}

// Returns true when the scheduled time is within 30 minutes from now (or past).
function isStartable (job) {
  if (!job.scheduled_at) return false
  const scheduledMs = new Date(job.scheduled_at).getTime()
  if (Number.isNaN(scheduledMs)) return false
  return scheduledMs <= Date.now() + 30 * 60 * 1000
}

export default function ScheduledJobCard ({
  job, viewer = 'customer',
  onAccept, onDecline, onCancel, onStart, onView,
  busy,
}) {
  const status     = job.status || 'pending'
  const badge      = STATUS_BADGE[status] || STATUS_BADGE.pending
  const isTerminal = status === 'declined' || status === 'cancelled' || status === 'converted'
  const canStart   = viewer === 'partner' && status === 'accepted' && isStartable(job)

  // "Other party" — whom to display.
  const otherName = viewer === 'partner' ? job.customer_name : job.partner_name
  const otherAv   = (viewer === 'partner' ? job.customer_av_class : job.partner_av_class)
                    || hashToAv(otherName)
  const otherIni  = (viewer === 'partner' ? job.customer_initials : job.partner_initials)
                    || initialsOf(otherName)

  const icon = job.service_icon || CAT_ICON[job.category_name] || '🧰'

  return (
    <div className={`bg-card rounded-[var(--r)] border border-border p-4 shadow-card
                     flex flex-col gap-3 transition
                     ${isTerminal ? 'opacity-60' : ''}`}>
      {/* Top: status + date/time */}
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center px-2 py-[3px] rounded-xl text-[10px] font-bold"
              style={{ background: badge.bg, color: badge.fg }}>
          {badge.label}
        </span>
        <span className="text-[11px] font-bold text-[#3b82f6]">
          {formatDate(job.schedule_date)}{job.time_slot ? ` • ${job.time_slot}` : ''}
        </span>
      </div>

      {/* Body */}
      <div className="flex items-center gap-3">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center
                         font-bold text-[13px] shrink-0 ${otherAv}`}>
          {otherIni}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-extrabold text-[14px] text-text truncate">
            {otherName || (viewer === 'partner' ? 'Customer' : 'Partner')}
          </div>
          <div className="text-[11px] text-muted leading-[1.5]">
            {icon} {job.service || job.category_name || '—'} • {formatPrice(job.base_price)}
            {/* Address stays hidden in scheduled cards. The partner only sees
                the customer's location after they start the job AND the price
                is confirmed (gated in PartnerWorkPage). Customers see their
                own saved address on their own scheduled card. */}
            {viewer === 'user' && job.customer_address
              && <><br />📍 {job.customer_address}</>}
          </div>
        </div>
      </div>

      {/* Optional notes */}
      {job.notes && (
        <div className="text-[11px] text-muted italic leading-[1.6] pl-2 border-l-2 border-accent">
          📝 {job.notes}
        </div>
      )}

      {/* Terminal status footer */}
      {isTerminal && (
        <div className="text-[11px] text-muted border-t border-border pt-2">
          {job.cancel_reason
            ? <>Reason: <span className="text-text font-semibold">{job.cancel_reason}</span></>
            : status === 'declined'
              ? 'Partner declined this booking.'
              : `Cancelled by ${job.cancelled_by === 'partner' ? 'partner' : 'you'}.`}
        </div>
      )}

      {/* Actions */}
      {!isTerminal && (
        <div className="flex gap-2">
          <button onClick={() => onView?.(job)}
            className="flex-1 py-2 rounded-[var(--rs)] border-[1.5px] border-border bg-card
                       text-text text-[12px] font-bold hover:border-muted transition">
            👁 Details
          </button>

          {viewer === 'partner' && status === 'pending' && (
            <>
              <button onClick={() => onDecline?.(job)} disabled={busy}
                className="flex-1 py-2 rounded-[var(--rs)] border-[1.5px] border-[#fee2e2] bg-card
                           text-[#ef4444] text-[12px] font-bold hover:border-[#ef4444] transition
                           disabled:opacity-60">
                ✗ Decline
              </button>
              <button onClick={() => onAccept?.(job)} disabled={busy}
                className="flex-[1.2] py-2 rounded-[var(--rs)] bg-success text-white
                           text-[12px] font-bold hover:brightness-90 transition
                           disabled:opacity-60">
                ✓ Accept
              </button>
            </>
          )}

          {status === 'accepted' && viewer === 'partner' && (
            <>
              {canStart && (
                <button onClick={() => onStart?.(job)} disabled={busy}
                  className="flex-[1.4] py-2 rounded-[var(--rs)] text-white
                             text-[12px] font-bold hover:brightness-90 transition
                             disabled:opacity-60"
                  style={{ background: '#3b82f6' }}>
                  ▶ Start Now
                </button>
              )}
              <button onClick={() => onCancel?.(job)} disabled={busy}
                className="flex-1 py-2 rounded-[var(--rs)] border-[1.5px] border-[#fee2e2] bg-card
                           text-[#ef4444] text-[12px] font-bold hover:border-[#ef4444] transition
                           disabled:opacity-60">
                ✗ Cancel
              </button>
            </>
          )}
          {status === 'accepted' && viewer === 'customer' && (
            <button onClick={() => onCancel?.(job)} disabled={busy}
              className="flex-1 py-2 rounded-[var(--rs)] border-[1.5px] border-[#fee2e2] bg-card
                         text-[#ef4444] text-[12px] font-bold hover:border-[#ef4444] transition
                         disabled:opacity-60">
              ✗ Cancel booking
            </button>
          )}

          {viewer === 'customer' && status === 'pending' && (
            <button onClick={() => onCancel?.(job)} disabled={busy}
              className="flex-1 py-2 rounded-[var(--rs)] border-[1.5px] border-[#fee2e2] bg-card
                         text-[#ef4444] text-[12px] font-bold hover:border-[#ef4444] transition
                         disabled:opacity-60">
              ✗ Cancel
            </button>
          )}
        </div>
      )}
    </div>
  )
}
