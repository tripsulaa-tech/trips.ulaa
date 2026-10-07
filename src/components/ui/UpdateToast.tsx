import { useEffect } from 'react';
import { useVersionCheck } from '../../hooks/useVersionCheck';
import { useToast } from './useToast';

/**
 * Site-wide notice that appears the moment a newer deployment goes live
 * while someone is already browsing the site. It stays up (duration 0) until
 * they click Refresh or dismiss it — it never reloads the tab on its own,
 * since an admin or user could be mid-edit in a form (adding a trip, filling
 * out an enquiry, etc.) and an unannounced reload would lose that unsaved work.
 *
 * Renders nothing itself: the message goes through the shared toast so it
 * looks and behaves like every other notification.
 */
export default function UpdateToast() {
  const updateAvailable = useVersionCheck();
  const toast = useToast();

  useEffect(() => {
    if (!updateAvailable) return;
    toast.info("Refresh whenever you're ready.", {
      title: 'A new version of Ulaa is available',
      duration: 0,
      action: { label: 'Refresh now', onClick: () => window.location.reload() },
    });
  }, [updateAvailable, toast]);

  return null;
}
