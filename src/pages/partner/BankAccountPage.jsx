// Bank Account page — partner-only. Full CRUD: view linked bank, update, remove, or link for the first time.
// Required for KYC: without a linked bank the partner cannot withdraw from wallet.

import { useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import * as api from '@/services/api'
import { pushToast } from '@/features/app/appSlice'
import ConfirmModal from '@/components/profile/ConfirmModal'
import Loader from '@/components/Loader'
import { FormSkeleton } from '@/components/Skeleton'

function PageHeader ({ title, onBack }) {
  return (
    <div className="px-5 py-4 flex items-center gap-3">
      <button onClick={onBack}
        className="w-[34px] h-[34px] rounded-full bg-surface border-[1.5px] border-border
                   flex items-center justify-center text-muted hover:text-text transition">
        ←
      </button>
      <h1 className="font-display font-extrabold text-[17px]">Bank Account</h1>
    </div>
  )
}

function KycBanner () {
  return (
    <div className="rounded-[var(--r)] border border-[#fcd34d] bg-[#fffbeb]
                    dark:bg-[#2d1f05] dark:border-[#78350f]
                    p-4 flex gap-3 items-start">
      <div className="text-2xl shrink-0">⚠️</div>
      <div>
        <div className="font-display font-extrabold text-[14px] text-[#92400e] dark:text-[#fcd34d]">
          KYC required for withdrawals
        </div>
        <div className="text-[12px] leading-relaxed text-[#78350f] dark:text-[#fbbf24] mt-1">
          To withdraw your earnings to your bank account, we need to verify your banking details.
          Minimum withdrawal amount is ₹1,500.
        </div>
      </div>
    </div>
  )
}

function Field ({ label, required, hint, error, children }) {
  return (
    <label className="block">
      <div className="text-[11px] font-bold uppercase tracking-[0.5px] text-text mb-1.5 flex items-center gap-1">
        {label}{required && <span className="text-accent text-sm">*</span>}
      </div>
      {children}
      {hint && !error && <p className="text-[11px] text-muted mt-1.5">{hint}</p>}
      {error && <p className="text-[11px] text-danger mt-1.5">{error}</p>}
    </label>
  )
}

function BankInput ({ error, ...rest }) {
  return (
    <input
      {...rest}
      className={`w-full px-4 py-3 rounded-[var(--rs)] bg-card text-text text-sm
                  border-[1.5px] outline-none transition-colors
                  placeholder:text-[#b0b3be] dark:placeholder:text-[#5b6578]
                  ${error ? 'border-danger' : 'border-border focus:border-accent'}`}
    />
  )
}

// ── Linked view ─────────────────────────────────────────────────────
function LinkedView ({ bank, onEdit, onRemove }) {
  return (
    <div className="bg-card border border-border rounded-[var(--r)] shadow-card overflow-hidden">
      <div className="p-5 bg-gradient-to-br from-[#dbeafe] to-[#ede9fe]
                      dark:from-[#1e3a8a]/30 dark:to-[#4c1d95]/30
                      flex items-center gap-4 border-b border-border">
        <div className="w-14 h-14 rounded-[14px] bg-white text-[#1e40af]
                        shadow-card flex items-center justify-center text-[28px] shrink-0">
          🏦
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-extrabold text-[18px] truncate">{bank.bank_name}</div>
          <div className="text-[12px] text-muted mt-0.5">
            Account ending in <span className="font-mono font-bold text-text">••{bank.last4}</span>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full
                         bg-[#dcfce7] text-[#166534] dark:bg-[#064e3b] dark:text-[#86efac]
                         text-[10px] font-extrabold uppercase tracking-[0.4px]">
          ✓ Verified
        </span>
      </div>
      <div className="p-5 flex flex-col gap-3">
        <Row label="Account holder" value={bank.holder}/>
        <Row label="Account number" value={`••••••••••${bank.last4}`} mono/>
        <Row label="IFSC code" value={bank.ifsc} mono/>
      </div>
      <div className="px-5 pb-5 flex gap-2.5">
        <button onClick={onEdit}
          className="flex-1 py-3 rounded-[var(--rs)] bg-card border-[1.5px] border-border
                     text-sm font-bold text-text hover:border-accent transition">
          Edit details
        </button>
        <button onClick={onRemove}
          className="flex-1 py-3 rounded-[var(--rs)] bg-[#fee2e2] dark:bg-[#7f1d1d]/30
                     text-[#b91c1c] dark:text-[#fecaca] text-sm font-bold
                     hover:bg-[#fecaca] dark:hover:bg-[#7f1d1d]/50 transition">
          Remove bank
        </button>
      </div>
    </div>
  )
}

function Row ({ label, value, mono = false }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-b-0">
      <span className="text-[11px] font-bold uppercase tracking-[0.4px] text-muted">{label}</span>
      <span className={`text-sm font-semibold text-text truncate text-right ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  )
}

// ── Link / edit form ────────────────────────────────────────────────
function BankForm ({ initial, onSubmit, onCancel, busy, isEditing }) {
  const [f, setF] = useState({
    holder:       initial?.holder       || '',
    bank_name:    initial?.bank_name    || '',
    account_full: initial?.account_full || '',
    confirm_acct: initial?.account_full || '',
    ifsc:         initial?.ifsc         || '',
  })
  const [errors, setErrors] = useState({})
  const set = (k, v) => { setF((s) => ({ ...s, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })) }

  const submit = (e) => {
    e.preventDefault()
    const er = {}
    if (!f.holder.trim())                                er.holder      = 'Account holder name is required'
    if (!f.bank_name.trim())                             er.bank_name   = 'Bank name is required'
    if (!/^\d{9,18}$/.test(f.account_full))              er.account_full = 'Account number must be 9–18 digits'
    if (f.account_full !== f.confirm_acct)               er.confirm_acct = "Account numbers don't match"
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(f.ifsc))          er.ifsc        = 'Invalid IFSC code (e.g. HDFC0001234)'
    setErrors(er)
    if (Object.keys(er).length) return
    onSubmit({
      holder:       f.holder.trim(),
      bank_name:    f.bank_name.trim(),
      account_full: f.account_full,
      ifsc:         f.ifsc.toUpperCase(),
    })
  }

  return (
    <form onSubmit={submit} className="bg-card border border-border rounded-[var(--r)] shadow-card">
      <div className="px-5 py-4 border-b border-border">
        <div className="font-display font-extrabold text-[16px]">
          {isEditing ? 'Update bank details' : 'Link a bank account'}
        </div>
        <div className="text-[12px] text-muted mt-0.5">
          Your earnings will be transferred to this account on every withdrawal.
        </div>
      </div>

      <div className="p-5 flex flex-col gap-4">
        <Field label="Account holder name" required error={errors.holder}
          hint="Must match the name on the bank's records exactly.">
          <BankInput placeholder="e.g. Murugan Kumar" value={f.holder}
            onChange={(e) => set('holder', e.target.value)} error={errors.holder}/>
        </Field>

        <Field label="Bank name" required error={errors.bank_name}>
          <BankInput placeholder="e.g. HDFC Bank" value={f.bank_name}
            onChange={(e) => set('bank_name', e.target.value)} error={errors.bank_name}/>
        </Field>

        <Field label="Account number" required error={errors.account_full}
          hint="9–18 digits. We'll mask this once saved.">
          <BankInput inputMode="numeric" maxLength={18}
            placeholder="e.g. 001234567890" value={f.account_full}
            onChange={(e) => set('account_full', e.target.value.replace(/\D/g, ''))}
            error={errors.account_full}/>
        </Field>

        <Field label="Confirm account number" required error={errors.confirm_acct}>
          <BankInput inputMode="numeric" maxLength={18}
            placeholder="Re-enter account number" value={f.confirm_acct}
            onChange={(e) => set('confirm_acct', e.target.value.replace(/\D/g, ''))}
            error={errors.confirm_acct}/>
        </Field>

        <Field label="IFSC code" required error={errors.ifsc}
          hint="11 characters. Found on your chequebook or bank statement.">
          <BankInput maxLength={11} placeholder="e.g. HDFC0001234" value={f.ifsc}
            onChange={(e) => set('ifsc', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            error={errors.ifsc}/>
        </Field>
      </div>

      <div className="px-5 pb-5 flex gap-2.5">
        {isEditing && (
          <button type="button" onClick={onCancel}
            className="flex-1 py-3 rounded-[var(--rs)] bg-surface border-[1.5px] border-border
                       text-sm font-bold text-text">
            Cancel
          </button>
        )}
        <button type="submit" disabled={busy}
          className={`py-3 rounded-[var(--rs)] bg-accent text-white
                      font-display font-bold text-sm
                      shadow-[0_4px_16px_rgba(232,65,26,0.25)]
                      hover:brightness-90 disabled:opacity-60
                      ${isEditing ? 'flex-[2]' : 'w-full'}`}>
          {busy ? 'Saving…' : isEditing ? 'Save changes' : 'Link bank account'}
        </button>
      </div>
    </form>
  )
}

// ── Main ────────────────────────────────────────────────────────────
export default function BankAccountPage () {
  const dispatch = useDispatch()
  const nav      = useNavigate()
  const [bank, setBank] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('view')  // 'view' | 'edit' | 'link'
  const [busy, setBusy] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)

  useEffect(() => {
    api.getBank()
      .then(({ bank }) => { setBank(bank); setMode(bank ? 'view' : 'link') })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const onSave = async (payload) => {
    setBusy(true)
    try {
      const { bank } = await api.linkBank(payload)
      setBank(bank)
      setMode('view')
      dispatch(pushToast({ text: 'Bank account saved ✓' }))
    } catch (e) {
      dispatch(pushToast({ text: e.response?.data?.message || 'Failed to save', type: 'error' }))
    } finally { setBusy(false) }
  }

  const onRemove = async () => {
    setRemoveOpen(false)
    setBusy(true)
    try {
      await api.removeBank()
      setBank(null)
      setMode('link')
      dispatch(pushToast({ text: 'Bank account removed' }))
    } catch (e) {
      dispatch(pushToast({ text: e.response?.data?.message || 'Failed to remove', type: 'error' }))
    } finally { setBusy(false) }
  }

  return (
    <div className="min-h-full animate-pgIn">
      <PageHeader title="Bank Account" onBack={() => nav(-1)}/>

      <div className="p-5 lg:p-7 max-w-[640px] mx-auto flex flex-col gap-4">
        {!bank && <KycBanner/>}

        {loading ? (
          <FormSkeleton fields={4} />
        ) : mode === 'view' && bank ? (
          <LinkedView
            bank={bank}
            onEdit={() => setMode('edit')}
            onRemove={() => setRemoveOpen(true)}
          />
        ) : (
          <BankForm
            initial={mode === 'edit' ? bank : null}
            isEditing={mode === 'edit'}
            busy={busy}
            onCancel={() => setMode('view')}
            onSubmit={onSave}
          />
        )}

        {/* Security note */}
        <div className="bg-card border border-border rounded-[var(--r)] p-4 flex gap-3 text-[12px] text-muted leading-relaxed">
          <span className="text-lg shrink-0">🔒</span>
          <div>
            Your bank details are encrypted and used only for settling your earnings.
            We never share them with customers or third parties.
          </div>
        </div>
      </div>

      <ConfirmModal
        open={removeOpen}
        icon="🏦"
        title="Remove bank account?"
        body="You won't be able to withdraw your wallet balance until you link a bank account again."
        cancelLabel="Cancel"
        confirmLabel="Yes, Remove"
        variant="danger"
        onCancel={() => setRemoveOpen(false)}
        onConfirm={onRemove}
      />
    </div>
  )
}
