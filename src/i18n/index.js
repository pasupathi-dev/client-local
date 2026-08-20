// M77 — i18next bootstrap. Loaded once from main.jsx, exports the
// configured instance so React components can call `t()` via useTranslation.
//
// Locale loading order:
//   1. localStorage('sl_locale')   — last user pick, available immediately
//   2. /api/settings.locale        — set after auth via setLocaleFromSettings
//   3. default 'en'
//
// Keep translations co-located in JSON files under ./locales/<code>.json
// so adding a language is one new file + one import.

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import ta from './locales/ta.json'

export const SUPPORTED = [
  { code: 'en', label: 'English' },
  { code: 'ta', label: 'தமிழ் (Tamil)' },
]

const FALLBACK = 'en'
const STORAGE_KEY = 'sl_locale'

const stored = typeof window !== 'undefined'
  ? localStorage.getItem(STORAGE_KEY)
  : null

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ta: { translation: ta },
    },
    lng: stored || FALLBACK,
    fallbackLng: FALLBACK,
    interpolation: { escapeValue: false }, // React handles XSS
    returnNull: false,
  })

export function setLocale (code) {
  if (!SUPPORTED.some((l) => l.code === code)) return
  if (i18n.language === code) return
  localStorage.setItem(STORAGE_KEY, code)
  i18n.changeLanguage(code)
  // Update <html lang> so screen readers + browser features know.
  if (typeof document !== 'undefined') {
    document.documentElement.lang = code
  }
}

// Called by SettingsPage after fetching user settings — keeps the locally
// stored locale in sync with the server-authoritative one. No-op if the
// user already picked something this session (server is the slower source).
export function setLocaleFromSettings (locale) {
  if (!locale) return
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) return        // user already chose this session — don't overwrite
  setLocale(locale)
}

export default i18n
