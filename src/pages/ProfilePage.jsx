// ServiceLink profile — role-aware. Professional account-page layout:
//   • a profile header (avatar, name, role, contact, partner stats, Edit)
//   • a content column (Location + Services / Saved addresses + Trusted)
//   • a sticky sidebar with a clean grouped settings list
// Edit navigates to the dedicated edit page that fetches fresh data.

import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'

import { selectProfile, pickRoleThunk } from '@/features/profile/profileSlice'
import { selectMode, setMode, toggleTheme, selectTheme, pushToast } from '@/features/app/appSlice'
import { selectOpenDisputeCount } from '@/features/disputes/disputesSlice'
import { loadMyPartner, selectPartnerProfile } from '@/features/partner/partnerSlice'
import { selectDynamicWorks } from '@/features/config/configSlice'
import { logoutUser } from '@/features/auth/authSlice'

import ProfileCard          from '@/components/profile/ProfileCard'
import TrustedContactsCard  from '@/components/profile/TrustedContactsCard'
import SavedAddressesCard   from '@/components/profile/SavedAddressesCard'
import AvatarUploader       from '@/components/profile/AvatarUploader'
import ConfirmModal  from '@/components/profile/ConfirmModal'
import Toggle        from '@/components/profile/Toggle'
import { WORKS as FALLBACK_WORKS } from '@/constants/catalog'

// ── Services & pricing (partner) ──────────────────────────────────────
function ServicesPricingCard ({ partner }) {
  const prices = partner?.work_prices || partner?.category_prices || []
  const works = useSelector(selectDynamicWorks)
  const cats = (works && works.length) ? works : FALLBACK_WORKS
  return (
    <ProfileCard icon="💰" title="Services & Pricing">
      {prices.length === 0 && <div className="text-[13px] text-muted">No services set yet</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {prices.map((p) => {
          const name = p.work_name || p.category_name
          const cat = cats.find((c) => c.name === name)
          return (
            <div key={name}
              className="flex items-center gap-3 bg-surface border border-border
                         rounded-[var(--rs)] px-3 py-2.5">
              <div className="w-9 h-9 rounded-[var(--rs)] bg-card border border-border
                              flex items-center justify-center text-base shrink-0">
                {cat?.icon || '🔧'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold text-text truncate">{cat?.display_name || name}</div>
                <div className="text-[10px] text-muted">Base visit price</div>
              </div>
              <div className="flex items-baseline gap-1 shrink-0">
                <span className="font-display font-extrabold text-accent text-base">₹{p.base_price}</span>
                <span className="text-[10px] text-muted">/visit</span>
              </div>
            </div>
          )
        })}
      </div>
    </ProfileCard>
  )
}

// ── Settings list primitives (clean grouped rows, not chunky cards) ───
function MenuLabel ({ children }) {
  return (
    <div className="px-4 py-2 bg-surface/60 text-[10px] font-bold uppercase
                    tracking-[0.6px] text-muted">
      {children}
    </div>
  )
}

function MenuRow ({ icon, bg, fg, title, sub, onClick, danger = false, right }) {
  return (
    <button type="button" onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 text-left transition hover:bg-surface">
      <div className="w-9 h-9 rounded-[10px] shrink-0 grid place-items-center text-[15px]"
           style={{ background: bg, color: fg }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-[13px] font-bold truncate ${danger ? 'text-[#ef4444]' : 'text-text'}`}>{title}</div>
        {sub && <div className="text-[11px] text-muted truncate mt-0.5">{sub}</div>}
      </div>
      {right !== undefined ? right : <span className="text-muted text-[15px] leading-none shrink-0">›</span>}
    </button>
  )
}

// Labeled key/value field for the profile header.
function Field ({ label, value }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-muted">{label}</div>
      <div className="text-[13px] font-semibold text-text truncate mt-0.5">{value || '—'}</div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────
export default function ProfilePage () {
  const dispatch = useDispatch()
  const nav      = useNavigate()
  const profile  = useSelector(selectProfile)
  const partner  = useSelector(selectPartnerProfile)
  const theme    = useSelector(selectTheme)
  const mode     = useSelector(selectMode)
  const isPartner = mode === 'partner'

  useEffect(() => { if (isPartner) dispatch(loadMyPartner()) }, [isPartner, dispatch])

  const [bank, setBank] = useState(null)
  useEffect(() => {
    if (!isPartner) return
    import('@/services/api').then(({ getBank }) => getBank().then(({ bank }) => setBank(bank)).catch(() => {}))
  }, [isPartner])

  const [pendingMode, setPendingMode] = useState(null)
  const [signOutOpen, setSignOutOpen] = useState(false)

  if (!profile) return null

  const goEdit = () => nav(isPartner ? '/partner/profile/edit' : '/profile/edit')

  const rating      = Number(partner?.rating_avg) || 0
  const ratingCount = Number(partner?.rating_count) || 0
  const jobsDone    = Number(partner?.jobs_completed) || 0

  const bankBadge = bank
    ? <span className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full
                       bg-[#dcfce7] text-[#166534] dark:bg-[#064e3b] dark:text-[#86efac]
                       text-[9px] font-extrabold uppercase tracking-[0.4px] shrink-0">✓ Linked</span>
    : <span className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full
                       bg-[#fef3c7] text-[#92400e]
                       text-[9px] font-extrabold uppercase tracking-[0.4px] shrink-0">! Setup</span>

  return (
    <div className="p-4 lg:p-6 max-w-[1080px] mx-auto space-y-4 lg:space-y-5 animate-pgIn">

      {/* ── Profile header + Location (combined) ───────────────── */}
      <div className="bg-card border border-border rounded-[var(--r)] overflow-hidden">

        {/* Identity */}
        <div className="p-5 lg:p-6 flex flex-col sm:flex-row sm:items-center gap-4 lg:gap-5">
          <AvatarUploader profile={profile} size={84} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <h1 className="font-display text-[20px] lg:text-[22px] font-extrabold text-text truncate">
                {profile.full_name || 'Your profile'}
              </h1>
              <span className="text-[9px] uppercase tracking-[0.5px] font-extrabold
                               px-2.5 py-[3px] rounded-full bg-accent/10 text-accent shrink-0">
                {isPartner ? 'Partner' : 'User'}
              </span>
            </div>

            {/* Labeled fields — every value carries its own label. */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <Field label="Phone" value={profile.phone} />
              <Field label="Email" value={profile.email} />
              {isPartner && (
                <Field label="Rating"
                  value={rating > 0 ? `⭐ ${rating.toFixed(1)} · ${ratingCount} review${ratingCount === 1 ? '' : 's'}` : '—'} />
              )}
              {isPartner && <Field label="Jobs done" value={jobsDone} />}
            </div>
          </div>

          <button onClick={goEdit}
            className="shrink-0 self-start sm:self-center inline-flex items-center justify-center gap-1.5
                       px-5 py-2.5 rounded-[var(--rs)] bg-accent text-white font-bold text-[13px]
                       hover:brightness-90 transition">
            ✎ Edit details
          </button>
        </div>

        {/* Location — compact: City/Pincode inline with the heading, address
            on one line below. Little content, so it gets little space. */}
        <div className="border-t border-border px-5 lg:px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 mb-2">
            <h2 className="font-display font-extrabold text-[13px] text-text inline-flex items-center gap-1.5">
              <span className="text-[14px]">📍</span> Location
            </h2>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px]">
              <span className="text-muted">City <span className="text-text font-semibold ml-1">{profile.city || '—'}</span></span>
              <span className="text-muted">Pincode <span className="text-text font-semibold ml-1">{profile.pincode || '—'}</span></span>
            </div>
          </div>
          <p className="flex items-start gap-2 text-[13px] text-text leading-[1.5] break-words">
            <span className="shrink-0">🏠</span>
            <span>{profile.address || '—'}</span>
          </p>
        </div>
      </div>

      {/* ── Content + sidebar ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4 lg:gap-5 items-start">

        {/* Content */}
        <main className="space-y-4">
          {isPartner ? (
            <ServicesPricingCard partner={partner} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              <SavedAddressesCard />
              <ProfileCard icon="🛟" title="Trusted contacts" padBody={false}>
                <TrustedContactsCard />
              </ProfileCard>
            </div>
          )}
        </main>

        {/* Sidebar — grouped settings list */}
        <aside className="lg:sticky lg:top-4">
          <div className="bg-card border border-border rounded-[var(--r)] overflow-hidden
                          divide-y divide-border">
            <MenuLabel>App</MenuLabel>
            <MenuRow icon="⚙️" bg="#ede9fe" fg="#6d28d9"
              title="Settings" sub="Notifications, theme, language"
              onClick={() => nav(isPartner ? '/partner/settings' : '/settings')} />
            <MenuRow icon="🆘" bg="#fef3c7" fg="#92400e"
              title="Help & Support" sub="FAQ, contact us"
              onClick={() => nav(isPartner ? '/partner/help' : '/help')} />
            {!isPartner && (
              <MenuRow icon="⚖️" bg="#fee2e2" fg="#991b1b"
                title="My Disputes" sub="Issues you flagged on past jobs"
                onClick={() => nav('/my-disputes')} right={<DisputeBadge />} />
            )}

            {isPartner && (
              <>
                <MenuLabel>Partner</MenuLabel>
                <MenuRow icon="⭐" bg="#fef3c7" fg="#92400e"
                  title="My Reviews" sub="Read reviews and post replies"
                  onClick={() => nav('/partner/reviews')} />
                <MenuRow icon="🏦" bg="#dbeafe" fg="#1e40af"
                  title="Bank Account"
                  sub={bank ? `${bank.bank_name} · ••${bank.last4}` : 'Required for withdrawals'}
                  onClick={() => nav('/partner/bank')} right={bankBadge} />
              </>
            )}

            <MenuLabel>Account</MenuLabel>
            <MenuRow icon="🔄" bg="#dbeafe" fg="#1e40af"
              title={isPartner ? 'Switch to User' : 'Switch to Partner'}
              sub={isPartner ? 'Browse & book services' : 'Offer services, earn money'}
              onClick={() => setPendingMode(isPartner ? 'user' : 'partner')} />
            <MenuRow icon="🚪" bg="#fee2e2" fg="#991b1b"
              title="Sign Out" sub="Log out of your account" danger
              onClick={() => setSignOutOpen(true)} />

            {!isPartner && (
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="w-9 h-9 rounded-[10px] shrink-0 grid place-items-center text-[15px]"
                     style={{ background: '#1f2937', color: '#fff' }}>
                  {theme === 'dark' ? '☀️' : '🌙'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold text-text">Dark Mode</div>
                  <div className="text-[11px] text-muted mt-0.5">Light / dark theme</div>
                </div>
                <Toggle on={theme === 'dark'} onChange={() => dispatch(toggleTheme())} />
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Switch-mode confirm */}
      <ConfirmModal
        open={!!pendingMode}
        icon={pendingMode === 'partner' ? '🔧' : '🗺'}
        title="Switch Role?"
        body={
          <>Are you sure you want to switch to <strong className="text-text">
            {pendingMode === 'partner' ? 'Partner' : 'User'}</strong> mode?
            Your view and menu will change.
          </>
        }
        cancelLabel="Cancel"
        confirmLabel="Yes, Switch"
        onCancel={() => setPendingMode(null)}
        onConfirm={async () => {
          const next = pendingMode
          setPendingMode(null)
          // Backend role MUST flip before we navigate — otherwise RoleRoute
          // reads the old `profile.role` and bounces us right back.
          try {
            await dispatch(pickRoleThunk(next)).unwrap()
            dispatch(setMode(next))
            nav(next === 'partner' ? '/partner' : '/', { replace: true })
          } catch (err) {
            dispatch(pushToast({ text: `Could not switch: ${err?.message || err}` }))
          }
        }}
      />

      {/* Sign-out confirm */}
      <ConfirmModal
        open={signOutOpen}
        icon="🚪"
        title="Sign Out?"
        body="Are you sure you want to sign out? You'll need to log in again to access your account."
        cancelLabel="Cancel"
        confirmLabel="Yes, Sign Out"
        variant="danger"
        onCancel={() => setSignOutOpen(false)}
        onConfirm={async () => {
          setSignOutOpen(false)
          await dispatch(logoutUser())
          nav('/login', { replace: true })
        }}
      />
    </div>
  )
}

// Small helper — open-dispute count chip on the My Disputes row.
function DisputeBadge () {
  const n = useSelector(selectOpenDisputeCount)
  if (!n) return null
  return (
    <span className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full
                     bg-[#fee2e2] text-[#991b1b]
                     text-[9px] font-extrabold uppercase tracking-[0.4px] shrink-0">
      {n} open
    </span>
  )
}
