import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './styles/globals.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Analytics />
  </StrictMode>,
)

// Give the admin panel its own installable identity, separate from the
// public site's "ULAA" home-screen app.
//
// This used to swap the manifest/apple-touch-icon/title tags in via JS
// after load, but iOS's "Add to Home Screen" reliably reads a page's PWA
// metadata only from what the server actually returned for that URL — it
// doesn't pick up tags mutated after the fact. /admin is now served by its
// own static admin.html (see vite.config.ts + vercel.json rewrites) with
// the "ULAA Admin" manifest/icons baked in directly, so no runtime swap is
// needed here anymore.

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
