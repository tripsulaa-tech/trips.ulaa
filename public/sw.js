// public/sw.js
//
// Handles incoming Web Push events and notification clicks for ULAA admin alerts.
// If you already have a service worker registered for PWA/offline caching,
// merge these two event listeners into that file instead of replacing it —
// a page can only have one active service worker at a time.

const DEFAULT_ICON = '/icons/ulaa-logo-192.png';   // full-color logo, 192x192
const DEFAULT_BADGE = '/icons/ulaa-badge-96.png';  // monochrome silhouette, 96x96 (Android status bar)

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