// public/sw.js
//
// Single, unified service worker for ULAA — covers:
//   • PWA installability (fetch handler required by Chrome/Android)
//   • Immediate activation on first visit (skipWaiting + clients.claim)
//   • Web Push delivery (works even when no tab is open)
//   • Notification click routing

const USER_ICON  = '/icons/user/icon-192.png';
const ADMIN_ICON = '/icons/admin/icon-192.png';

// ── Lifecycle ────────────────────────────────────────────────────────────────

// Take control of the page on first load without waiting for an existing SW
// to expire.  Required so Chrome marks the page as "controlled by a SW"
// immediately — which is one of the hard criteria for the Install prompt.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ── Fetch (PWA install requirement) ─────────────────────────────────────────

// Chrome on Android will not show the "Add to Home Screen" / Install prompt
// unless the active service worker has a fetch event handler.
// This handler is intentionally a no-op — every request falls through to the
// network normally.  Add caching logic here later if you want offline support.
self.addEventListener('fetch', () => {});

// ── Web Push ─────────────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  let payload = { title: 'ULAA', body: 'You have a new notification.', link: '/admin' };

  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // Non-JSON payload — use defaults above.
  }

  // Pick the right icon based on which section the notification targets.
  const icon = (payload.link || '').startsWith('/admin') ? ADMIN_ICON : USER_ICON;

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body:      payload.body,
      icon,
      badge:     ADMIN_ICON,
      data:      { link: payload.link || '/admin' },
      tag:       payload.tag || 'ulaa-notification',
      renotify:  true,
    })
  );
});

// ── Notification click ───────────────────────────────────────────────────────

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.link || '/admin';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(targetUrl);
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

// ── Push subscription change ─────────────────────────────────────────────────

// Fired if the push subscription expires/rotates — re-subscribe silently so
// the server can update the endpoint next time the admin panel opens.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe({
        userVisibleOnly: true,
        applicationServerKey: event.oldSubscription?.options?.applicationServerKey,
      })
      .then(() => {
        // App will pick up the new subscription on next page load.
      })
  );
});
