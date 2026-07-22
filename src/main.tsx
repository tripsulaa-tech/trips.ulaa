import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/globals.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Give the admin panel its own installable identity, separate from the
// public site's "ULAA" home-screen app.
//
// Chrome's "Install app" prompt and iOS's "Add to Home Screen" branding
// both read whichever manifest/meta tags are linked on the page at load
// time. On /admin we swap in a dedicated manifest (manifest-admin.json)
// and dedicated iOS meta tags, so an admin who visits /admin and installs
// it gets a separate "ULAA Admin" icon that opens straight into the
// dashboard — instead of being blocked from installing (the old behavior)
// or installing something branded/scoped like the public site.
const isAdminRoute = window.location.pathname.startsWith('/admin')

if (isAdminRoute) {
  document.querySelector('link[rel="manifest"]')?.setAttribute('href', '/manifest-admin.json')
  document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.setAttribute('content', 'yes')
  document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', 'ULAA Admin')
  document.title = 'ULAA Admin'
}

// Register the service worker for both the public site and /admin. Chrome
// requires an active, controlling service worker before it will offer the
// "Install app" prompt — this used to only run for non-admin routes, which
// was the other half of why /admin wasn't installable.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('Service worker registration failed:', err)
    })
  })
}
