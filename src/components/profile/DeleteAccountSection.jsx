// L79 — Delete account flow. Mounted at the bottom of SettingsPage.
//
// Two states:
//   - No pending deletion → red "Delete account" row + confirmation modal.
//     After "Yes, delete", the server sets deletion_requested_at; we show
//     the scheduled-banner UI and offer Cancel.
//   - Pending deletion → orange banner with days remaining + Cancel button.
//
// The actual hard-delete runs server-side via a daily worker that converts
// requested-but-grace-elapsed rows into the existing soft-delete.

import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useTranslation } from 'react-i18next'
import * as api from '@/services/api'
import { pushToast } from '@/features/app/appSlice'
import { selectProfile, hydrateProfile } from '@/features/profile/profileSlice'
import Loader from '@/components/Loader'

const GRACE_DAYS = 7

function daysLeft (requestedAtISO) {
  if (!requestedAtISO) return GRACE_DAYS
  const requestedAt = new Date(requestedAtISO).getTime()
  if (Number.isNaN(requestedAt)) return GRACE_DAYS
  const elapsedMs = Date.now() - requestedAt
  const left = GRACE_DAYS - Math.floor(elapsedMs / (24 * 60 * 60 * 1000))
  return Math.max(0, left)
}

export default function DeleteAccountSection () {
  const dispatch = useDispatch()
  const profile = useSelector(selectProfile)
  const { t } = useTranslation()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  const pending = !!profile?.deletion_requested_at
  const left = pending ? daysLeft(profile.deletion_requested_at) : null

  const requestDeletion = async () => {
    if (busy) return
    setBusy(true)
    try {
      await api.requestAccountDeletion()
      await dispatch(hydrateProfile())
      dispatch(pushToast({
        text: t('deleteAccount.scheduled', { days: GRACE_DAYS }),
      }))
      setConfirm(false)
    } catch (err) {
      dispatch(pushToast({
        text: err?.response?.data?.message || 'Could not schedule deletion',
        type: 'error',
      }))
    } finally { setBusy(false) }
  }

  const cancelDeletion = async () => {
    if (busy) return
    setBusy(true)
    try {
      await api.cancelAccountDeletion()
      await dispatch(hydrateProfile())
      dispatch(pushToast({ text: t('deleteAccount.cancelled') }))
    } catch (err) {
      dispatch(pushToast({
        text: err?.response?.data?.message || 'Could not cancel',
        type: 'error',
      }))
    } finally { setBusy(false) }
  }

  // Pending — banner instead of the row.
  if (pending) {
    return (
      <div className="px-[18px] py-3.5 flex items-start gap-3 bg-[#fef3c7]">
        <span className="text-[18px] leading-none mt-0.5" aria-hidden>⏳</span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold text-[#92400e]">
            {t('deleteAccount.scheduled', { days: left })}
          </div>
          <div className="text-[11px] text-[#92400e] opacity-90 mt-0.5 leading-[1.5]">
            {t('deleteAccount.warning')}
          </div>
        </div>
        <button onClick={cancelDeletion} disabled={busy}
          className="shrink-0 text-[11.5px] font-bold px-3 py-1.5 rounded-full
                     bg-card border border-[#92400e]/30 text-[#92400e]
                     hover:bg-white transition disabled:opacity-60">
          {busy ? '…' : t('deleteAccount.cancel')}
        </button>
      </div>
    )
  }

  return (
    <>
      <div
        onClick={() => !busy && setConfirm(true)}
        className="flex items-center gap-3.5 px-[18px] py-3.5 cursor-pointer
                   hover:bg-surface dark:hover:bg-brand2 transition">
        <div className="w-[38px] h-[38px] rounded-[11px] flex items-center justify-center text-[17px] shrink-0
                        bg-[#fee2e2] text-[#991b1b]">🗑</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-[#dc2626] truncate">
            {t('settings.deleteAccount')}
          </div>
          <div className="text-[11px] text-muted mt-0.5">
            {t('settings.deleteAccountSub')}
          </div>
        </div>
        <span className="text-lg text-muted font-light">›</span>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm
                        flex items-center justify-center p-4 animate-fadeIn"
             onClick={() => !busy && setConfirm(false)}>
          <div className="w-full max-w-[420px] bg-card border border-border rounded-[16px]
                          shadow-[0_20px_60px_rgba(0,0,0,0.35)] overflow-hidden"
               onClick={(e) => e.stopPropagation()}>
            <div className="h-1 bg-[#dc2626] w-full" />
            <div className="p-5">
              <div className="text-[28px] text-center">⚠️</div>
              <h2 className="font-display text-[18px] font-extrabold text-text text-center m-0 mt-1">
                {t('deleteAccount.title')}
              </h2>
              <p className="text-[12.5px] text-muted text-center m-0 mt-2 leading-[1.55]">
                {t('deleteAccount.warning')}
              </p>

              <div className="grid grid-cols-3 gap-2 mt-5">
                <button onClick={() => !busy && setConfirm(false)} disabled={busy}
                  className="bg-card border border-border text-muted text-[12px] font-bold
                             py-2.5 rounded-[10px] hover:text-text transition
                             disabled:opacity-60">
                  {t('common.cancel')}
                </button>
                <button onClick={requestDeletion} disabled={busy}
                  className="col-span-2 bg-[#dc2626] text-white text-[13px] font-bold
                             py-2.5 rounded-[10px] hover:brightness-110 transition
                             disabled:opacity-60 disabled:cursor-not-allowed
                             shadow-[0_4px_12px_rgba(220,38,38,0.3)]">
                  {busy
                    ? <span className="inline-flex items-center gap-2 justify-center"><Loader size={12} /> …</span>
                    : t('deleteAccount.confirm')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
