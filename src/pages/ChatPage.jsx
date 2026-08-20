// Shared chat page (used by both customer and partner).
import { useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate, useParams } from 'react-router-dom'
import { getSocket } from '@/services/socket'
import * as api from '@/services/api'
import { fetchJobThunk, proposePriceThunk, selectActiveJob } from '@/features/jobs/jobsSlice'
import { loadMessages, sendMessageThunk, editMessageThunk, deleteMessageThunk, selectJobMessages } from '@/features/chat/chatSlice'
import { selectMode, pushToast } from '@/features/app/appSlice'
import Loader from '@/components/Loader'
import { RowSkeleton } from '@/components/Skeleton'
import SafetyModal from '@/components/SafetyModal'
import ConfirmModal from '@/components/profile/ConfirmModal'

// L45 — SOS press-and-hold button. Visible to BOTH sides during motion
// states. Mounted in the chat header (and elsewhere). Holds for 1.2s to
// activate so a stray tap doesn't bring up the safety sheet. While held,
// a ring around the button fills as a progress indicator.
// L45 — Press-and-hold SOS. Rewritten without rAF + preventDefault — the
// old version's `e.preventDefault()` on touchstart was suppressing
// synthesized clicks on neighbouring elements in some browsers, causing
// other buttons on the page to feel "stuck". setTimeout + pointer events
// gives the same UX with none of the side effects.
function SosLongPress ({ onActivate, onTap }) {
  const HOLD_MS = 1200
  const [holding, setHolding] = useState(false)
  const startRef = useRef(0)
  const timerRef = useRef(null)
  const firedRef = useRef(false)
  const start = () => {
    firedRef.current = false
    startRef.current = Date.now()
    setHolding(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      firedRef.current = true
      setHolding(false)
      onActivate?.()
    }, HOLD_MS)
  }
  const stop = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    const wasShort = startRef.current > 0
      && Date.now() - startRef.current < HOLD_MS - 50
    setHolding(false)
    if (wasShort && !firedRef.current) onTap?.()
    startRef.current = 0
  }
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])
  return (
    <button type="button"
      onPointerDown={start}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
      aria-label="I feel unsafe (press and hold)"
      className={`relative shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5
                  rounded-full text-white text-[11px] font-extrabold
                  bg-[#dc2626] hover:bg-[#b91c1c] active:bg-[#7f1d1d]
                  shadow-[0_4px_12px_rgba(220,38,38,0.35)]
                  touch-manipulation select-none
                  ${holding ? 'scale-110' : ''} transition-transform duration-150`}>
      🚨 {holding ? 'Hold…' : 'SOS'}
    </button>
  )
}

// M44 — In-chat bubble for an extra-work proposal. Customer sees Approve /
// Decline buttons while status='pending'; otherwise both sides see a
// "✅ Approved" / "✖ Declined" tag.
function ExtraWorkBubble ({ m, mine, isPartner, jobId }) {
  const [busy, setBusy] = useState(false)
  const dispatch = useDispatch()
  const a = m.attachment || {}
  const respond = async (accepted) => {
    if (busy) return
    setBusy(true)
    try {
      await api.respondExtraWork(jobId, { message_id: m.id, accepted })
    } catch (e) {
      dispatch(pushToast({ text: e?.response?.data?.message || e?.message || 'Could not respond', type: 'error' }))
    } finally { setBusy(false) }
  }
  return (
    <div className={`mt-2 pt-2 border-t ${mine ? 'border-white/20' : 'border-border'} text-[12px]`}>
      <div className="opacity-80">
        Extra: <b>{a.description}</b>
      </div>
      <div className="font-display font-extrabold text-[15px] mt-0.5">
        ₹{a.extra_price}
      </div>
      {a.status === 'pending' && !isPartner && !mine && (
        <div className="flex gap-1.5 mt-2">
          <button onClick={() => respond(false)} disabled={busy}
            className="flex-1 py-1.5 rounded-md bg-card border border-border
                       text-[#b91c1c] text-[11px] font-bold hover:border-[#ef4444] transition
                       disabled:opacity-60">
            Decline
          </button>
          <button onClick={() => respond(true)} disabled={busy}
            className="flex-[2] py-1.5 rounded-md bg-success text-white
                       text-[11px] font-bold hover:brightness-105 transition
                       disabled:opacity-60">
            Approve ₹{a.extra_price}
          </button>
        </div>
      )}
      {a.status === 'accepted' && (
        <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-success">
          ✅ Approved — agreed price updated
        </div>
      )}
      {a.status === 'declined' && (
        <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-[#b91c1c]">
          ✖ Declined
        </div>
      )}
    </div>
  )
}

// C46 — In-chat bubble for a partner-proposed price change. Customer sees
// Approve / Reject while pending; both sides see "✅ Approved" / "✖
// Rejected" once responded. Approving updates `agreed_price` server-side.
function PriceChangeBubble ({ m, mine, isPartner, jobId }) {
  const [busy, setBusy] = useState(false)
  const dispatch = useDispatch()
  const a = m.attachment || {}
  const oldP = Number(a.old_price || 0)
  const newP = Number(a.new_price || 0)
  const delta = newP - oldP
  const respond = async (accepted) => {
    if (busy) return
    setBusy(true)
    try {
      await api.respondPriceChange(jobId, { message_id: m.id, accepted })
    } catch (e) {
      dispatch(pushToast({
        text: e?.response?.data?.message || e?.message || 'Could not respond',
        type: 'error',
      }))
    } finally { setBusy(false) }
  }
  return (
    <div className={`mt-2 pt-2 border-t ${mine ? 'border-white/20' : 'border-border'} text-[12px]`}>
      <div className="opacity-80">Proposed new price</div>
      <div className="flex items-baseline gap-1.5 mt-0.5">
        <span className="line-through opacity-60 text-[12px]">₹{oldP}</span>
        <span className="font-display font-extrabold text-[17px]">₹{newP}</span>
        {delta !== 0 && (
          <span className={`text-[11px] font-bold ${delta > 0 ? 'opacity-80' : 'text-success'}`}>
            ({delta > 0 ? '+' : ''}₹{delta})
          </span>
        )}
      </div>
      {a.reason && (
        <div className={`mt-1 text-[11px] leading-[1.45] ${mine ? 'opacity-85' : 'text-muted italic'}`}>
          “{a.reason}”
        </div>
      )}
      {a.status === 'pending' && !isPartner && !mine && (
        <div className="flex gap-1.5 mt-2">
          <button onClick={() => respond(false)} disabled={busy}
            className="flex-1 py-1.5 rounded-md bg-card border border-border
                       text-[#b91c1c] text-[11px] font-bold hover:border-[#ef4444] transition
                       disabled:opacity-60">
            Reject
          </button>
          <button onClick={() => respond(true)} disabled={busy}
            className="flex-[2] py-1.5 rounded-md bg-success text-white
                       text-[11px] font-bold hover:brightness-105 transition
                       disabled:opacity-60">
            Approve ₹{newP}
          </button>
        </div>
      )}
      {a.status === 'pending' && isPartner && (
        <div className="mt-2 text-[11px] font-bold text-muted">
          Waiting for customer to approve
        </div>
      )}
      {a.status === 'accepted' && (
        <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-success">
          ✅ Approved — agreed price is now ₹{newP}
        </div>
      )}
      {a.status === 'declined' && (
        <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-[#b91c1c]">
          ✖ Rejected — price stays ₹{oldP}
        </div>
      )}
    </div>
  )
}

// M42 — Quick-reply chips above the chat input. Partner-only, contextual
// to the job state. One tap sends the chip text as a message so a driving
// partner can communicate without typing. We send via the same thunk a
// regular message uses, so the customer-side render path is unchanged.
const QUICK_REPLIES = {
  accepted:       ['When suits you?',  'Confirming the scope now',  'Sending the firm price'],
  priceConfirmed: ['Leaving now',      'On my way in 5 min',        'Will share live location'],
  travelling:    ["I'll be 5 min late",'Stuck in traffic',          'Almost there'],
  arrived:       ["I'm outside",       'Door open?',                'At the gate'],
  working:        ['Need 5 more min',  'Almost done',               'Encountered a small issue'],
  completed:      ['Work is done',     'Could you process payment?', 'Thanks for the job!'],
}
function QuickReplyChips ({ state, disabled, onSend }) {
  const chips = QUICK_REPLIES[state]
  if (!chips || !chips.length) return null
  return (
    <div className="px-3 pt-2 pb-1 flex gap-1.5 overflow-x-auto no-scrollbar
                    border-b border-border/50">
      {chips.map((c) => (
        <button key={c} type="button" disabled={disabled}
          onClick={() => onSend(c)}
          className="shrink-0 px-3 py-1.5 rounded-full text-[12px] font-semibold
                     text-text bg-surface border border-border
                     hover:border-accent hover:text-accent transition
                     disabled:opacity-60">
          {c}
        </button>
      ))}
    </div>
  )
}

// ── Price Proposal Toast ───────────────────────────────────────────
// Bottom-right on desktop (md+), full-width bottom on mobile.
// Does NOT cover the screen.
// Mid-job price update — fires only when the partner adjusts the agreed
// price after the job has started (scope changed). The initial firm price
// is locked at request creation time and doesn't trigger this toast.
function PriceProposalToast ({ popup, partnerName, partnerInitials, onDismiss }) {
  if (!popup) return null
  const went = popup.oldAmount != null && popup.oldAmount !== popup.amount
  const direction = went ? (popup.amount > popup.oldAmount ? 'increased' : 'reduced') : null
  return (
    <div className="fixed z-[9999]
                    bottom-4 left-4 right-4
                    md:left-auto md:right-5 md:bottom-5 md:w-[340px]
                    bg-card border border-border rounded-[18px]
                    shadow-[0_8px_40px_rgba(0,0,0,0.22)]
                    animate-slideUp overflow-hidden">

      <div className="h-[3px] bg-accent w-full" />

      <div className="px-4 py-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full pav-b flex items-center justify-center
                          font-bold text-[13px] shrink-0 border-[2px] border-accent/20">
            {partnerInitials || 'P'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-display font-bold text-[13px] text-text truncate">
              {partnerName} updated the price
            </div>
            <div className="text-[11px] text-muted">
              {direction ? `Price ${direction} due to scope change` : 'New price applied'}
            </div>
          </div>
          <button onClick={onDismiss}
            className="shrink-0 w-6 h-6 rounded-full bg-surface border border-border
                       flex items-center justify-center text-muted text-[11px]
                       hover:text-text transition">✕</button>
        </div>

        <div className="flex items-center justify-between bg-surface border border-border
                        rounded-[10px] px-4 py-3 mb-3">
          <div>
            {went && (
              <div className="text-[10px] text-muted line-through">₹{popup.oldAmount}</div>
            )}
            <div className="font-display font-extrabold text-[26px] text-accent leading-none">
              ₹{popup.amount}
            </div>
          </div>
          <div className="text-[10px] text-muted text-right leading-[1.5]">
            New agreed price<br />pay after work
          </div>
        </div>

        <button onClick={onDismiss}
          className="w-full py-2 rounded-[var(--rs)] bg-accent text-white
                     text-[12.5px] font-bold shadow-[0_4px_14px_rgba(232,65,26,0.25)]
                     hover:brightness-90 transition">
          Got it
        </button>
      </div>
    </div>
  )
}

// ── Partner Declined Toast ─────────────────────────────────────────
function PartnerDeclinedToast ({ open, partnerName, onClose, onGoBack }) {
  if (!open) return null
  return (
    <div className="fixed z-[9999]
                    bottom-4 left-4 right-4
                    md:left-auto md:right-5 md:bottom-5 md:w-[320px]
                    bg-card border border-[#fee2e2] rounded-[18px]
                    shadow-[0_8px_40px_rgba(0,0,0,0.22)]
                    animate-slideUp overflow-hidden">

      <div className="h-[3px] bg-[#ef4444] w-full" />

      <div className="px-4 py-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="text-[24px] shrink-0 leading-none mt-0.5">🙅</div>
          <div className="flex-1 min-w-0">
            <div className="font-display font-bold text-[13px] text-text mb-0.5">
              Request Rejected
            </div>
            <div className="text-[11px] text-muted leading-[1.5]">
              {partnerName || 'The partner'} isn't available right now.
            </div>
          </div>
          <button onClick={onClose}
            className="shrink-0 w-6 h-6 rounded-full bg-surface border border-border
                       flex items-center justify-center text-muted text-[11px]
                       hover:text-text transition">✕</button>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2 rounded-[var(--rs)] border-[1.5px] border-border
                       bg-card text-text text-[12px] font-semibold hover:border-muted transition">
            Close
          </button>
          <button onClick={onGoBack}
            className="flex-[2] py-2 rounded-[var(--rs)] bg-accent text-white
                       text-[12.5px] font-bold shadow-[0_4px_14px_rgba(232,65,26,0.25)]
                       hover:brightness-90 transition">
            Find Another →
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ChatPage () {
  const { jobId }  = useParams()
  const dispatch   = useDispatch()
  const nav        = useNavigate()
  const job        = useSelector(selectActiveJob)
  const messages   = useSelector(selectJobMessages(jobId))
  const mode       = useSelector(selectMode)
  const isPartner  = mode === 'partner'
  const [text, setText]   = useState('')
  const [price, setPrice] = useState('')
  // WhatsApp-style edit flow: clicking ✎ on a bubble pulls its body into the
  // footer input and stashes the message id here. The footer's send handler
  // dispatches editMessageThunk instead of sendMessageThunk while this is set.
  const [editingId, setEditingId] = useState(null)
  const [editBusy, setEditBusy] = useState(false)
  // Pending soft-delete target — non-null while the confirm modal is open.
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const inputRef = useRef(null)
  const endRef   = useRef(null)

  const [pricePopup, setPricePopup]       = useState(null) // { amount, oldAmount }
  const [declinedPopup, setDeclinedPopup] = useState(false)
  const [safetyOpen, setSafetyOpen]       = useState(false)
  const prevPriceRef = useRef(null)

  useEffect(() => {
    dispatch(fetchJobThunk(jobId))
    dispatch(loadMessages(jobId))
    getSocket({ role: isPartner ? 'partner' : 'user' }).then((s) => s.emit('join-job', jobId)).catch(() => {})
    return () => { getSocket().then((s) => s.emit('leave-job', jobId)).catch(() => {}) }
  }, [jobId, dispatch, isPartner])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Show toast when partner proposes/updates the price (user only)
  useEffect(() => {
    if (!job || isPartner) return
    const current = job.agreed_price
    if (prevPriceRef.current !== null && prevPriceRef.current !== current) {
      setPricePopup({ amount: current, oldAmount: prevPriceRef.current })
    }
    prevPriceRef.current = current
  }, [job?.agreed_price, isPartner]) // eslint-disable-line react-hooks/exhaustive-deps

  // Footer submit — branches on `editingId`:
  //   - editing → PATCH the existing message (body comes from the same input)
  //   - normal  → POST a new message
  // Either way, the input clears and the edit banner closes once we're done.
  const send = async (e) => {
    e.preventDefault()
    const body = text.trim()
    if (!body) return
    if (editingId) {
      setEditBusy(true)
      try {
        await dispatch(editMessageThunk({ jobId, messageId: editingId, body })).unwrap()
        setEditingId(null)
        setText('')
      } catch (err) {
        dispatch(pushToast({ text: err?.message || 'Failed to edit message', type: 'error' }))
      } finally { setEditBusy(false) }
      return
    }
    try {
      await dispatch(sendMessageThunk({ jobId, body })).unwrap()
      setText('')
    } catch (err) {
      // 409 chat_closed wins this race when the job flips to paid/cancelled
      // before the customer's socket has delivered the state change.
      dispatch(pushToast({ text: err?.message || 'Failed to send', type: 'error' }))
    }
  }

  const [priceReason, setPriceReason] = useState('')
  const proposeNewPrice = async () => {
    const val = Number(price)
    if (!Number.isFinite(val) || val <= 0) return
    try {
      await dispatch(proposePriceThunk({
        id: jobId,
        agreed_price: val,
        reason: priceReason.trim() || undefined,
      })).unwrap()
      setPrice(''); setPriceReason('')
      dispatch(pushToast({
        type: 'info',
        text: `Proposed ₹${val}. Customer needs to approve before it sticks.`,
      }))
    } catch (e) {
      dispatch(pushToast({
        text: e?.response?.data?.message || e?.message || 'Could not propose',
        type: 'error',
      }))
    }
  }

  // Pull the bubble's body into the footer input (WhatsApp pattern). The
  // input is focused so the user can immediately tweak the text.
  const startEdit = (m) => {
    setEditingId(m.id)
    setText(m.body || '')
    setTimeout(() => inputRef.current?.focus(), 0)
  }
  const cancelEdit = () => {
    if (editBusy) return
    setEditingId(null)
    setText('')
  }
  // Soft-delete uses a custom in-app ConfirmModal (no browser alerts). The
  // 🗑 icon stages the message; the modal's onConfirm actually fires.
  const removeMessage = (m) => setPendingDelete(m)
  const cancelDelete  = () => { if (!deleteBusy) setPendingDelete(null) }
  const confirmDelete = async () => {
    if (!pendingDelete) return
    setDeleteBusy(true)
    try {
      await dispatch(deleteMessageThunk({ jobId, messageId: pendingDelete.id })).unwrap()
      // If the deleted message was the one being edited, drop the footer state.
      if (editingId === pendingDelete.id) { setEditingId(null); setText('') }
      setPendingDelete(null)
    } catch (err) {
      dispatch(pushToast({ text: err?.message || 'Failed to delete message', type: 'error' }))
    } finally { setDeleteBusy(false) }
  }

  if (!job) return <div className="p-4 flex flex-col gap-3"><RowSkeleton count={6} /></div>

  // Bug #26: show a cancelled banner instead of the normal chat UI.
  if (job.state === 'cancelled') {
    const who = job.cancelled_by === 'partner' ? (job.partner_name || 'Partner') : (job.customer_name || 'Customer')
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-6 bg-surface">
        <div className="text-4xl">🚫</div>
        <div className="font-display font-extrabold text-[17px] text-text text-center">Job Cancelled</div>
        <div className="text-[13px] text-muted text-center leading-[1.6]">
          {who} cancelled this job{job.cancel_reason ? ` · ${job.cancel_reason}` : ''}.
        </div>
        {job.cancel_note && (
          <div className="text-[12px] italic text-muted text-center border-l-[3px] border-danger pl-3">
            {job.cancel_note}
          </div>
        )}
        <button onClick={() => nav(-1)}
          className="btn-secondary mt-2">← Go Back</button>
      </div>
    )
  }

  const partyInitials = isPartner ? job.customer_initials : job.partner_initials
  const partyName     = isPartner ? job.customer_name     : job.partner_name

  return (
    <div className="grid grid-rows-[60px_1fr_auto] h-full">
      {/* header */}
      <header className="bg-card border-b border-border px-4 flex items-center gap-3">
        <button onClick={() => nav(-1)} className="text-muted">←</button>
        <div className="w-9 h-9 rounded-full pav-b flex items-center justify-center font-bold">{partyInitials || 'U'}</div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm truncate">{partyName}</div>
          <div className="text-[10px] text-success font-semibold">
            Active · {job.state}
            {/* M35 — Pin the partner's promised ETA for the customer until
                they arrive. Hidden for the partner side and once the job
                state moves past travelling. */}
            {!isPartner && job.eta_min && !['arrived','working','completed','paid','cancelled'].includes(job.state) && (
              <span className="ml-2 inline-flex items-center gap-1 px-2 py-[1px]
                               rounded-full bg-[#fff5f2] text-accent border border-[#fcd9cc]">
                ⏱ Arriving in ~{job.eta_min} min
              </span>
            )}
          </div>
        </div>
        {/* L45 — SOS long-press. Customer-only here because SafetyModal
            uses customer-only endpoints (sos, share-trip, trusted-contacts).
            The partner has their own equivalent (PartnerShareTripModal)
            launched from a long-press button on PartnerWorkPage. */}
        {!isPartner && ['travelling', 'arrived', 'working'].includes(job.state) && (
          <SosLongPress onActivate={() => setSafetyOpen(true)}
            onTap={() => dispatch(pushToast({
              type: 'info',
              text: 'Press and hold the SOS button to feel-unsafe.',
            }))} />
        )}
      </header>

      {/* messages */}
      <div className="overflow-y-auto p-4 flex flex-col gap-2 bg-surface">
        {messages.map((m) => {
          const mine     = (isPartner ? 'partner' : 'user') === m.sender_role
          const deleted  = !!m.deleted_at
          // Edit / delete affordance only on your OWN, non-deleted, plain-text
          // bubbles. Price-propose / price-update attachments would desync if
          // the body changed without the attachment, so the server refuses
          // them and we hide the icons here too.
          const canEdit   = mine && !deleted && !m.attachment
          const canDelete = mine && !deleted
          const isEditingThis = editingId === m.id
          return (
            <div key={m.id} className={`group max-w-[80%] ${mine ? 'self-end' : 'self-start'}`}>
              <div className={`relative px-3.5 py-2.5 rounded-2xl text-sm transition
                               ${deleted
                                 ? `bg-card border border-dashed border-border italic
                                    ${mine ? 'rounded-tr-sm' : 'rounded-tl-sm'}`
                                 : (mine ? 'bg-accent text-white rounded-tr-sm'
                                         : 'bg-card border border-border rounded-tl-sm')}
                               ${isEditingThis ? 'ring-2 ring-offset-1 ring-accent' : ''}`}>
                {deleted ? (
                  <span className="inline-flex items-center gap-1.5 text-muted">
                    <span aria-hidden="true" className="text-[13px] not-italic">🚫</span>
                    <span>This message was deleted</span>
                  </span>
                ) : (
                  <>
                    {m.body}
                    {m.edited_at && (
                      <span className={`ml-1.5 text-[10px] italic ${mine ? 'opacity-70' : 'text-muted'}`}>
                        (edited)
                      </span>
                    )}
                    {m.attachment?.type === 'price-propose' && (
                      <div className="mt-2 pt-2 border-t border-white/20">
                        <div className="text-[10px] opacity-80 uppercase">Proposed price</div>
                        <div className="font-display text-xl font-extrabold">₹{m.attachment.amount}</div>
                      </div>
                    )}
                    {m.attachment?.type === 'price-update' && (
                      <div className="mt-2 pt-2 border-t border-white/20 text-[11px]">
                        <span className="line-through opacity-60">₹{m.attachment.oldPrice}</span> → <span className="font-bold">₹{m.attachment.newPrice}</span>
                      </div>
                    )}
                    {/* M44 — Extra-work proposal. Customer sees Approve /
                        Decline buttons while status='pending'; partner sees
                        the same content but no buttons. Once responded, the
                        attachment status flips and the buttons disappear. */}
                    {m.attachment?.type === 'extra-work-proposal' && (
                      <ExtraWorkBubble m={m} mine={mine} isPartner={isPartner} jobId={jobId} />
                    )}
                    {/* C46 — Price-change proposal. Customer sees Approve /
                        Reject buttons while pending; both sides see the
                        outcome chip once responded. */}
                    {m.attachment?.type === 'price-change-proposal' && (
                      <PriceChangeBubble m={m} mine={mine} isPartner={isPartner} jobId={jobId} />
                    )}
                  </>
                )}

                {(canEdit || canDelete) && (
                  <div className="absolute -top-2 -left-2 flex items-center gap-1
                                  opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
                    {canEdit && (
                      <button type="button" onClick={() => startEdit(m)}
                        title="Edit message" aria-label="Edit message"
                        className="w-6 h-6 rounded-full bg-card border border-border
                                   text-[11px] text-muted shadow-sm
                                   hover:text-accent hover:border-accent transition">
                        ✎
                      </button>
                    )}
                    {canDelete && (
                      <button type="button" onClick={() => removeMessage(m)}
                        title="Delete message" aria-label="Delete message"
                        className="w-6 h-6 rounded-full bg-card border border-border
                                   text-[11px] text-muted shadow-sm
                                   hover:text-[#dc2626] hover:border-[#dc2626] transition">
                        🗑
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
        <div ref={endRef}/>
      </div>

      {/* footer */}
      <div className="bg-card border-t border-border">
        {/* Chat is read-only once the job is paid or cancelled. Old
            notifications can deep-link the customer / partner back here
            long after the job is done — show a clear locked banner instead
            of an active composer they'd be spamming into the void. */}
        {(job.state === 'paid' || job.state === 'cancelled') ? (
          <div className="p-4 flex items-center gap-3 text-[12.5px]">
            <span className="text-[18px]" aria-hidden>
              {job.state === 'paid' ? '✅' : '🚫'}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-text">
                {job.state === 'paid' ? 'This job is finished.' : 'This job was cancelled.'}
              </div>
              <div className="text-muted text-[11.5px] mt-0.5">
                Chat is closed. Open a new request if you need this partner again.
              </div>
            </div>
            <button type="button"
              onClick={() => nav(isPartner ? '/partner/transactions' : '/my-jobs')}
              className="shrink-0 text-[11.5px] font-bold px-3 py-1.5 rounded-full
                         border border-border bg-card text-accent hover:border-accent transition">
              {isPartner ? 'My jobs' : 'My jobs'} →
            </button>
          </div>
        ) : (
        <>
        {/* M42 — Quick-reply chips above the input. Partner-only, contextual
            to job state. One tap sends the chip text as a normal message
            so the customer sees "I'll be 5 min late" instantly without
            the partner having to type while driving. */}
        {isPartner && (
          <QuickReplyChips state={job.state}
            disabled={editBusy}
            onSend={(body) => dispatch(sendMessageThunk({ jobId, body }))} />
        )}
        {/* C46 — Propose-new-price form. Now requires customer approval
            (no longer mutates agreed_price on submit). Partner enters
            new total + a short reason so the customer can decide. */}
        {isPartner && (job.state === 'priceConfirmed' || job.state === 'travelling'
                      || job.state === 'arrived'      || job.state === 'working') && (() => {
          const numericPrice = Number(price)
          const sameAsCurrent = Number.isFinite(numericPrice)
            && numericPrice === Number(job.agreed_price)
          const tooLow = !Number.isFinite(numericPrice) || numericPrice <= 0
          const disabled = tooLow || sameAsCurrent
          return (
          <div className="flex flex-col gap-2 p-3 border-b border-border">
            <div className="text-[10px] uppercase tracking-[0.5px] font-bold text-muted">
              Propose new price (currently ₹{job.agreed_price})
            </div>
            <div className="flex items-center gap-2">
              <input className="input flex-1" inputMode="numeric"
                placeholder="New total ₹"
                value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g,''))} />
              <input className="input flex-[2]"
                placeholder="Reason (e.g. 'second trip needed')"
                value={priceReason}
                onChange={(e) => setPriceReason(e.target.value.slice(0, 300))} />
              <button type="button" onClick={proposeNewPrice} disabled={disabled}
                className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed">
                Propose
              </button>
            </div>
            <div className="text-[10.5px] text-muted">
              {sameAsCurrent
                ? `That's the same as the current price — change the amount to propose a new one.`
                : `The customer will get Approve / Reject buttons. Price only changes after they accept.`}
            </div>
          </div>
          )
        })()}
        <form onSubmit={send} className="flex gap-2 p-3">
          {/* Input wrapper is relative so the in-field ✕ (cancel edit) can
              float over the right edge of the rounded input without altering
              the form's flex layout. The icon only renders while editing. */}
          <div className="relative flex-1">
            <input
              ref={inputRef}
              className={`input w-full !rounded-full ${editingId ? '!pr-10' : ''}`}
              placeholder={editingId ? 'Edit your message…' : 'Type a message…'}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape' && editingId) { e.preventDefault(); cancelEdit() } }}
              disabled={editBusy} />
            {editingId && (
              <button type="button" onClick={cancelEdit} disabled={editBusy}
                aria-label="Cancel edit" title="Cancel edit"
                className="absolute right-2 top-1/2 -translate-y-1/2
                           w-7 h-7 rounded-full bg-surface border border-border
                           text-muted text-[12px] hover:text-text hover:border-muted
                           transition disabled:opacity-60 grid place-items-center">
                ✕
              </button>
            )}
          </div>
          <button type="submit"
                  className="w-10 h-10 rounded-full bg-accent text-white disabled:opacity-60
                             grid place-items-center shrink-0"
                  disabled={editBusy}
                  aria-label={editingId ? 'Save edit' : 'Send message'}>
            {editingId ? '✓' : '➤'}
          </button>
        </form>
        </>
        )}
      </div>

      {/* Mid-job price-update toast — only fires when partner adjusts the
          price after the job started (scope change). Initial firm price is
          locked at request creation and doesn't trigger this. */}
      {!isPartner && (
        <PriceProposalToast
          popup={pricePopup}
          partnerName={job.partner_name || 'Partner'}
          partnerInitials={job.partner_initials || 'P'}
          onDismiss={() => setPricePopup(null)}
        />
      )}

      {/* Partner declined toast */}
      <PartnerDeclinedToast
        open={declinedPopup}
        partnerName={job.partner_name || 'Partner'}
        onClose={() => setDeclinedPopup(false)}
        onGoBack={() => nav(-2)}
      />

      {/* Safety modal — customer-only because the underlying endpoints
          (sos, share-trip, trusted-contacts) are role-gated to 'user'.
          Partner has their own equivalent on PartnerWorkPage. */}
      {!isPartner && (
        <SafetyModal
          open={safetyOpen}
          onClose={() => setSafetyOpen(false)}
          job={job}
        />
      )}

      {/* In-app delete confirmation — replaces window.confirm so the prompt
          matches the rest of the design system (and works inside webviews
          where native dialogs are awkward). */}
      <ConfirmModal
        open={!!pendingDelete}
        icon="🗑"
        title="Delete this message?"
        body={pendingDelete?.body
          ? `"${pendingDelete.body.length > 80
              ? pendingDelete.body.slice(0, 80) + '…'
              : pendingDelete.body}" will be removed for everyone in this chat.`
          : 'This message will be removed for everyone in this chat.'}
        cancelLabel="Keep"
        confirmLabel={deleteBusy ? 'Deleting…' : 'Delete'}
        variant="danger"
        onCancel={cancelDelete}
        onConfirm={confirmDelete} />
    </div>
  )
}
