// public/sw.js
//
// Handles incoming Web Push events and notification clicks.
// Payload shape sent by supabase/functions/send-push/index.ts:
//   { "title": "...", "body": "...", "link": "/admin/enquiries" }

self.addEventListener('install', (event) => {
  // Activate this service worker as soon as it's finished installing,
  // instead of waiting for the old one to be closed in every tab.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Take control of any already-open pages immediately.
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = { title: 'ULAA Admin', body: 'You have a new notification.', link: '/admin' };

  try {
    if (event.data) {
      payload = { ...payload, ...event.data.json() };
    }
  } catch {
    // If the payload isn't valid JSON, fall back to the defaults above.
  }

  const options = {
    body: payload.body,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    data: { link: payload.link || '/admin' },
    // Keeps the notification visible until the admin interacts with it,
    // rather than auto-dismissing after a few seconds.
    requireInteraction: true,
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetPath = event.notification.data?.link || '/admin';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a tab for this app is already open, focus it and navigate.
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) {
            client.navigate(targetPath);
          }
          return;
        }
      }
      // Otherwise open a new tab/window at the target path.
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetPath);
      }
    })
  );
});
