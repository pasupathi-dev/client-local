// Shared "active job in progress" banner. Used on both first pages:
//   - User  home (HomeLandingPage)
//   - Partner dashboard (PartnerDashboardPage)
//
// Renders as a full-width horizontal strip pinned to the top of the
// page so the active job is the unmistakable hero — the location chip,
// greeting, and discovery hero card slot in below without fighting for
// space the way the old sidebar layout did.
//
// Renders nothing when there's no active job or the job's in a terminal
// state (paid / cancelled). Tap the CTA → routes to the right page per
// role: partner → /partner/work, customer → /my-jobs.

import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'

const NON_TERMINAL = new Set([
  'accepted', 'priceConfirmed', 'travelling', 'arrived', 'working', 'completed',
])

// Human label for a job state — keeps the copy consistent across roles.
const STATE_LABEL = {
  accepted:        'Awaiting price confirmation',
  priceConfirmed:  'Heading out',
  travelling:      'On the way',
  arrived:         'Arrived at location',
  working:         'Work in progress',
  completed:       'Awaiting payment',
}

export default function ActiveJobBanner ({ job, role = 'user', compact = false, floating = false }) {
  const nav = useNavigate()
  if (!job || !NON_TERMINAL.has(job.state)) return null

  const isPartner  = role === 'partner'
  const otherParty = isPartner
    ? (job.customer_name || 'Customer')
    : (job.partner_name  || 'Partner')
  const target = isPartner ? '/partner/work' : '/my-jobs'
  const cta    = isPartner ? 'Open job →'    : 'View progress →'
  const kicker = isPartner ? 'You are on a job' : 'Job in progress'

  const banner = (
    <div
      role="status"
      className={`relative overflow-hidden rounded-ds-lg border bg-card shadow-ds-md
                 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4
                 px-4 sm:px-5 py-3 sm:py-3.5
                 ${compact ? 'w-full sm:w-fit sm:max-w-full' : 'w-full'}`}
      style={{ borderColor: 'rgba(255,90,31,0.35)',
               background: 'linear-gradient(90deg, var(--brand-soft) 0%, #FFFFFF 55%)' }}>
      {/* Left — pulsing dot + kicker. shrink-0 keeps it readable on
          narrow viewports while the middle column wraps. */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="relative shrink-0">
          <span className="block w-2.5 h-2.5 rounded-full bg-accent"
                style={{ animation: 'pulse 1.8s infinite',
                         boxShadow: '0 0 0 0 var(--brand-glow)' }} />
          <span aria-hidden="true"
                className="absolute inset-0 -m-1 rounded-full bg-accent/30"
                style={{ animation: 'radarRing 2.2s ease-out infinite' }} />
        </div>
        <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-accent whitespace-nowrap">
          {kicker}
        </div>
      </div>

      {/* Middle — service / party / status / price. Truncates rather
          than wrapping so the banner stays one row on desktop. */}
      <div className="flex-1 min-w-0">
        <div className="font-display font-semibold text-[14px] md:text-[15.5px] text-ink truncate">
          {(job.service || 'Service')} <span className="text-muted font-normal">·</span> {otherParty}
        </div>
        <div className="text-[11.5px] md:text-[12px] text-muted leading-[1.45] truncate">
          {STATE_LABEL[job.state] || job.state}
          {job.agreed_price
            ? <> <span className="opacity-50">·</span> ₹{Number(job.agreed_price).toLocaleString('en-IN')}</>
            : null}
        </div>
      </div>

      {/* Right — CTA. Full width on mobile, natural width on desktop. */}
      <button onClick={() => nav(target)}
        className="shrink-0 inline-flex items-center justify-center gap-2
                   px-4 py-2 rounded-full bg-accent text-white
                   font-semibold text-[12px] sm:text-[12.5px]
                   hover:brightness-95 transition shadow-glow
                   w-full sm:w-auto">
        {cta}
      </button>
    </div>
  )

  if (!floating) return banner

  // Floating mode: a small pill pinned bottom-RIGHT (above the mobile bottom
  // nav). Collapsed it shows just the pulsing dot + kicker; on hover it expands
  // leftward to reveal the full service / status / price + CTA. Portaled to
  // <body> so no ancestor transform/overflow can clip the fixed element.
  const price = job.agreed_price ? Number(job.agreed_price).toLocaleString('en-IN') : null
  const floatingBar = (
    <div className="fixed right-4 bottom-[80px] md:bottom-4 z-[150] group">
      <button type="button" onClick={() => nav(target)} role="status"
        aria-label={`${kicker} — ${job.service || 'Service'}. ${cta}`}
        className="flex items-center gap-2.5 rounded-full border bg-card py-2.5 pl-3 pr-4
                   shadow-[0_12px_40px_rgba(0,0,0,0.18)] transition-shadow
                   hover:shadow-[0_16px_50px_rgba(0,0,0,0.24)]"
        style={{ borderColor: 'rgba(255,90,31,0.35)',
                 background: 'linear-gradient(90deg, var(--brand-soft) 0%, #FFFFFF 60%)' }}>
        {/* Pulsing dot — always visible */}
        <span className="relative shrink-0">
          <span className="block w-2.5 h-2.5 rounded-full bg-accent"
                style={{ animation: 'pulse 1.8s infinite', boxShadow: '0 0 0 0 var(--brand-glow)' }} />
          <span aria-hidden className="absolute inset-0 -m-1 rounded-full bg-accent/30"
                style={{ animation: 'radarRing 2.2s ease-out infinite' }} />
        </span>

        {/* Kicker — always visible (the small collapsed label) */}
        <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-accent whitespace-nowrap">
          {kicker}
        </span>

        {/* Detail — collapsed to 0 width; expands on hover */}
        <span className="flex items-center gap-3 max-w-0 opacity-0 overflow-hidden
                         transition-all duration-300 ease-out
                         group-hover:max-w-[460px] group-hover:opacity-100">
          <span aria-hidden className="w-px self-stretch bg-border shrink-0" />
          <span className="text-left min-w-0">
            <span className="block font-display font-semibold text-[13px] text-ink whitespace-nowrap">
              {(job.service || 'Service')} <span className="text-muted font-normal">·</span> {otherParty}
            </span>
            <span className="block text-[11.5px] text-muted whitespace-nowrap">
              {STATE_LABEL[job.state] || job.state}{price ? ` · ₹${price}` : ''}
            </span>
          </span>
          <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-accent text-white
                           font-semibold text-[12px] px-4 py-1.5 whitespace-nowrap shadow-glow">
            {cta}
          </span>
        </span>
      </button>
    </div>
  )

  return createPortal(floatingBar, document.body)
}
