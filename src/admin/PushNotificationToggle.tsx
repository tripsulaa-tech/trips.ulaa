import { useEffect, useState } from 'react';
import {
  BellRinging as BellRing,
  BellSlash as BellOff,
} from '@phosphor-icons/react';
import {
  getPushSubscriptionStatus,
  subscribeToPush,
  unsubscribeFromPush,
} from '../services/push';

type Status = 'unsupported' | 'denied' | 'subscribed' | 'not-subscribed' | 'loading';

export default function PushNotificationToggle() {
  const [status, setStatus] = useState<Status>('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;

    getPushSubscriptionStatus()
      .then(async (current) => {
        if (!mounted) return;

        // Push notifications should be on by default for admins — if the
        // browser supports it and the admin hasn't explicitly denied
        // permission, opt them in automatically instead of waiting for a
        // manual toggle click.
        if (current === 'not-subscribed') {
          try {
            await subscribeToPush();
            if (mounted) setStatus('subscribed');
            return;
          } catch (err) {
            console.error('Failed to auto-enable push notifications:', err);
          }
        }

        if (mounted) setStatus(current);
      })
      .catch(() => {
        if (mounted) setStatus('unsupported');
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (status === 'unsupported' || status === 'loading') return null;

  const handleClick = async () => {
    setBusy(true);
    try {
      if (status === 'subscribed') {
        await unsubscribeFromPush();
        setStatus('not-subscribed');
      } else {
        await subscribeToPush();
        setStatus('subscribed');
      }
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      alert(message);
      setStatus(await getPushSubscriptionStatus());
    } finally {
      setBusy(false);
    }
  };

  if (status === 'denied') {
    return (
      <span
        title="Notifications are blocked in your browser settings"
        aria-label="Notifications are blocked in your browser settings"
        className="p-2 rounded-md text-dark-muted"
      >
        <BellOff size={18} aria-hidden="true" />
      </span>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      title={status === 'subscribed' ? 'Disable push notifications on this device' : 'Enable push notifications on this device'}
      aria-label={status === 'subscribed' ? 'Disable push notifications on this device' : 'Enable push notifications on this device'}
      aria-pressed={status === 'subscribed'}
      className="p-2 rounded-md text-dark hover:bg-background-warm transition-colors disabled:opacity-50"
    >
      {status === 'subscribed' ? <BellRing size={18} className="text-primary" aria-hidden="true" /> : <BellOff size={18} aria-hidden="true" />}
    </button>
  );
}
