// Firebase auth wrappers — ServiceLink only uses phone OTP + Google sign-in.
//
// Google sign-in flow:
//   Mobile device → signInWithRedirect (popups are blocked on most mobile browsers)
//   Desktop       → signInWithPopup (faster UX, cookies/sessionStorage always work)
//   Fallback      → if popup is blocked/closed, fall through to redirect
// Redirect result is picked up on app mount via `getRedirectResult`.

import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from 'firebase/auth'
import { auth, googleProvider } from './firebase'

// Only detect an actual mobile DEVICE via user-agent. We intentionally DON'T
// check viewport width — a laptop with a narrow browser window is still a
// laptop, and popups are more reliable there than redirects on localhost.
const isMobileDevice = () => {
  if (typeof navigator === 'undefined') return false
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

const authService = {

  // Resolves with `result` on popup flow, or `null` on redirect flow
  // (user credentials arrive via onAuthStateChanged after the redirect returns).
  googleLogin: async () => {
    if (isMobileDevice()) {
      await signInWithRedirect(auth, googleProvider)
      return null
    }
    try {
      return await signInWithPopup(auth, googleProvider)
    } catch (err) {
      // Popup was blocked or closed — fall back to redirect
      const code = err?.code || ''
      if (code === 'auth/popup-blocked' || code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        await signInWithRedirect(auth, googleProvider)
        return null
      }
      throw err
    }
  },

  // Called once on app boot — completes any pending redirect sign-in.
  // Returns a UserCredential if a redirect just resolved, else null.
  consumeRedirect: async () => {
    try {
      return await getRedirectResult(auth)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[auth] getRedirectResult error', err?.code, err?.message)
      return null
    }
  },

  logout: () => signOut(auth),

  setupRecaptcha: (containerId) => {
    window.recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
      size:     'invisible',
      callback: () => {},
    })
    return window.recaptchaVerifier
  },

  sendOtp: async (phoneNumber, containerId = 'recaptcha-container') => {
    const appVerifier = authService.setupRecaptcha(containerId)
    const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, appVerifier)
    window.confirmationResult = confirmationResult
    return confirmationResult
  },

  verifyOtp: async (otp) => {
    if (!window.confirmationResult) throw new Error('No OTP request found. Please send OTP first.')
    return window.confirmationResult.confirm(otp)
  },

  clearRecaptcha: () => {
    if (window.recaptchaVerifier) { window.recaptchaVerifier.clear(); window.recaptchaVerifier = null }
    window.confirmationResult = null
  },
}

export default authService
