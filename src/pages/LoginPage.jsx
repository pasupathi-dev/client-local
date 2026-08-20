// ServiceLink login — split-screen splash + OTP, matched pixel-close to local.html.
// One root fills the viewport. A two-column grid shows on ≥tablet, stacks on mobile.

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'

// ── Brand panel (reused across both auth screens) ─────────────────────────
function BrandPanel ({ className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center gap-4 px-8 md:px-12 py-10 ${className}`}>
      <div className="w-20 h-20 md:w-24 md:h-24 rounded-3xl grid place-items-center text-4xl md:text-5xl"
        style={{ background: 'rgba(232,65,26,0.15)', border: '2px solid rgba(232,65,26,0.25)' }}>
        🔧
      </div>
      <div className="font-display font-extrabold text-white leading-none
                      text-4xl md:text-[38px] lg:text-[52px] tracking-tight">
        Service<span className="text-accent not-italic">Link</span>
      </div>
      <div className="text-white/50 text-sm md:text-base font-medium tracking-[0.3px]">
        Local services, instantly
      </div>
    </div>
  )
}

// ── Google "G" logo (official multicolor SVG) ─────────────────────────────
function GoogleG ({ size = 18 }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335"  d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4"  d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05"  d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853"  d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
      <path fill="none" d="M0 0h48v48H0z"/>
    </svg>
  )
}

// ── Splash screen (phone entry) ───────────────────────────────────────────
function SplashScreen ({ onSend, onGoogle, loading, googleLoading, error }) {
  const [phone, setPhone] = useState('')
  const [touched, setTouched] = useState(false)
  const invalid = touched && phone.length !== 10

  const submit = (e) => {
    e.preventDefault()
    setTouched(true)
    if (phone.length === 10) onSend(phone)
  }

  return (
    <div className="absolute inset-0 flex flex-col md:grid md:grid-cols-2 animate-pgIn">
      {/* LEFT: dark brand panel (top on mobile, left on desktop) */}
      <div className="bg-brand flex-1 md:flex-none md:h-full flex">
        <BrandPanel className="flex-1" />
      </div>

      {/* RIGHT: form card (bottom sheet on mobile, right panel on desktop) */}
      <div className="bg-card md:h-full md:flex md:items-center md:justify-center
                      rounded-t-3xl md:rounded-none pt-8 pb-10 px-7 mt-auto md:mt-0">
        <form onSubmit={submit} className="w-full md:max-w-[380px] lg:max-w-[420px] mx-auto">
          <h1 className="font-display font-extrabold text-text text-[22px] md:text-2xl lg:text-[28px] mb-1.5">
            Welcome!
          </h1>
          <p className="text-muted text-[13px] md:text-sm lg:text-[15px] leading-relaxed mb-6 md:mb-7">
            Enter your mobile number to get started.<br className="hidden md:block"/>
            We'll send you a quick OTP to verify.
          </p>

          <div className="flex gap-2.5 items-center mb-4 md:mb-5">
            <div className="shrink-0 px-3.5 py-3 lg:py-[15px] rounded-[var(--rs)] border-[1.5px] border-border
                            bg-card font-bold text-sm lg:text-[15px] text-text flex items-center gap-1.5 select-none">
              🇮🇳 +91
            </div>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              placeholder="Enter mobile number"
              value={phone}
              onChange={(e) => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setTouched(false) }}
              autoFocus
              className={`flex-1 px-4 py-3 lg:py-[15px] rounded-[var(--rs)] border-[1.5px] bg-card text-text
                          text-base lg:text-[17px] outline-none transition-colors
                          ${invalid ? 'border-danger' : 'border-border focus:border-accent'}`}
            />
          </div>

          {invalid && !error && (
            <p className="text-[12px] text-danger -mt-2 mb-2.5">Please enter a valid 10-digit mobile number</p>
          )}
          {error && <p className="text-[12px] text-danger -mt-2 mb-2.5">{error}</p>}

          <button
            type="submit"
            disabled={loading || phone.length !== 10}
            className="w-full py-[15px] lg:py-[17px] rounded-[var(--rs)] bg-accent text-white
                       font-display font-extrabold text-[15px] lg:text-base
                       shadow-[0_4px_16px_rgba(232,65,26,0.3)] hover:brightness-90 transition
                       disabled:bg-border disabled:text-muted disabled:shadow-none disabled:cursor-not-allowed">
            {loading ? 'Sending OTP…' : 'Send OTP →'}
          </button>

          {/* Google sign-in */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-muted">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <button
            type="button"
            onClick={onGoogle}
            disabled={googleLoading || loading}
            className="w-full py-[13px] lg:py-[14px] rounded-[var(--rs)] bg-card text-text
                       border-[1.5px] border-border hover:border-accent transition
                       flex items-center justify-center gap-2.5
                       text-sm lg:text-[15px] font-semibold
                       disabled:opacity-60 disabled:cursor-not-allowed">
            <GoogleG size={18}/>
            {googleLoading ? 'Signing in…' : 'Continue with Google'}
          </button>

          <p className="text-[11px] md:text-xs text-muted text-center mt-4 md:mt-5 leading-relaxed">
            By continuing, you agree to our Terms of Service & Privacy Policy
          </p>
        </form>
      </div>
    </div>
  )
}

// ── OTP screen (6-box input with auto-advance + 30s resend) ───────────────
function OtpScreen ({ phone, onVerify, onResend, onBack, loading, error }) {
  const [digits, setDigits] = useState(['','','','','',''])
  const [resend, setResend] = useState(30)
  const refs = useRef([])

  useEffect(() => { refs.current[0]?.focus() }, [])

  useEffect(() => {
    if (resend <= 0) return
    const t = setTimeout(() => setResend((r) => r - 1), 1000)
    return () => clearTimeout(t)
  }, [resend])

  const setAt = (i, v) => {
    const d = v.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[i] = d
    setDigits(next)
    if (d && i < 5) refs.current[i + 1]?.focus()
    if (d && i === 5 && next.every(Boolean)) onVerify(next.join(''))
  }

  const onKey = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus()
  }

  const onPaste = (e) => {
    const v = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!v) return
    e.preventDefault()
    const next = ['','','','','',''].map((_, i) => v[i] || '')
    setDigits(next)
    refs.current[Math.min(v.length, 5)]?.focus()
    if (v.length === 6) onVerify(v)
  }

  const submit = (e) => {
    e.preventDefault()
    const code = digits.join('')
    if (code.length === 6) onVerify(code)
  }

  const triggerResend = () => {
    if (resend > 0 || loading) return
    setDigits(['','','','','',''])
    setResend(30)
    refs.current[0]?.focus()
    onResend()
  }

  const display = phone?.startsWith('+') ? phone : `+91 ${phone || ''}`

  return (
    <div className="absolute inset-0 flex flex-col md:grid md:grid-cols-2 animate-pgIn">
      {/* MOBILE head: compact back + title over the brand panel */}
      <div className="md:hidden px-5 pt-4 pb-3 bg-brand text-white">
        <button onClick={onBack} type="button" className="text-white/70 text-sm mb-3 flex items-center gap-1">
          ← Back
        </button>
        <div className="font-display font-extrabold text-lg mb-1">Verify your number</div>
        <div className="text-white/60 text-xs">
          OTP sent to <span className="text-white font-bold">{display}</span>
        </div>
      </div>

      {/* LEFT on desktop / brand body on mobile */}
      <div className="bg-brand flex-1 md:flex-none md:h-full hidden md:flex">
        <BrandPanel className="flex-1" />
      </div>
      <div className="bg-brand md:hidden flex-1 min-h-[160px] flex">
        <BrandPanel className="flex-1" />
      </div>

      {/* RIGHT: OTP card */}
      <div className="bg-card md:h-full md:flex md:items-center md:justify-center
                      rounded-t-3xl md:rounded-none pt-8 pb-10 px-7 mt-auto md:mt-0">
        <form onSubmit={submit} className="w-full md:max-w-[380px] lg:max-w-[420px] mx-auto">
          <button onClick={onBack} type="button"
            className="hidden md:flex items-center gap-1 text-muted hover:text-accent text-sm lg:text-[14px] mb-5">
            ← Back
          </button>

          <h1 className="font-display font-extrabold text-text text-[22px] md:text-2xl lg:text-[26px] mb-1.5 hidden md:block">
            Verify your number
          </h1>
          <p className="text-muted text-[13px] md:text-sm lg:text-[15px] mb-5 md:mb-6 hidden md:block">
            OTP sent to <span className="text-text font-bold">{display}</span>
          </p>

          <div className="flex justify-center gap-2.5 lg:gap-3 mb-5 md:mb-6">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => (refs.current[i] = el)}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={d}
                onChange={(e) => setAt(i, e.target.value)}
                onKeyDown={(e) => onKey(i, e)}
                onPaste={onPaste}
                className={`w-[52px] h-[58px] md:w-[50px] md:h-[56px] lg:w-[58px] lg:h-16
                            text-center font-display font-extrabold
                            text-2xl lg:text-[28px]
                            rounded-[var(--rs)] border-[1.5px] outline-none
                            bg-card text-text transition-colors
                            ${d ? 'border-accent bg-[#fff5f2] dark:bg-[#241a18]' : 'border-border focus:border-accent'}`}
              />
            ))}
          </div>

          {error && <p className="text-[12px] text-danger text-center -mt-2 mb-3">{error}</p>}

          <button
            type="submit"
            disabled={loading || digits.some((x) => !x)}
            className="w-full py-[15px] lg:py-[17px] rounded-[var(--rs)] bg-accent text-white
                       font-display font-extrabold text-[15px] lg:text-base
                       shadow-[0_4px_16px_rgba(232,65,26,0.3)] hover:brightness-90 transition
                       disabled:bg-border disabled:text-muted disabled:shadow-none disabled:cursor-not-allowed">
            {loading ? 'Verifying…' : 'Verify & Continue →'}
          </button>

          <div className="text-center text-muted text-[13px] lg:text-sm mt-5">
            Didn't receive?{' '}
            <button type="button" onClick={triggerResend} disabled={resend > 0 || loading}
              className="font-bold text-accent disabled:text-muted disabled:no-underline">
              {resend > 0 ? <>Resend in <span>{resend}</span>s</> : 'Resend OTP'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Top-level page — controls which of the two screens is visible ────────
export default function LoginPage () {
  const {
    loading, error, otpSent, otpPhone,
    sendOtp, verifyOtp, googleLogin,
    clearError, resetOtp,
  } = useAuth()
  const [googleLoading, setGoogleLoading] = useState(false)

  const handleSend = async (digits) => {
    clearError()
    await sendOtp(`+91${digits}`)
  }
  const handleVerify = async (code) => {
    clearError()
    await verifyOtp(code)
  }
  const handleBack   = () => { resetOtp() }
  const handleGoogle = async () => {
    clearError()
    setGoogleLoading(true)
    try { await googleLogin() } finally { setGoogleLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-brand overflow-hidden">
      {!otpSent
        ? <SplashScreen
            onSend={handleSend}
            onGoogle={handleGoogle}
            loading={loading}
            googleLoading={googleLoading}
            error={error} />
        : <OtpScreen
            phone={otpPhone}
            onVerify={handleVerify}
            onResend={() => handleSend(otpPhone.replace(/^\+91/, ''))}
            onBack={handleBack}
            loading={loading}
            error={error} />
      }
      {/* Invisible reCAPTCHA anchor — required by Firebase phone auth */}
      <div id="recaptcha-container" />
    </div>
  )
}
