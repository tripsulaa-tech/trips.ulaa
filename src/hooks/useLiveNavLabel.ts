import { useEffect, useState } from 'react';
import { getSiteContent } from '../services/api';
import { subscribeToTable } from '../services/realtime';
import type { BottomNavItemConfig } from '../types/types-index';

/**
 * Pulls a bottom-nav tab's admin-editable label (see the Home Page admin's
 * "Bottom Nav Bar" tab) and
 * keeps it live: the instant an admin renames the tab, this re-pulls so
 * any page showing that label (e.g. "Showing N trips") updates without a
 * refresh. Previously each public list page (UpcomingTripsPage,
 * CompletedTripsPage, ...) wired up its own copy of this fetch-then-subscribe
 * pair; centralized here so they all stay in sync the same way.
 *
 * @param navRoute the tab's route as registered in constants/bottomNav.ts, e.g. '/trips'.
 * @param defaultLabel shown until the fetch resolves, and used as a fallback if the tab has no saved label.
 */
export function useLiveNavLabel(navRoute: string, defaultLabel: string): string {
  const [navLabel, setNavLabel] = useState<string>(defaultLabel);

  useEffect(() => {
    getSiteContent<BottomNavItemConfig[]>('bottom_nav')
      .then(data => {
        const match = data?.find(i => i.to === navRoute);
        if (match?.label) setNavLabel(match.label);
      })
      .catch(() => {});
  }, [navRoute]);

  useEffect(() => {
    const unsubscribe = subscribeToTable(
      'site_content',
      () => {
        getSiteContent<BottomNavItemConfig[]>('bottom_nav')
          .then(data => {
            const match = data?.find(i => i.to === navRoute);
            setNavLabel(match?.label || defaultLabel);
          })
          .catch(() => {});
      },
      'key=eq.bottom_nav'
    );
    return unsubscribe;
  }, [navRoute, defaultLabel]);

  return navLabel;
}
