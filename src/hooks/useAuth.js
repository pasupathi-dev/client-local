import { useDispatch, useSelector } from 'react-redux'
import {
  sendOtp, verifyOtp, googleLogin, logoutUser, clearError, resetOtp,
  selectIsAuthenticated, selectCurrentUser, selectAuthLoading, selectAuthError,
  selectOtpSent, selectOtpPhone,
} from '@/features/auth/authSlice'

export function useAuth () {
  const dispatch = useDispatch()
  return {
    isAuthenticated: useSelector(selectIsAuthenticated),
    user:            useSelector(selectCurrentUser),
    loading:         useSelector(selectAuthLoading),
    error:           useSelector(selectAuthError),
    otpSent:         useSelector(selectOtpSent),
    otpPhone:        useSelector(selectOtpPhone),

    sendOtp:     (phoneNumber) => dispatch(sendOtp({ phoneNumber })),
    verifyOtp:   (otp)         => dispatch(verifyOtp({ otp })),
    googleLogin: ()            => dispatch(googleLogin()),
    logout:      ()            => dispatch(logoutUser()),
    clearError:  ()            => dispatch(clearError()),
    resetOtp:    ()            => dispatch(resetOtp()),
  }
}
