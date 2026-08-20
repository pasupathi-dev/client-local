// Settings — partner-primary per local.html, but we show a shared page
// with a "Notifications" block that's visible only to partners.

import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { selectTheme, toggleTheme, selectMode, pushToast } from '@/features/app/appSlice'
import * as api from '@/services/api'
import Toggle from '@/components/profile/Toggle'
import { SUPPORTED as SUPPORTED_LOCALES, setLocale, setLocaleFromSettings } from '@/i18n'
import DeleteAccountSection from '@/components/profile/DeleteAccountSection'
import BlockedDatesCard      from '@/components/profile/BlockedDatesCard'

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

function SectionLabel ({ children }) {
  return (
    <div className="px-[18px] pt-3 pb-1.5 text-[10px] font-extrabold uppercase tracking-[0.6px] text-muted">
      {children}
    </div>
  )
}

function Section ({ children }) {
  return (
    <div className="bg-card border border-border rounded-[var(--r)] shadow-card overflow-hidden mb-4">
      {children}
    </div>
  )
}

function Row ({ icon, bg, fg, title, sub, right, onClick, chevron = false }) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3.5 px-[18px] py-3.5 border-t border-border first:border-t-0
                  ${onClick ? 'cursor-pointer hover:bg-surface dark:hover:bg-brand2' : ''}`}>
      <div className="w-[38px] h-[38px] rounded-[11px] flex items-center justify-center text-[17px] shrink-0"
           style={{ background: bg, color: fg }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-text truncate">{title}</div>
        {sub && <div className="text-[11px] text-muted mt-0.5">{sub}</div>}
      </div>
      {right}
      {chevron && <span className="text-lg text-muted font-light">›</span>}
    </div>
  )
}

// M77 — Inline language picker. Renders the supported locales as a row of
// pills; tapping persists locally + on the server (best-effort) and
// switches react-i18next live (no reload).
function LanguagePicker ({ value, onChange, busy }) {
  return (
    <div className="px-[18px] py-3.5 border-t border-border">
      <div className="flex items-center gap-3.5">
        <div className="w-[38px] h-[38px] rounded-[11px] flex items-center justify-center text-[17px] shrink-0
                        bg-[#dcfce7] text-[#166534]">🌐</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-text">
            {/* eslint-disable-next-line react-hooks/rules-of-hooks */}
            {useTranslation().t('settings.language')}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2 ml-[52px]">
        {SUPPORTED_LOCALES.map((l) => (
          <button key={l.code} type="button"
            onClick={() => onChange(l.code)}
            disabled={busy}
            className={`px-3 py-1.5 rounded-full text-[12px] font-bold border transition
                        ${value === l.code
                          ? 'bg-accent border-accent text-white shadow-[0_4px_12px_rgba(232,65,26,0.3)]'
                          : 'bg-card border-border text-text hover:border-accent'}
                        disabled:opacity-60`}>
            {l.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function SettingsPage () {
  const dispatch = useDispatch()
  const nav      = useNavigate()
  const theme    = useSelector(selectTheme)
  const mode     = useSelector(selectMode)
  const isPartner = mode === 'partner'
  const { t, i18n } = useTranslation()

  // app_settings (server-backed). H53 added a Notifications block visible to
  // BOTH customers and partners (Mute Promos). The partner-only rows below
  // still gate on isPartner. Fetched for everyone so the customer-side
  // "Mute Promos" toggle works.
  const [settings, setSettings] = useState(null)
  useEffect(() => {
    api.fetchSettings().then(({ settings }) => {
      setSettings(settings)
      // M77 — if the user never set a locale this session, follow the
      // server-stored one.
      setLocaleFromSettings(settings?.locale)
    }).catch(() => {})
  }, [])

  const setFlag = async (key, value) => {
    setSettings((s) => ({ ...(s || {}), [key]: value })) // optimistic
    try {
      const { settings } = await api.updateSettings({ [key]: value })
      setSettings(settings)
      dispatch(pushToast({ text: t('settings.saved') }))
    } catch {
      // revert
      setSettings((s) => ({ ...(s || {}), [key]: !value }))
    }
  }

  // M77 — Locale change: switch live first (so the UI flips instantly),
  // then persist server-side. If persist fails the UI stays in the new
  // language — local storage is the source of truth for next session.
  const onPickLocale = async (code) => {
    setLocale(code)
    setSettings((s) => ({ ...(s || {}), locale: code }))
    try {
      const { settings } = await api.updateSettings({ locale: code })
      setSettings(settings)
    } catch {
      // Silent — local persistence still works.
    }
  }

  return (
    <div className="min-h-full animate-pgIn">
      <PageHeader title={t('settings.title')} onBack={() => nav(-1)}/>

      <div className="p-5 lg:p-7 max-w-[720px] mx-auto">
        {/* Appearance */}
        <SectionLabel>{t('settings.appearance')}</SectionLabel>
        <Section>
          <Row
            icon={theme === 'dark' ? '☀️' : '🌙'} bg="#1f2937" fg="#fff"
            title={t('settings.darkMode')}
            sub={t('settings.darkModeSub')}
            right={<Toggle on={theme === 'dark'} onChange={() => dispatch(toggleTheme())} />}
          />
        </Section>

        {/* Notifications — Mute Promos is visible to everyone (H53);
            partner-only rows below it. */}
        {settings && (
          <>
            <SectionLabel>{t('settings.notifications')}</SectionLabel>
            <Section>
              <Row icon="🎁" bg="#fde68a" fg="#92400e"
                title={t('settings.mutePromos')}
                sub={t('settings.mutePromosSub')}
                right={<Toggle on={!!settings.mute_promos} onChange={(v) => setFlag('mute_promos', v)}/>}
              />
              <Row icon="🌙" bg="#e0e7ff" fg="#3730a3"
                title={t('settings.quietHours')}
                sub={t('settings.quietHoursSub')}
                right={<Toggle on={!!settings.quiet_hours_on} onChange={(v) => setFlag('quiet_hours_on', v)}/>}
              />
              {isPartner && (
                <>
                  <Row icon="🔔" bg="#dbeafe" fg="#1e40af"
                    title={t('settings.requestSound')}
                    sub={t('settings.requestSoundSub')}
                    right={<Toggle on={!!settings.sound_on} onChange={(v) => setFlag('sound_on', v)}/>}
                  />
                  <Row icon="📲" bg="#fef3c7" fg="#92400e"
                    title={t('settings.pushNotifications')}
                    sub={t('settings.pushNotificationsSub')}
                    right={<Toggle on={!!settings.push_on} onChange={(v) => setFlag('push_on', v)}/>}
                  />
                  <Row icon="✉️" bg="#fce7f3" fg="#be185d"
                    title={t('settings.emailReceipts')}
                    sub={t('settings.emailReceiptsSub')}
                    right={<Toggle on={!!settings.email_on} onChange={(v) => setFlag('email_on', v)}/>}
                  />
                </>
              )}
            </Section>
          </>
        )}

        {/* M83 — Partner-only "Block dates" calendar. Customers won't see
            scheduling slots on the blocked days. */}
        {isPartner && (
          <>
            <SectionLabel>Availability</SectionLabel>
            <div className="mb-4">
              <BlockedDatesCard />
            </div>
          </>
        )}

        {/* Region */}
        <SectionLabel>{t('settings.region')}</SectionLabel>
        <Section>
          {/* M77 — real language picker (English / Tamil). Persists per user. */}
          <LanguagePicker value={i18n.language} onChange={onPickLocale} />
          <Row icon="💱" bg="#ede9fe" fg="#6d28d9"
            title={t('settings.currency')} sub={t('settings.currencySub')} chevron
            onClick={() => dispatch(pushToast({ text: t('settings.comingSoon') }))}/>
        </Section>

        {/* L79 — Account section with Delete account flow. Self-contained card. */}
        <SectionLabel>{t('settings.account')}</SectionLabel>
        <Section>
          <DeleteAccountSection />
        </Section>

        <div className="text-center text-[11px] text-muted mt-6">
          {t('settings.version')}
        </div>
      </div>
    </div>
  )
}
