// Minimal auth slice — only phone OTP + Google sign-in.
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import authService from '@/services/authService'

const normalize = (fbUser) => ({
  uid:   fbUser.uid,
  email: fbUser.email  || null,
  phone: fbUser.phoneNumber || null,
  name:  fbUser.displayName || null,
  photo: fbUser.photoURL ?? null,
})

export const sendOtp = createAsyncThunk('auth/sendOtp', async ({ phoneNumber }, { rejectWithValue }) => {
  try {
    await authService.sendOtp(phoneNumber, 'recaptcha-container')
    return { phoneNumber }
  } catch (err) {
    authService.clearRecaptcha()
    return rejectWithValue(firebaseError(err.code))
  }
})

export const verifyOtp = createAsyncThunk('auth/verifyOtp', async ({ otp }, { rejectWithValue }) => {
  try {
    const result = await authService.verifyOtp(otp)
    const token  = await result.user.getIdToken()
    localStorage.setItem('token', token)
    localStorage.setItem('uid',   result.user.uid)
    return normalize(result.user)
  } catch (err) {
    return rejectWithValue(firebaseError(err.code))
  }
})

export const googleLogin = createAsyncThunk('auth/googleLogin', async (_, { rejectWithValue }) => {
  try {
    const result = await authService.googleLogin()
    // Redirect flow: the page navigates away; result is null here.
    // User lands back on the site and onAuthStateChanged fires in App.jsx.
    if (!result) return null
    const token  = await result.user.getIdToken()
    localStorage.setItem('token', token)
    localStorage.setItem('uid',   result.user.uid)
    return normalize(result.user)
  } catch (err) {
    return rejectWithValue(firebaseError(err.code))
  }
})

export const logoutUser = createAsyncThunk('auth/logout', async () => {
  await authService.logout()
  localStorage.removeItem('token')
  localStorage.removeItem('uid')
})

function firebaseError (code) {
  const map = {
    'auth/popup-closed-by-user':       'Sign-in was cancelled.',
    'auth/network-request-failed':     'Network error. Check your connection.',
    'auth/invalid-credential':         'Invalid credentials. Try again.',
    'auth/invalid-phone-number':       'Invalid phone number.',
    'auth/too-many-requests':          'Too many attempts. Try again later.',
    'auth/invalid-verification-code':  'Invalid OTP. Please check and try again.',
    'auth/code-expired':               'OTP expired. Request a new one.',
  }
  return map[code] ?? 'Something went wrong. Please try again.'
}

const slice = createSlice({
  name: 'auth',
  initialState: {
    user: null,
    isAuthenticated: false,
    loading: false,
    error: null,
    otpSent: false,
    otpPhone: null,
  },
  reducers: {
    clearError: (s) => { s.error = null },
    setUser: (s, { payload }) => { s.user = payload; s.isAuthenticated = !!payload },
    resetOtp: (s) => { s.otpSent = false; s.otpPhone = null; s.error = null },
  },
  extraReducers: (b) => {
    const pending  = (s) => { s.loading = true; s.error = null }
    const rejected = (s, { payload }) => { s.loading = false; s.error = payload }
    const signedIn = (s, { payload }) => {
      s.loading = false
      s.user = payload
      s.isAuthenticated = true
      s.otpSent = false
      s.otpPhone = null
      s.error = null
    }

    b.addCase(sendOtp.pending, pending)
     .addCase(sendOtp.fulfilled, (s, { payload }) => { s.loading = false; s.otpSent = true; s.otpPhone = payload.phoneNumber })
     .addCase(sendOtp.rejected, (s, { payload }) => { s.loading = false; s.error = payload; s.otpSent = false })

     .addCase(verifyOtp.pending, pending)
     .addCase(verifyOtp.fulfilled, signedIn)
     .addCase(verifyOtp.rejected, rejected)

     .addCase(googleLogin.pending, pending)
     .addCase(googleLogin.fulfilled, (s, { payload }) => {
       // Redirect flow fulfills with null; onAuthStateChanged finishes the sign-in.
       // We just clear loading so the button isn't stuck in the "Signing in…" state.
       s.loading = false
       s.error = null
       if (payload) {
         s.user = payload
         s.isAuthenticated = true
         s.otpSent = false
         s.otpPhone = null
       }
     })
     .addCase(googleLogin.rejected, rejected)

     .addCase(logoutUser.fulfilled, (s) => {
       s.user = null; s.isAuthenticated = false; s.loading = false
       s.otpSent = false; s.otpPhone = null; s.error = null
     })
  },
})

export const { clearError, setUser, resetOtp } = slice.actions
export const selectIsAuthenticated = (s) => s.auth.isAuthenticated
export const selectCurrentUser     = (s) => s.auth.user
export const selectAuthLoading     = (s) => s.auth.loading
export const selectAuthError       = (s) => s.auth.error
export const selectOtpSent         = (s) => s.auth.otpSent
export const selectOtpPhone        = (s) => s.auth.otpPhone
export default slice.reducer
