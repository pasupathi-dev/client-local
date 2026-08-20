// M75 — Customer-side saved addresses manager. Mounted on the customer's
// profile. The same rows drive the H26 AddressConfirmSheet on the booking
// flow, so picking a default here makes the next booking one-tap.
//
// Server caps at 8 entries; default flips are handled atomically by the
// PATCH endpoint. We keep this card simple: list rows, edit label,
// set/unset default, delete. Adding a new row uses an inline form.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDispatch } from 'react-redux'
import * as api from '@/services/api'
import { pushToast } from '@/features/app/appSlice'
import { saveProfileThunk } from '@/features/profile/profileSlice'
import ProfileCard from '@/components/profile/ProfileCard'
import ConfirmModal from '@/components/profile/ConfirmModal'

const COMMON_LABELS = ['Home', 'Office', 'Other']
// UI cap on how many addresses a customer can keep.
const MAX_ADDRESSES = 3

function LabelIcon ({ label }) {
  const l = String(label || '').toLowerCase()
  if (l === 'home')   return <span aria-hidden>🏠</span>
  if (l === 'office') return <span aria-hidden>💼</span>
  return <span aria-hidden>📍</span>
}

// Add / edit address in a popup (bottom-sheet on phones, dialog on desktop).
function AddressFormModal ({ open, initial, busy, onSave, onClose }) {
  const [label, setLabel]     = useState('Home')
  const [addr, setAddr]       = useState('')
  const [city, setCity]       = useState('')
  const [pincode, setPincode] = useState('')

  // Sync fields each time the popup opens (blank for add, pre-filled for edit).
  useEffect(() => {
    if (!open) return
    setLabel(initial?.label || 'Home')
    setAddr(initial?.address || '')
    setCity(initial?.city || '')
    setPincode(initial?.pincode || '')
  }, [open, initial])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose?.() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  if (!open) return null

  const submit = () => {
    const t = addr.trim()
    if (!t) return
    onSave({ label: label.trim() || 'Other', address: t, city: city.trim(), pincode: pincode.trim() })
  }

  return createPortal(
    <div onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose?.() }}
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4
                 bg-[rgba(10,15,30,0.6)] backdrop-blur-[4px] animate-pgIn">
      <div className="bg-card w-full sm:max-w-[460px] rounded-t-[24px] sm:rounded-[20px]
                      shadow-[0_20px_60px_rgba(0,0,0,0.25)] overflow-hidden
                      animate-slideUp sm:animate-popIn max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-border flex items-center gap-3">
          <div className="w-10 h-10 rounded-[12px] bg-accent/10 text-accent grid place-items-center text-[18px] shrink-0">📍</div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display font-extrabold text-[16px] text-text">
              {initial ? 'Edit address' : 'Add address'}
            </h2>
            <p className="text-[11px] text-muted">Saved for one-tap booking</p>
          </div>
          <button onClick={() => !busy && onClose?.()} aria-label="Close" disabled={busy}
            className="w-8 h-8 rounded-full bg-surface border border-border text-muted text-[14px]
                       hover:text-text transition shrink-0 disabled:opacity-50">✕</button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto flex flex-col gap-3">
          <div className="flex gap-1.5 flex-wrap">
            {COMMON_LABELS.map((l) => (
              <button key={l} type="button" onClick={() => setLabel(l)}
                className={`px-3 py-1.5 rounded-full text-[12px] font-bold border transition
                            ${label === l
                              ? 'bg-accent border-accent text-white'
                              : 'bg-surface border-border text-text hover:border-accent'}`}>
                {l}
              </button>
            ))}
          </div>
          <textarea value={addr}
            onChange={(e) => setAddr(e.target.value.slice(0, 500))}
            placeholder="Full address — door number, street, area"
            rows={3}
            className="w-full bg-surface border border-border rounded-[10px]
                       px-3 py-2.5 text-[13px] text-text placeholder:text-muted
                       focus:outline-none focus:border-accent resize-none" />
          <div className="grid grid-cols-2 gap-3">
            <input type="text" value={city}
              onChange={(e) => setCity(e.target.value.slice(0, 120))}
              placeholder="City"
              className="w-full bg-surface border border-border rounded-[10px]
                         px-3 py-2.5 text-[13px] text-text placeholder:text-muted
                         focus:outline-none focus:border-accent" />
            <input type="text" inputMode="numeric" maxLength={6} value={pincode}
              onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="Pincode"
              className="w-full bg-surface border border-border rounded-[10px]
                         px-3 py-2.5 text-[13px] text-text placeholder:text-muted
                         focus:outline-none focus:border-accent" />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
          <button onClick={() => !busy && onClose?.()} disabled={busy}
            className="text-[12px] font-bold px-4 py-2 rounded-full border border-border bg-card
                       text-muted hover:text-text transition disabled:opacity-60">
            Cancel
          </button>
          <button onClick={submit} disabled={busy || !addr.trim()}
            className="text-[12px] font-bold px-5 py-2 rounded-full bg-accent text-white
                       hover:brightness-90 transition disabled:opacity-50 disabled:cursor-not-allowed">
            {busy ? 'Saving…' : (initial ? 'Save changes' : 'Save address')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function AddressRow ({ row, onMakeDefault, onDelete, onEdit, busy }) {
  return (
    <div className="flex items-start gap-3 px-[18px] py-3.5 border-t border-border first:border-t-0">
      <div className="w-[38px] h-[38px] rounded-[11px] flex items-center justify-center text-[17px] shrink-0
                      bg-surface text-text">
        <LabelIcon label={row.label} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[13px] font-bold text-text">{row.label || 'Other'}</span>
          {!!row.is_default && (
            <span className="text-[9px] font-extrabold uppercase tracking-[0.4px]
                             px-1.5 py-[2px] rounded-full bg-[#dcfce7] text-[#166534]">
              Default
            </span>
          )}
        </div>
        <div className="text-[11.5px] text-muted leading-[1.55] mt-0.5">
          {row.address}
          {(row.city || row.pincode) && (
            <span className="block text-[11px] text-light mt-0.5">
              {[row.city, row.pincode].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1.5">
          {!row.is_default && (
            <button onClick={() => onMakeDefault(row)} disabled={busy}
              className="text-[11px] font-bold text-accent hover:underline disabled:opacity-60">
              Set as default
            </button>
          )}
          <button onClick={() => onEdit(row)} disabled={busy}
            className="text-[11px] font-bold text-muted hover:text-text transition disabled:opacity-60">
            Edit
          </button>
          <button onClick={() => onDelete(row)} disabled={busy}
            className="text-[11px] font-bold text-muted hover:text-[#dc2626] transition disabled:opacity-60">
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SavedAddressesCard () {
  const dispatch = useDispatch()
  const [list, setList]     = useState(null) // null = loading
  const [formOpen, setFormOpen] = useState(false)
  const [editRow, setEditRow]   = useState(null) // row being edited (null = adding)
  const [busy, setBusy]     = useState(false)
  // M88 — Holds the row pending deletion confirmation. Replaces the
  // browser confirm() that used to gate Delete.
  const [pendingDelete, setPendingDelete] = useState(null)

  const load = async () => {
    try {
      const r = await api.fetchSavedAddresses()
      setList(r?.addresses || [])
    } catch { setList([]) }
  }
  useEffect(() => { load() }, [])

  const addNew = async ({ label, address, city, pincode }) => {
    setBusy(true)
    try {
      await api.createSavedAddress({ label, address, city, pincode })
      await load()
      setFormOpen(false)
      dispatch(pushToast({ text: 'Address saved' }))
    } catch (err) {
      dispatch(pushToast({
        text: err?.response?.data?.message || 'Could not save address',
        type: 'error',
      }))
    } finally { setBusy(false) }
  }

  const saveEdit = async (row, { label, address, city, pincode }) => {
    setBusy(true)
    try {
      await api.updateSavedAddress(row.id, { label, address, city, pincode })
      await load()
      setFormOpen(false)
      dispatch(pushToast({ text: 'Address updated' }))
    } catch (err) {
      dispatch(pushToast({
        text: err?.response?.data?.message || 'Could not update address',
        type: 'error',
      }))
    } finally { setBusy(false) }
  }

  const makeDefault = async (row) => {
    setBusy(true)
    try {
      await api.updateSavedAddress(row.id, { is_default: true })
      // Setting an address as default also becomes the profile's location, so
      // the profile + next booking reflect it. Only push fields the row has.
      const patch = { address: row.address }
      if (row.city)    patch.city    = row.city
      if (row.pincode) patch.pincode = row.pincode
      await dispatch(saveProfileThunk(patch)).unwrap().catch(() => {})
      await load()
      dispatch(pushToast({ text: `"${row.label}" is now your default location` }))
    } catch (err) {
      dispatch(pushToast({
        text: err?.response?.data?.message || 'Could not update',
        type: 'error',
      }))
    } finally { setBusy(false) }
  }

  // M88 — Step 1: open the confirmation modal. Step 2 (confirmDelete) runs
  // the actual API call when the user taps Delete.
  const remove = (row) => setPendingDelete(row)
  const confirmDelete = async () => {
    const row = pendingDelete
    if (!row) return
    setBusy(true)
    try {
      await api.deleteSavedAddress(row.id)
      await load()
      dispatch(pushToast({ text: 'Address removed' }))
    } catch (err) {
      dispatch(pushToast({
        text: err?.response?.data?.message || 'Could not delete',
        type: 'error',
      }))
    } finally {
      setBusy(false)
      setPendingDelete(null)
    }
  }

  const atCap = list && list.length >= MAX_ADDRESSES
  const openAdd  = () => { setEditRow(null); setFormOpen(true) }
  const openEdit = (row) => { setEditRow(row); setFormOpen(true) }
  const submitForm = (data) => (editRow ? saveEdit(editRow, data) : addNew(data))

  return (
    <ProfileCard icon="📍" title="Saved addresses" padBody={false}>
      {list === null && (
        <div className="px-[18px] py-5 text-center text-[12px] text-muted">Loading…</div>
      )}
      {list?.length === 0 && (
        <div className="px-[18px] py-5 text-center text-[12px] text-muted">
          No saved addresses yet — add Home or Office for one-tap booking.
        </div>
      )}
      {list?.map((row) => (
        <AddressRow key={row.id} row={row}
          busy={busy}
          onMakeDefault={makeDefault}
          onEdit={openEdit}
          onDelete={remove} />
      ))}

      <div className="px-[18px] py-3 border-t border-border">
        <button
          onClick={openAdd}
          disabled={atCap}
          className="text-[12px] font-bold px-3 py-1.5 rounded-full
                     border border-border bg-card text-accent hover:border-accent transition
                     disabled:opacity-50 disabled:cursor-not-allowed">
          {atCap ? `Limit reached (max ${MAX_ADDRESSES})` : '+ Add new address'}
        </button>
      </div>

      {/* Add / edit popup */}
      <AddressFormModal
        open={formOpen}
        initial={editRow}
        busy={busy}
        onSave={submitForm}
        onClose={() => !busy && setFormOpen(false)} />

      {/* M88 — In-app confirm replaces window.confirm so the prompt matches
          the design system and works inside webviews. */}
      <ConfirmModal
        open={!!pendingDelete}
        icon="🗑"
        variant="danger"
        title="Delete this address?"
        body={pendingDelete
          ? `"${pendingDelete.label || 'Address'}" — ${(pendingDelete.address || '').slice(0, 80)}${(pendingDelete.address || '').length > 80 ? '…' : ''}`
          : ''}
        cancelLabel="Keep"
        confirmLabel={busy ? 'Deleting…' : 'Delete'}
        onCancel={() => !busy && setPendingDelete(null)}
        onConfirm={confirmDelete} />
    </ProfileCard>
  )
}
