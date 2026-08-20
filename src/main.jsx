// src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { store } from './app/store'
import App from './App'
import './index.css'
// M77 — initialise i18next before any component renders so first paint
// is already localised when the user picked a non-default language.
import './i18n'
// H90 — Pull the admin's impersonation token off the URL into localStorage
// before React mounts so the very first API request already carries the
// "Impersonate …" header.
import { consumeImpersonateParam } from '@/components/ImpersonationBanner'
consumeImpersonateParam()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>
)
