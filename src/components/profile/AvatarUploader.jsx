// L78 — Profile photo uploader. Renders the current avatar (uploaded photo
// or the deterministic initials circle) and offers Upload / Remove.
//
// Crop strategy: we don't ship a UI cropper here — the user picks a file,
// we center-crop to a square on a canvas at 512×512 max, encode as JPEG,
// and upload the resulting blob. Keeps the dependency footprint at zero.
// If we ever want a touch crop UI, replace cropToSquareBlob with a real
// cropper (react-easy-crop).

import { useRef, useState } from 'react'
import { useDispatch } from 'react-redux'
import * as api from '@/services/api'
import { pushToast } from '@/features/app/appSlice'
import { resolveAssetUrl } from '@/constants/api'
import { hydrateProfile } from '@/features/profile/profileSlice'
import ConfirmModal from '@/components/profile/ConfirmModal'

const OUTPUT_SIZE = 512
const OUTPUT_TYPE = 'image/jpeg'
const OUTPUT_QUALITY = 0.85

// Center-crop the picked image to a square, scale to OUTPUT_SIZE, return a
// JPEG blob. Returns null on failure so the caller can toast the user
// instead of throwing.
async function cropToSquareBlob (file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type?.startsWith('image/')) {
      reject(new Error('Pick an image file'))
      return
    }
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        const size = Math.min(img.naturalWidth, img.naturalHeight)
        const sx = Math.floor((img.naturalWidth  - size) / 2)
        const sy = Math.floor((img.naturalHeight - size) / 2)
        const canvas = document.createElement('canvas')
        canvas.width = OUTPUT_SIZE
        canvas.height = OUTPUT_SIZE
        const ctx = canvas.getContext('2d')
        // White fill in case the source is transparent — JPEGs don't
        // support alpha and black backgrounds look ugly behind avatars.
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
        ctx.drawImage(img, sx, sy, size, size, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url)
          if (!blob) reject(new Error('Could not encode image'))
          else      resolve(blob)
        }, OUTPUT_TYPE, OUTPUT_QUALITY)
      } catch (e) {
        URL.revokeObjectURL(url)
        reject(e)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read image'))
    }
    img.src = url
  })
}

export default function AvatarUploader ({ profile, size = 96 }) {
  const dispatch = useDispatch()
  const inputRef = useRef(null)
  const [busy, setBusy]   = useState(false)
  // Optimistic preview while the upload runs.
  const [preview, setPreview] = useState(null)
  // M88 — Confirmation for the destructive Remove action.
  const [confirmingRemove, setConfirmingRemove] = useState(false)

  const url = preview || resolveAssetUrl(profile?.avatar_url)
  const initials = (profile?.full_name || profile?.email || 'U')
    .trim().split(/\s+/).slice(0, 2)
    .map((p) => p[0] || '').join('').toUpperCase() || 'U'
  const avClass = profile?.avatar_class || 'pav-a'

  const onPick = () => { if (!busy) inputRef.current?.click() }

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file || busy) return
    setBusy(true)
    let localUrl = null
    try {
      const blob = await cropToSquareBlob(file)
      localUrl = URL.createObjectURL(blob)
      setPreview(localUrl)
      await api.uploadAvatar(blob)
      // Re-hydrate so the new avatar_url propagates everywhere (chat,
      // reviews, etc.) without a full reload.
      await dispatch(hydrateProfile())
      dispatch(pushToast({ text: 'Profile photo updated' }))
    } catch (err) {
      dispatch(pushToast({
        text: err?.response?.data?.message || err.message || 'Could not upload',
        type: 'error',
      }))
      setPreview(null)
    } finally {
      if (localUrl) {
        // Slight delay so the preview swap is visible before revoking.
        setTimeout(() => URL.revokeObjectURL(localUrl), 1500)
      }
      setBusy(false)
    }
  }

  // M88 — Step 1: open the confirm modal. Step 2 (doRemove) hits the API.
  const onRemove = () => {
    if (busy || !profile?.avatar_url) return
    setConfirmingRemove(true)
  }
  const doRemove = async () => {
    setBusy(true)
    try {
      await api.removeAvatar()
      setPreview(null)
      await dispatch(hydrateProfile())
      dispatch(pushToast({ text: 'Photo removed' }))
    } catch (err) {
      dispatch(pushToast({
        text: err?.response?.data?.message || 'Could not remove',
        type: 'error',
      }))
    } finally {
      setBusy(false)
      setConfirmingRemove(false)
    }
  }

  return (
    <>
      {/* Compact avatar with corner controls — camera badge to change/upload,
          small ✕ to remove. Keeps the profile header tidy (no big text buttons). */}
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        {url ? (
          <img src={url} alt="Profile"
            className="w-full h-full rounded-full object-cover border-2 border-card shadow-card" />
        ) : (
          <div className={`w-full h-full rounded-full ${avClass} flex items-center justify-center
                           border-2 border-card shadow-card font-extrabold text-text`}
               style={{ fontSize: Math.round(size / 3) }}>
            {initials}
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 rounded-full bg-black/40 grid place-items-center
                          text-white text-[11px] font-bold">
            …
          </div>
        )}

        {/* Change / upload */}
        <button onClick={onPick} disabled={busy}
          aria-label={profile?.avatar_url ? 'Change photo' : 'Upload photo'}
          title={profile?.avatar_url ? 'Change photo' : 'Upload photo'}
          className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-accent text-white
                     border-2 border-card grid place-items-center text-[12px] shadow-card
                     hover:brightness-90 transition disabled:opacity-60">
          📷
        </button>

        {/* Remove — only when a photo is set */}
        {profile?.avatar_url && !busy && (
          <button onClick={onRemove}
            aria-label="Remove photo" title="Remove photo"
            className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-card border border-border
                       text-[#dc2626] grid place-items-center text-[11px] shadow-card
                       hover:bg-[#fee2e2] transition">
            ✕
          </button>
        )}

        <input ref={inputRef} type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="user"
          onChange={onFile}
          className="hidden" />
      </div>

      {/* M88 — In-app confirm for destructive avatar removal. */}
      <ConfirmModal
        open={confirmingRemove}
        icon="🗑"
        variant="danger"
        title="Remove your profile photo?"
        body="Your initials circle will show up everywhere instead. You can upload a new photo later."
        cancelLabel="Keep"
        confirmLabel={busy ? 'Removing…' : 'Remove'}
        onCancel={() => !busy && setConfirmingRemove(false)}
        onConfirm={doRemove} />
    </>
  )
}
