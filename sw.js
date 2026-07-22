// Service worker for ULAA — handles Web Push delivery.
// This file must be served from the site root (not /src) so its scope covers the whole app.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Fired by the OS/browser push service when a message arrives —
// this runs even if no tab is open and the screen is locked.
self.addEventListener('push', (event) => {
  let payload = { title: 'ULAA', body: 'You have a new notification.', link: '/admin' };

  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // If the payload isn't JSON, fall back to the defaults above.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { link: payload.link || '/admin' },
      tag: payload.tag || 'ulaa-notification',
    })
  );
});

// Fired when the user taps the notification.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.link || '/admin';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

// Fired if the push subscription expires/rotates — re-subscribe silently.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe(event.oldSubscription ? { applicationServerKey: event.oldSubscription.options.applicationServerKey, userVisibleOnly: true } : undefined)
      .then((subscription) => {
        // The app will notice the new subscription next time it opens and re-save it.
        // (Kept minimal here since the SW can't call Supabase directly without extra setup.)
        return subscription;
      })
  );
});
