import { supabase } from './supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// navigator.serviceWorker.getRegistration() can race the SW registration that
// main.tsx kicks off on the `load` event — on a cold PWA launch this status
// check often runs *before* that registration has resolved, so it reads back
// "no registration" and reports the toggle as off even though a subscription
// still exists from a previous session. serviceWorker.ready waits for an
// active, controlling registration instead of racing it. Guard with a
// timeout so a genuinely broken registration can't hang the toggle forever.
function getReadyRegistration(timeoutMs = 8000): Promise<ServiceWorkerRegistration | null> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

async function persistSubscription(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON();
  const { data: userData } = await supabase.auth.getUser();

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      admin_id: userData.user?.id,
      endpoint: json.endpoint!,
      p256dh: json.keys!.p256dh,
      auth: json.keys!.auth,
    },
    { onConflict: 'endpoint' }
  );

  if (error) throw error;
}

export async function getPushSubscriptionStatus(): Promise<'unsupported' | 'denied' | 'subscribed' | 'not-subscribed'> {
  if (!isPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  // Permission was never granted in this browser — nothing to restore.
  if (Notification.permission !== 'granted') return 'not-subscribed';

  try {
    const reg = await getReadyRegistration();
    if (!reg) return 'not-subscribed';

    let subscription = await reg.pushManager.getSubscription();

    // Notification permission is already granted from a previous session,
    // but the push subscription itself didn't survive (browser storage
    // cleared, endpoint rotated, SW re-registered, etc). Since the person
    // already opted in once, silently restore it instead of showing the
    // toggle as off and making them re-enable it every time they reopen
    // the app.
    if (!subscription && VAPID_PUBLIC_KEY) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      await persistSubscription(subscription);
    }

    return subscription ? 'subscribed' : 'not-subscribed';
  } catch (err) {
    console.error('Failed to restore push subscription:', err);
    return 'not-subscribed';
  }
}

export async function subscribeToPush(): Promise<void> {
  if (!isPushSupported()) throw new Error('Push notifications are not supported on this device/browser.');
  if (!VAPID_PUBLIC_KEY) throw new Error('Missing VITE_VAPID_PUBLIC_KEY env var.');

  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.');
  }

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  await persistSubscription(subscription);
}

export async function unsubscribeFromPush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const subscription = await reg?.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
}

// Called on sign-out, BEFORE the session is dropped (the row delete is
// protected by RLS, so it only works while still signed in). Without this a
// logged-out device kept its push subscription and kept receiving admin
// notifications (new enquiries etc.) until the browser data was cleared.
// Best effort: it must never block or fail the sign-out itself.
export async function removePushSubscriptionOnSignOut(): Promise<void> {
  try {
    if (!isPushSupported()) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const subscription = await reg?.pushManager.getSubscription();
    if (!subscription) return;

    const endpoint = subscription.endpoint;
    // Delete the server row first so no more pushes are sent to this device,
    // then drop the browser-side subscription. If the delete fails, the local
    // unsubscribe below still makes the endpoint invalid (send-push removes
    // rows that come back 404/410).
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
    await subscription.unsubscribe();
  } catch (err) {
    console.error('Failed to remove push subscription on sign-out:', err);
  }
}

// Self-heal for devices that signed out before the fix above existed (or lost
// their session some other way, e.g. it expired): when nobody is signed in,
// drop any leftover push subscription in this browser. The server then gets a
// 410 for that endpoint on its next send and deletes the stale row itself.
export async function dropLeftoverPushSubscription(): Promise<void> {
  try {
    if (!isPushSupported()) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const subscription = await reg?.pushManager.getSubscription();
    if (subscription) await subscription.unsubscribe();
  } catch {
    /* nothing to clean up */
  }
}

