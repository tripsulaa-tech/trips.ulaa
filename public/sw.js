// public/sw.js
//
// Handles incoming Web Push events and notification clicks for ULAA admin alerts.
// If you already have a service worker registered for PWA/offline caching,
// merge these two event listeners into that file instead of replacing it —
// a page can only have one active service worker at a time.

const DEFAULT_ICON = '/icons/admin/icon-192.png';   // full-color logo, 192x192
const DEFAULT_BADGE = '/icons/admin/icon-192.png';  // monochrome silhouette, 96x96 (Android status bar)

// A no-op fetch handler is required for Chrome/Android to treat this as an
// installable PWA (full "Install app" prompt) rather than a plain shortcut.
// It doesn't intercept anything — requests just fall through to the network.
self.addEventListener('fetch', () => {});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'ULAA', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'ULAA';
  const options = {
    body: data.body || '',
    icon: data.icon || DEFAULT_ICON,
    badge: data.badge || DEFAULT_BADGE,
    tag: data.tag || 'ulaa-notification', // replaces older notifications with the same tag instead of stacking
    renotify: true,
    data: {
      link: data.link || '/admin',
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.link || '/admin';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If ULAA admin is already open in a tab, focus it and navigate there
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) {
            client.navigate(targetUrl);
          }
          return;
        }
      }
      // Otherwise open a new tab
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});