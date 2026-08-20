import { configureStore } from '@reduxjs/toolkit'
import authReducer          from '@/features/auth/authSlice'
import appReducer           from '@/features/app/appSlice'
import profileReducer       from '@/features/profile/profileSlice'
import catalogReducer       from '@/features/catalog/catalogSlice'
import jobsReducer          from '@/features/jobs/jobsSlice'
import chatReducer          from '@/features/chat/chatSlice'
import notificationsReducer from '@/features/notifications/notificationsSlice'
import partnerReducer       from '@/features/partner/partnerSlice'
import scheduleReducer      from '@/features/schedule/scheduleSlice'
import locationReducer      from '@/features/location/locationSlice'
import configReducer        from '@/features/config/configSlice'
import disputesReducer      from '@/features/disputes/disputesSlice'
import favouritesReducer    from '@/features/favourites/favouritesSlice'

export const store = configureStore({
  reducer: {
    auth:          authReducer,
    app:           appReducer,
    profile:       profileReducer,
    catalog:       catalogReducer,
    jobs:          jobsReducer,
    chat:          chatReducer,
    notifications: notificationsReducer,
    partner:       partnerReducer,
    schedule:      scheduleReducer,
    location:      locationReducer,
    config:        configReducer,
    disputes:      disputesReducer,
    favourites:    favouritesReducer,
  },
  devTools: import.meta.env.DEV,
})

export default store
