// Trusted contacts — customer-only address book used by the SOS share-trip
// flow. Capped at 5 per user (server-enforced; we render an "add disabled"
// hint when the list is full). One default at a time — flipping the toggle
// on a row unsets the others.
//
// Self-contained: mount it inside <ProfileCard /> on the customer Profile.

import { useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'
import * as api from '@/services/api'
import { pushToast } from '@/features/app/appSlice'
import Loader from '@/components/Loader'

const MAX_CONTACTS = 5
const isValidPhone = (s) => /^\+?\d[\d\s-]{6,18}\d$/.test(String(s || '').trim())

export default function TrustedContactsCard () {
  const dispatch = useDispatch()
  const [list, setList]       = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)   // null | 'new' | id of row being edited
  const [busy, setBusy]       = useState(false)

  const refresh = async () => {
    setLoading(true)
    try {
      const r = await api.fetchTrustedContacts()
      setList(r?.contacts || [])
    } catch {
      setList([])
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { refresh() }, [])

  const remove = async (id) => {
    if (busy) return
    setBusy(true)
    try {
      await api.removeTrustedContact(id)
      dispatch(pushToast({ text: 'Contact removed' }))
      await refresh()
    } catch (err) {
      dispatch(pushToast({ text: err?.response?.data?.message || 'Could not remove' }))
    } finally {
      setBusy(false)
    }
  }

  const setDefault = async (id) => {
    if (busy) return
    setBusy(true)
    try {
      await api.updateTrustedContact(id, { is_default: true })
      // Optimistically flip locally so the toggle responds instantly even
      // before the refresh round-trip completes.
      setList((prev) => prev.map((c) => ({ ...c, is_default: c.id === id })))
      await refresh()
    } catch (err) {
      dispatch(pushToast({ text: err?.response?.data?.message || 'Could not update' }))
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const cap = list.length >= MAX_CONTACTS
  const showForm = editing !== null

  return (
    <div className="px-[18px] lg:px-6 py-4">
      <p className="text-[12px] text-muted leading-[1.55] m-0 mb-3">
        Saved contacts you can share a live trip with in one tap. Up to {MAX_CONTACTS}.
        Mark one as Default to pre-pick it on the SOS modal.
      </p>

      {loading ? (
        <div className="py-6 text-center text-muted text-sm">
          <Loader size={14} /> Loading…
        </div>
      ) : list.length === 0 ? (
        <div className="bg-surface border border-border rounded-[var(--rs)] py-6 px-4 text-center mb-3">
          <p className="text-[13px] font-bold text-text m-0">No contacts saved yet</p>
          <p className="text-[11px] text-muted m-0 mt-1 leading-[1.55]">
            Add the people you'd want notified if you needed to share a live trip.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2 m-0 p-0 list-none mb-3">
          {list.map((c) => (
            <ContactRow key={c.id} contact={c}
              busy={busy}
              isEditing={editing === c.id}
              onEdit={() => setEditing(c.id)}
              onCancelEdit={() => setEditing(null)}
              onSaved={async () => { setEditing(null); await refresh() }}
              onRemove={() => remove(c.id)}
              onSetDefault={() => setDefault(c.id)} />
          ))}
        </ul>
      )}

      {/* Add form */}
      {editing === 'new' ? (
        <ContactForm
          submitLabel="Add contact"
          onCancel={() => setEditing(null)}
          onSubmit={async (payload) => {
            setBusy(true)
            try {
              await api.createTrustedContact(payload)
              dispatch(pushToast({ text: 'Contact saved' }))
              setEditing(null)
              await refresh()
            } catch (err) {
              dispatch(pushToast({ text: err?.response?.data?.message || 'Could not save' }))
            } finally { setBusy(false) }
          }}
        />
      ) : (
        <button onClick={() => setEditing('new')} disabled={cap || showForm}
          className="w-full py-2.5 rounded-[var(--rs)] border border-dashed border-border
                     text-[13px] font-bold text-muted hover:text-accent hover:border-accent
                     transition disabled:opacity-50 disabled:cursor-not-allowed">
          {cap ? `Cap reached · ${list.length}/${MAX_CONTACTS}` : '＋ Add contact'}
        </button>
      )}
    </div>
  )
}

function ContactRow ({ contact, busy, isEditing, onEdit, onCancelEdit, onSaved, onRemove, onSetDefault }) {
  if (isEditing) {
    return (
      <li className="bg-surface border border-border rounded-[var(--rs)] p-3">
        <ContactForm
          initial={contact}
          submitLabel="Save changes"
          onCancel={onCancelEdit}
          onSubmit={async (payload) => {
            try {
              await api.updateTrustedContact(contact.id, payload)
              onSaved?.()
            } catch (err) {
              // Surface error inline so the user doesn't lose what they typed.
              throw err
            }
          }}
        />
      </li>
    )
  }
  return (
    <li className="bg-card border border-border rounded-[var(--rs)] p-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-full bg-surface border border-border
                      flex items-center justify-center text-[14px] font-bold shrink-0">
        {(contact.name?.[0] || '?').toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[13px] font-bold text-text m-0 truncate">{contact.name}</p>
          {contact.is_default && (
            <span className="text-[9px] font-extrabold uppercase tracking-[0.4px]
                             px-1.5 py-[2px] rounded-full bg-accent/10 text-accent">
              Default
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted m-0 mt-0.5 truncate">
          {contact.phone}{contact.relation ? ` · ${contact.relation}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {!contact.is_default && (
          <button onClick={onSetDefault} disabled={busy}
            title="Set as default"
            className="text-[11px] font-bold text-muted hover:text-accent
                       px-2 py-1 rounded-md hover:bg-surface transition
                       disabled:opacity-60">
            ⭐ Default
          </button>
        )}
        <button onClick={onEdit}
          title="Edit"
          className="text-muted hover:text-text px-2 py-1 rounded-md hover:bg-surface transition">
          ✏️
        </button>
        <button onClick={onRemove} disabled={busy}
          title="Remove"
          className="text-muted hover:text-[#dc2626] px-2 py-1 rounded-md hover:bg-surface transition
                     disabled:opacity-60">
          🗑
        </button>
      </div>
    </li>
  )
}

function ContactForm ({ initial = {}, submitLabel, onSubmit, onCancel }) {
  const dispatch = useDispatch()
  const [name, setName]         = useState(initial.name || '')
  const [phone, setPhone]       = useState(initial.phone || '')
  const [relation, setRelation] = useState(initial.relation || '')
  const [isDefault, setIsDefault] = useState(!!initial.is_default)
  const [busy, setBusy]         = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    if (!name.trim()) {
      dispatch(pushToast({ text: 'Enter a name' })); return
    }
    if (!isValidPhone(phone)) {
      dispatch(pushToast({ text: 'Enter a valid phone number' })); return
    }
    setBusy(true)
    try {
      await onSubmit({
        name:       name.trim(),
        phone:      phone.trim(),
        relation:   relation.trim() || null,
        is_default: !!isDefault,
      })
    } catch (err) {
      dispatch(pushToast({ text: err?.response?.data?.message || 'Could not save' }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <input type="text" value={name} onChange={(e) => setName(e.target.value.slice(0, 120))}
        placeholder="Name"
        className="w-full bg-card border border-border rounded-[8px]
                   px-3 py-2.5 text-[13px] text-text placeholder:text-muted
                   focus:outline-none focus:border-accent" />
      <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value.slice(0, 20))}
        placeholder="Phone (with country code, e.g. +91…)"
        className="w-full bg-card border border-border rounded-[8px]
                   px-3 py-2.5 text-[13px] text-text placeholder:text-muted
                   focus:outline-none focus:border-accent" />
      <input type="text" value={relation} onChange={(e) => setRelation(e.target.value.slice(0, 60))}
        placeholder="Relation (optional, e.g. Spouse, Mom)"
        className="w-full bg-card border border-border rounded-[8px]
                   px-3 py-2.5 text-[13px] text-text placeholder:text-muted
                   focus:outline-none focus:border-accent" />

      <label className="flex items-center gap-2 text-[12px] text-muted cursor-pointer mt-0.5">
        <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)}
          className="accent-accent w-4 h-4" />
        Make this the default share-trip contact
      </label>

      <div className="grid grid-cols-3 gap-2 mt-2">
        <button type="button" onClick={onCancel} disabled={busy}
          className="bg-card border border-border text-muted text-[12px] font-bold
                     py-2.5 rounded-[8px] hover:text-text transition
                     disabled:opacity-60">
          Cancel
        </button>
        <button type="submit" disabled={busy}
          className="col-span-2 bg-accent text-white text-[13px] font-bold
                     py-2.5 rounded-[8px] hover:brightness-90 transition
                     disabled:opacity-60 disabled:cursor-not-allowed">
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
