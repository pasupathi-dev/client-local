// Dedicated edit-profile page — fetches fresh data from the API on mount,
// maps it into the form, and PATCHes on submit. Works for both user and partner.

import { useEffect, useState, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import * as api from '@/services/api'
import { saveProfileThunk } from '@/features/profile/profileSlice'
import { selectMode } from '@/features/app/appSlice'
import { pushToast } from '@/features/app/appSlice'
import ProfileCard  from '@/components/profile/ProfileCard'
import Loader       from '@/components/Loader'
import { FormSkeleton } from '@/components/Skeleton'

// ── Shared field primitives ───────────────────────────────────────────────────

function Field ({ label, required, children }) {
  return (
    <label className="block mb-2.5">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.5px] text-muted mb-1
                      flex items-center gap-1">
        {label}{required && <span className="text-accent text-sm">*</span>}
      </div>
      {children}
    </label>
  )
}

function EditInput ({ disabled, ...rest }) {
  return (
    <input {...rest}
      disabled={disabled}
      className={`w-full px-3.5 py-2.5 rounded-[var(--rs)] bg-card text-text text-sm
                  border-[1.5px] border-border outline-none transition-colors
                  focus:border-accent placeholder:text-[#b0b3be] dark:placeholder:text-[#5b6578]
                  ${disabled ? 'bg-surface text-muted cursor-not-allowed' : ''}`} />
  )
}

function EditTextarea ({ disabled, rows = 3, ...rest }) {
  return (
    <textarea {...rest}
      rows={rows}
      disabled={disabled}
      className={`w-full px-3.5 py-2.5 rounded-[var(--rs)] bg-card text-text text-sm resize-none
                  border-[1.5px] border-border outline-none transition-colors
                  focus:border-accent placeholder:text-[#b0b3be] dark:placeholder:text-[#5b6578]
                  ${disabled ? 'bg-surface text-muted cursor-not-allowed' : ''}`} />
  )
}

// ── User edit form ────────────────────────────────────────────────────────────

function UserEditForm ({ initial, onSave, onCancel, busy, onError }) {
  const [f, setF] = useState({
    full_name: initial.full_name || '',
    email:     initial.email     || '',
    address:   initial.address   || '',
    city:      initial.city      || '',
    pincode:   initial.pincode   || '',
  })
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))

  const submit = (e) => {
    e.preventDefault()
    if (!/^\d{6}$/.test(f.pincode)) return onError('Enter a valid 6-digit pincode')
    if (!f.email.includes('@'))     return onError('Enter a valid email')
    onSave(f)
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <ProfileCard icon="👤" title="Personal Info">
        <Field label="Full Name" required>
          <EditInput value={f.full_name} onChange={(e) => set('full_name', e.target.value)} required />
        </Field>
        <Field label="Email Address" required>
          <EditInput type="email" value={f.email} onChange={(e) => set('email', e.target.value)} required />
        </Field>
        <Field label="Mobile (not editable)">
          <EditInput value={initial.phone || ''} disabled />
        </Field>
      </ProfileCard>

      <ProfileCard icon="📍" title="Location">
        <Field label="Address" required>
          <EditTextarea value={f.address} onChange={(e) => set('address', e.target.value)} rows={3} required />
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="City" required>
            <EditInput value={f.city} onChange={(e) => set('city', e.target.value)} required />
          </Field>
          <Field label="Pincode" required>
            <EditInput inputMode="numeric" maxLength={6} value={f.pincode}
              onChange={(e) => set('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))} required />
          </Field>
        </div>
      </ProfileCard>

      <div className="md:col-span-2 flex gap-2.5">
        <button type="button" onClick={onCancel}
          className="flex-1 py-3 rounded-[var(--rs)] bg-surface border-[1.5px] border-border
                     text-sm font-semibold text-text hover:border-muted transition">
          Cancel
        </button>
        <button type="submit" disabled={busy}
          className="flex-[2] py-3 rounded-[var(--rs)] bg-accent text-white
                     font-display font-bold text-sm
                     shadow-[0_4px_16px_rgba(232,65,26,0.25)]
                     hover:brightness-90 disabled:opacity-60 transition">
          {busy ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </form>
  )
}

// ── Partner edit form ─────────────────────────────────────────────────────────

function PartnerEditForm ({ initial, onSave, onCancel, onEditServices, busy, onError }) {
  const [f, setF] = useState({
    full_name:     initial.full_name || '',
    email:         initial.email     || '',
    address:       initial.address   || '',
    city:          initial.city      || '',
    pincode:       initial.pincode   || '',
  })

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))

  const submit = (e) => {
    e.preventDefault()
    if (!/^\d{6}$/.test(f.pincode)) return onError('Enter a valid 6-digit pincode')
    if (!f.email.includes('@'))     return onError('Enter a valid email')
    onSave({ ...f })
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <ProfileCard icon="👤" title="Personal Info">
        <Field label="Full Name" required>
          <EditInput value={f.full_name} onChange={(e) => set('full_name', e.target.value)} required />
        </Field>
        <Field label="Email Address" required>
          <EditInput type="email" value={f.email} onChange={(e) => set('email', e.target.value)} required />
        </Field>
        <Field label="Mobile (not editable)">
          <EditInput value={initial.phone || ''} disabled />
        </Field>
      </ProfileCard>

      <ProfileCard icon="📍" title="Location">
        <Field label="Address" required>
          <EditTextarea value={f.address} onChange={(e) => set('address', e.target.value)} rows={3} required />
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="City" required>
            <EditInput value={f.city} onChange={(e) => set('city', e.target.value)} required />
          </Field>
          <Field label="Pincode" required>
            <EditInput inputMode="numeric" maxLength={6} value={f.pincode}
              onChange={(e) => set('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))} required />
          </Field>
        </div>
      </ProfileCard>

      {/* Services & pricing — managed on their own screen */}
      <div className="md:col-span-2">
        <ProfileCard icon="🔧" title="Services & Pricing">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[13px] text-muted leading-[1.5]">
              Manage the services you offer and your per-visit prices.
            </p>
            <button type="button" onClick={onEditServices}
              className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-[var(--rs)]
                         bg-surface border-[1.5px] border-border text-text font-bold text-[13px]
                         hover:border-accent hover:text-accent transition">
              Manage services &amp; pricing →
            </button>
          </div>
        </ProfileCard>
      </div>

      <div className="md:col-span-2 flex gap-2.5">
        <button type="button" onClick={onCancel}
          className="flex-1 py-3 rounded-[var(--rs)] bg-surface border-[1.5px] border-border
                     text-sm font-semibold text-text hover:border-muted transition">
          Cancel
        </button>
        <button type="submit" disabled={busy}
          className="flex-[2] py-3 rounded-[var(--rs)] bg-accent text-white
                     font-display font-bold text-sm
                     shadow-[0_4px_16px_rgba(232,65,26,0.25)]
                     hover:brightness-90 disabled:opacity-60 transition">
          {busy ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </form>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EditProfilePage () {
  const dispatch  = useDispatch()
  const nav       = useNavigate()
  const mode      = useSelector(selectMode)
  const isPartner = mode === 'partner'
  const backPath  = isPartner ? '/partner/profile' : '/profile'

  const [profile,     setProfile]     = useState(null)
  const [fetching,    setFetching]    = useState(true)
  const [fetchError,  setFetchError]  = useState(null)
  const [busy,        setBusy]        = useState(false)

  // Fetch fresh profile data from the server on every page visit. (Partner
  // services/pricing are edited on their own screen — /partner/services/edit.)
  useEffect(() => {
    let alive = true
    setFetching(true)
    setFetchError(null)

    const load = async () => {
      try {
        const { user } = await api.getMe()
        if (!alive) return
        setProfile(user)
      } catch (err) {
        if (!alive) return
        setFetchError(err?.response?.data?.message || err?.message || 'Failed to load profile')
      } finally {
        if (alive) setFetching(false)
      }
    }

    load()
    return () => { alive = false }
  }, [isPartner])

  const showError = useCallback((msg) => {
    dispatch(pushToast({ text: msg, type: 'error' }))
  }, [dispatch])

  const onSaveUser = async (patch) => {
    setBusy(true)
    try {
      await dispatch(saveProfileThunk(patch)).unwrap()
      dispatch(pushToast({ text: 'Profile updated ✓', type: 'success' }))
      nav(backPath, { replace: true })
    } catch (e) {
      dispatch(pushToast({ text: e?.message || 'Failed to save', type: 'error' }))
    } finally {
      setBusy(false)
    }
  }

  const onSavePartner = async (patch) => {
    setBusy(true)
    try {
      await dispatch(saveProfileThunk(patch)).unwrap()
      dispatch(pushToast({ text: 'Profile updated ✓', type: 'success' }))
      nav(backPath, { replace: true })
    } catch (e) {
      dispatch(pushToast({ text: e?.message || 'Failed to save', type: 'error' }))
    } finally {
      setBusy(false)
    }
  }

  const goBack = () => nav(backPath)

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-full bg-surface">
      {/* Partner has far more to edit (services, pricing) — give it the
          full width so those grids spread across columns and the page stays
          short. The user form is brief, so it stays compact + centered. */}
      <div className={`${isPartner ? 'max-w-[1120px]' : 'max-w-[760px]'} mx-auto p-4 lg:p-6 animate-pgIn`}>

        {/* Page header */}
        <div className="flex items-center gap-3 mb-4 lg:mb-5">
          <button onClick={goBack}
            className="w-9 h-9 rounded-full flex items-center justify-center
                       bg-card border border-border text-text text-lg
                       hover:border-accent hover:text-accent transition">
            ←
          </button>
          <div>
            <h1 className="font-display font-extrabold text-text text-[18px] lg:text-xl leading-tight">
              Edit My Details
            </h1>
            <p className="text-[11px] text-muted mt-[1px]">
              Changes are saved to your account immediately.
            </p>
          </div>
        </div>

        {/* Loading */}
        {fetching && (
          <FormSkeleton fields={6} />
        )}

        {/* Error */}
        {!fetching && fetchError && (
          <div className="bg-card border border-border rounded-[var(--r)] p-6 text-center">
            <div className="text-3xl mb-2">⚠️</div>
            <div className="font-display font-bold text-text mb-1">Could not load profile</div>
            <div className="text-sm text-muted mb-4">{fetchError}</div>
            <button onClick={() => window.location.reload()}
              className="px-6 py-2.5 rounded-[var(--rs)] bg-accent text-white font-bold text-sm
                         hover:brightness-90 transition">
              Retry
            </button>
          </div>
        )}

        {/* Forms — only shown once data is loaded */}
        {!fetching && !fetchError && profile && (
          isPartner
            ? <PartnerEditForm
                initial={profile}
                busy={busy}
                onSave={onSavePartner}
                onCancel={goBack}
                onEditServices={() => nav('/partner/services/edit')}
                onError={showError}
              />
            : <UserEditForm
                initial={profile}
                busy={busy}
                onSave={onSaveUser}
                onCancel={goBack}
                onError={showError}
              />
        )}
      </div>
    </div>
  )
}
