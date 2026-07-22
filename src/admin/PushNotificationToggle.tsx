import { useEffect, useState } from 'react';
import { BellRing, BellOff } from 'lucide-react';
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
    getPushSubscriptionStatus().then(setStatus).catch(() => setStatus('unsupported'));
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
        className="p-2 rounded-xl text-dark-muted"
      >
        <BellOff size={18} />
      </span>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      title={status === 'subscribed' ? 'Disable push notifications on this device' : 'Enable push notifications on this device'}
      className="p-2 rounded-xl text-dark hover:bg-background-warm transition-colors disabled:opacity-50"
    >
      {status === 'subscribed' ? <BellRing size={18} className="text-primary" /> : <BellOff size={18} />}
    </button>
  );
}
