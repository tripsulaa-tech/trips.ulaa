import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/globals.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Keep the admin panel out of the installable PWA.
// Chrome's "Install app" prompt and iOS's app-like "Add to Home Screen"
// branding both depend on this page having a linked manifest (and, for
// Chrome, an active service worker in scope). On /admin we strip the
// manifest link and turn off the iOS "standalone app" meta tag, and we
// skip the blanket service worker registration below — so a fresh load
// of /admin is not offered as an installable app. (Push notifications
// still work: the admin dashboard registers /sw.js itself, on demand,
// when an admin explicitly turns on push alerts — see src/services/push.ts.)
const isAdminRoute = window.location.pathname.startsWith('/admin')

if (isAdminRoute) {
  document.querySelector('link[rel="manifest"]')?.remove()
  document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.setAttribute('content', 'no')
} else if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('Service worker registration failed:', err)
    })
  })
}
