// H65 — Help & Support landing page. Same component for customer + partner
// with role-aware FAQs. Adds three quick-action paths the spec called for:
// "Chat with us" via WhatsApp deeplink, "Email us" with a pre-filled
// mailto including the latest job context, and "Report a bug" (POSTs to
// /api/support/bug which fans out to admin notifications).

import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { selectMode, pushToast } from '@/features/app/appSlice'
import { selectProfile } from '@/features/profile/profileSlice'
import * as api from '@/services/api'
import Loader from '@/components/Loader'

// Single source of truth for support contact details — read from Vite
// env so a different deployment can swap numbers without code changes.
// Sensible dev fallbacks are kept so a clone-and-run still has clickable
// buttons; production builds should always override via .env.
const SUPPORT_WHATSAPP = import.meta.env.VITE_SUPPORT_WHATSAPP || '919876543210'
const SUPPORT_PHONE    = import.meta.env.VITE_SUPPORT_PHONE    || '+91 98765 43210'
const SUPPORT_EMAIL    = import.meta.env.VITE_SUPPORT_EMAIL    || 'help@servicelink.in'

function PageHeader ({ title, onBack }) {
  return (
    <div className="px-5 py-4 flex items-center gap-3">
      <button onClick={onBack}
        className="w-[34px] h-[34px] rounded-full bg-surface border-[1.5px] border-border
                   flex items-center justify-center text-muted hover:text-text transition">
        ←
      </button>
      <h1 className="font-display font-extrabold text-[17px]">{title}</h1>
    </div>
  )
}

const PARTNER_FAQS = [
  { q: 'How do I get my first job?',
    a: 'Go online from your Dashboard. Customers within your service radius will see you on the map and can send instant or scheduled requests.' },
  { q: 'When will my earnings be credited?',
    a: 'After a customer pays, the amount appears in Pending. It clears to your Available balance a few seconds later and you can withdraw after linking a bank account.' },
  { q: 'What is the minimum withdrawal amount?',
    a: 'The minimum withdrawal is ₹1,500. Withdrawals are processed via IMPS and usually complete within a few minutes.' },
  { q: 'How do I cancel an accepted job?',
    a: 'Open the Active Job tab, tap Cancel, choose a reason, and confirm. Frequent cancellations can affect your completion rate.' },
  { q: "What if a customer doesn't pay?",
    a: 'Once you mark a job complete, the customer is prompted to pay. If they don\'t pay within a reasonable window our support team reaches out on your behalf.' },
]

const USER_FAQS = [
  { q: 'How do I book a service?',
    a: 'Pick a category from the home page, then choose a partner or hit "Find one for me" to auto-match. Confirm the address, attach photos if useful, and send the request — the partner has 30 seconds to accept.' },
  { q: 'When am I charged?',
    a: 'You only pay after the partner marks the job complete. Open the job from My Jobs, review the bill, tap Pay, and choose UPI / card / cash.' },
  { q: 'Can I add a tip?',
    a: 'Yes — on the payment page you\'ll see chips for ₹20 / ₹50 / ₹100 or a custom amount. The tip is added on top of the bill and goes to the partner.' },
  { q: 'Something went wrong with my job — what can I do?',
    a: 'Open the job from My Jobs and tap "Report a problem". You have 48 hours from payment to raise a dispute. Our team reviews every report and replies within a day.' },
  { q: 'How do I cancel a request before a partner accepts?',
    a: 'On the waiting screen there\'s a Cancel button. Once a partner has accepted, you can still cancel from the active job page, but cancellation fees may apply for late cancellations.' },
  { q: 'How do reviews work?',
    a: 'After you pay we ask for a 1–5 star rating. We surface a few quick chips ("On time", "Fair price"…) you can tap. The partner can post one public reply.' },
]

function ContactRow ({ icon, bg, fg, title, sub, onClick }) {
  return (
    <button type="button" onClick={onClick}
      className="w-full bg-card border border-border rounded-[var(--r)] px-[18px] py-3.5
                 flex items-center gap-3 text-left hover:border-accent transition">
      <div className="w-[38px] h-[38px] rounded-[var(--rs)] flex items-center justify-center text-[17px] shrink-0"
        style={{ background: bg, color: fg }}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-text truncate">{title}</div>
        {sub && <div className="text-[11px] text-muted mt-0.5 truncate">{sub}</div>}
      </div>
      <span className="text-lg text-muted font-light">›</span>
    </button>
  )
}

// H65 — Compose the pre-filled mailto for "Email us". Includes the user's
// name + the latest job's id/service so support can look it up without a
// back-and-forth ask.
function composeMailto ({ name, recentJob }) {
  const subject = 'ServiceLink — Help request'
  const lines = []
  lines.push('Hi support team,')
  lines.push('')
  lines.push('I need help with the following:')
  lines.push('[Describe your issue here]')
  lines.push('')
  lines.push('— My account —')
  if (name) lines.push(`Name: ${name}`)
  if (recentJob) {
    lines.push(`Recent job: #${recentJob.id} · ${recentJob.service || 'Service'}`)
    if (recentJob.state) lines.push(`Job state: ${recentJob.state}`)
  }
  const body = lines.join('\n')
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

// H65 — Compose the WhatsApp deep-link. wa.me handles platforms; the
// pre-filled text is short on purpose so users can edit before sending.
function composeWhatsApp ({ name }) {
  const text = `Hi ServiceLink team — I need help.${name ? ` This is ${name}.` : ''}`
  return `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(text)}`
}

function BugReportForm ({ recentJobId, onClose }) {
  const dispatch = useDispatch()
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const route = typeof window !== 'undefined' ? window.location.pathname : ''

  const submit = async () => {
    const note = body.trim()
    if (!note || busy) return
    setBusy(true)
    try {
      await api.reportBug({ body: note, route, jobId: recentJobId || null })
      dispatch(pushToast({ text: 'Reported — our team will follow up' }))
      onClose?.()
    } catch (err) {
      dispatch(pushToast({ text: err?.response?.data?.message || 'Could not send', type: 'error' }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, 2000))}
        placeholder="What happened? Include steps if you can — screenshot URL is OK too."
        rows={4}
        className="w-full bg-card border border-border rounded-[10px]
                   px-3 py-2.5 text-[13px] text-text placeholder:text-muted
                   focus:outline-none focus:border-accent resize-none" />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted">{body.length}/2000</span>
        <div className="flex gap-2">
          <button onClick={onClose} disabled={busy}
            className="text-[11.5px] font-bold px-3 py-1.5 rounded-full
                       border border-border bg-card text-muted hover:text-text transition
                       disabled:opacity-60">
            Cancel
          </button>
          <button onClick={submit} disabled={busy || !body.trim()}
            className="text-[11.5px] font-bold px-4 py-1.5 rounded-full
                       bg-accent text-white hover:brightness-90 transition
                       disabled:opacity-50 disabled:cursor-not-allowed">
            {busy ? 'Sending…' : 'Send to support'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function HelpPage () {
  const nav = useNavigate()
  const dispatch = useDispatch()
  const mode = useSelector(selectMode)
  const profile = useSelector(selectProfile)
  const isPartner = mode === 'partner'
  const FAQS = isPartner ? PARTNER_FAQS : USER_FAQS

  // H65 — most recent job for mailto + bug report context. Best-effort —
  // if it fails the contact links still work without the job context.
  const [recentJob, setRecentJob] = useState(null)
  useEffect(() => {
    let cancelled = false
    api.fetchMyJobs(isPartner ? 'partner' : 'customer', { limit: 1, offset: 0 })
      .then((r) => {
        if (cancelled) return
        const row = (r?.jobs && r.jobs[0]) || (r?.rows && r.rows[0]) || null
        if (row) setRecentJob({ id: row.id, service: row.service, state: row.state })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [isPartner])

  const [bugOpen, setBugOpen] = useState(false)

  const onWhatsApp = () => {
    window.open(composeWhatsApp({ name: profile?.full_name }), '_blank', 'noopener')
  }
  const onEmail = () => {
    window.location.href = composeMailto({ name: profile?.full_name, recentJob })
  }
  const onCall = () => { window.location.href = `tel:${SUPPORT_PHONE.replace(/\s+/g, '')}` }

  return (
    <div className="min-h-full animate-pgIn">
      <PageHeader title="Help & Support" onBack={() => nav(-1)}/>
      <div className="p-5 lg:p-7 max-w-[720px] mx-auto flex flex-col gap-4">

        {/* Hero banner */}
        <div
          className="rounded-[var(--r)] p-6 lg:p-7 text-white overflow-hidden
                     bg-gradient-to-br from-accent to-[#f97316]">
          <div className="text-[38px] mb-2">🆘</div>
          <div className="font-display font-extrabold text-xl lg:text-2xl">We're here to help</div>
          <div className="text-[13px] opacity-90 mt-1 leading-relaxed">
            Browse the FAQs below or reach us directly — our team replies within a few minutes during business hours.
          </div>
        </div>

        {/* Contact */}
        <div>
          <div className="text-[10px] font-extrabold uppercase tracking-[0.6px] text-muted mb-2">Reach us</div>
          <div className="flex flex-col gap-2">
            <ContactRow icon="💬" bg="#dcfce7" fg="#166534"
              title="Chat with us on WhatsApp"
              sub={`${SUPPORT_PHONE} · Fastest reply`}
              onClick={onWhatsApp}/>
            <ContactRow icon="✉️" bg="#fef3c7" fg="#92400e"
              title="Email us"
              sub={recentJob
                ? `${SUPPORT_EMAIL} · Your most recent job will be included`
                : SUPPORT_EMAIL}
              onClick={onEmail}/>
            <ContactRow icon="📞" bg="#dbeafe" fg="#1e40af"
              title="Call support"
              sub={`${SUPPORT_PHONE} · 9 AM – 9 PM`}
              onClick={onCall}/>
            <ContactRow icon="🐞" bg="#fee2e2" fg="#991b1b"
              title="Report a bug"
              sub="Tell us about something that's not working"
              onClick={() => setBugOpen((v) => !v)}/>
            {bugOpen && (
              <div className="bg-card border border-border rounded-[var(--r)] p-4 shadow-card">
                <div className="text-[12.5px] font-bold mb-1">Report a bug</div>
                <div className="text-[11.5px] text-muted leading-[1.55]">
                  Goes straight to our team — include any steps, page, or error.
                </div>
                <BugReportForm
                  recentJobId={recentJob?.id}
                  onClose={() => setBugOpen(false)} />
              </div>
            )}
          </div>
        </div>

        {/* FAQ — now visible for BOTH roles (customer FAQs added) */}
        <div>
          <div className="text-[10px] font-extrabold uppercase tracking-[0.6px] text-muted mb-2">
            Frequently asked questions
          </div>
          <div className="bg-card border border-border rounded-[var(--r)] shadow-card overflow-hidden">
            {FAQS.map((f, i) => (
              <details key={f.q}
                className={`px-[18px] py-3.5 cursor-pointer ${i > 0 ? 'border-t border-border' : ''}`}>
                <summary className="list-none flex justify-between items-center text-[13px] font-bold text-text">
                  {f.q}
                  <span className="text-xl text-muted font-light group-open:rotate-180">+</span>
                </summary>
                <div className="text-[12px] text-muted leading-[1.6] pt-2">{f.a}</div>
              </details>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
