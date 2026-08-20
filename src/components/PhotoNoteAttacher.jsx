// H25 — Photo (up to 3) + 1-line note. Lives inside the PartnerDetailPage
// hero so the customer can attach context before the request goes out.
// Photos upload eagerly to /api/uploads/request-photo; the returned URL is
// stored locally and submitted with the request payload's `photos` array.

import { useRef, useState } from 'react'
import * as api from '@/services/api'
import { resolveAssetUrl } from '@/constants/api'

const NOTE_MAX = 140

export default function PhotoNoteAttacher ({
  photoUrls, setPhotoUrls, note, setNote,
}) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [err,  setErr]  = useState('')
  const [expanded, setExpanded] = useState(false)

  const onPickFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''   // allow re-picking the same file
    if (!file) return
    if (photoUrls.length >= 3) {
      setErr('You can attach up to 3 photos.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setErr('That photo is over 5 MB — please pick a smaller one.')
      return
    }
    setBusy(true); setErr('')
    try {
      const r = await api.uploadRequestPhoto(file)
      setPhotoUrls([...photoUrls, r.url])
    } catch (e2) {
      setErr(e2?.response?.data?.message || e2?.message || 'Upload failed')
    } finally { setBusy(false) }
  }

  const remove = (idx) => setPhotoUrls(photoUrls.filter((_, i) => i !== idx))

  return (
    <div className="mt-2.5">
      {!expanded && photoUrls.length === 0 && !note ? (
        <button type="button" onClick={() => setExpanded(true)}
          className="text-[12px] text-white/80 underline underline-offset-2 hover:text-white">
          + Add a photo or note (optional)
        </button>
      ) : (
        <div className="rounded-[var(--rs)] bg-white/[0.07] border border-white/15 px-3 py-3">
          {/* Note */}
          <label className="block text-[10px] uppercase tracking-[0.5px] font-bold text-white/55 mb-1">
            One-line note (optional)
          </label>
          <input
            type="text" value={note}
            onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
            placeholder="e.g. Leaking under sink — pic attached"
            className="w-full bg-card/10 border border-white/20 rounded-[var(--rs)]
                       px-3 py-2 text-[13px] text-white placeholder:text-white/40
                       outline-none focus:border-accent transition" />
          <div className="text-right text-[10px] text-white/40 mt-0.5">
            {note.length}/{NOTE_MAX}
          </div>

          {/* Photos */}
          <label className="block text-[10px] uppercase tracking-[0.5px] font-bold text-white/55 mt-2 mb-1">
            Photos ({photoUrls.length}/3)
          </label>
          <div className="flex gap-2 flex-wrap">
            {photoUrls.map((u, i) => (
              <div key={u} className="relative w-14 h-14 rounded-md overflow-hidden border border-white/20">
                <img src={resolveAssetUrl(u)} alt={`Photo ${i + 1}`}
                     className="w-full h-full object-cover" />
                <button type="button" onClick={() => remove(i)}
                  aria-label="Remove photo"
                  className="absolute -top-1 -right-1 bg-card text-text rounded-full
                             w-5 h-5 text-[11px] font-bold border border-border
                             shadow-card grid place-items-center hover:brightness-95">
                  ×
                </button>
              </div>
            ))}
            {photoUrls.length < 3 && (
              <button type="button" onClick={() => inputRef.current?.click()}
                disabled={busy}
                className="w-14 h-14 rounded-md border border-dashed border-white/40
                           text-white/75 text-[18px] grid place-items-center
                           hover:border-white hover:text-white transition
                           disabled:opacity-50">
                {busy ? '…' : '+'}
              </button>
            )}
            <input ref={inputRef} type="file" accept="image/*"
              onChange={onPickFile} className="hidden" />
          </div>
          {err && <div className="text-[11px] text-[#fca5a5] mt-1">{err}</div>}
        </div>
      )}
    </div>
  )
}
