import { useEffect, useState } from 'react';
import { Home } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { getSiteContent } from '../../services/api';
import { getTripHighlightIcon } from '../../constants/tripHighlightIcons';
import { DEFAULT_BOTTOM_NAV_ITEMS } from '../../constants/bottomNav';
import type { BottomNavItemConfig } from '../../types/types-index';

export default function BottomNav() {
  const location = useLocation();
  const reduceMotion = useReducedMotion();

  // Starts from the defaults (so there's no flash of an empty bar) and
  // swaps in the admin's saved tabs, if any, once the fetch resolves. See
  // /admin/bottom-nav (AdminBottomNav.tsx) for where these are edited.
  const [navItems, setNavItems] = useState<BottomNavItemConfig[]>(DEFAULT_BOTTOM_NAV_ITEMS);

  useEffect(() => {
    getSiteContent<BottomNavItemConfig[]>('bottom_nav')
      .then(data => {
        if (data && data.length > 0) setNavItems(data);
      })
      .catch(() => {
        // Fetch failed — keep the defaults already in state.
      });
  }, []);

  const isItemActive = (to: string) =>
    to === '/' ? location.pathname === to : location.pathname === to || location.pathname.startsWith(`${to}/`);

  const activeIndex = navItems.findIndex(({ to }) => isItemActive(to));
  const safeIndex = Math.max(activeIndex, 0);

  return (
    <motion.nav
      initial={{ y: 96, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : { duration: 0.32, ease: [0.22, 1, 0.36, 1] }
      }
      aria-label="Primary mobile navigation"
      // Docked flush to the viewport edges — no side gutters, no bottom
      // gap. The safe-area inset is padding *inside* the bar (so the
      // white background itself extends under the iPhone home-indicator
      // area / Android gesture bar) rather than a transparent margin
      // that made the bar look like it was floating above the edge.
      className="fixed bottom-0 inset-x-0 z-40 lg:hidden w-full border-t border-background-warm bg-white shadow-[0_-4px_20px_rgba(168,90,42,0.08)] pb-[env(safe-area-inset-bottom)]"
    >
      {/* Edge-to-edge bar — fills the full width and sits directly on the
          bottom edge of the screen on both iOS and Android. */}
      <div className="relative mx-auto flex h-16 w-full max-w-md">
        {navItems.map(({ id, label, to, icon }, index) => {
          const isActive = index === safeIndex;
          // Falls back to the Home icon if a saved icon key doesn't resolve
          // (e.g. it was removed from the shared library after being saved).
          const Icon = getTripHighlightIcon(icon)?.Icon ?? Home;

          return (
            <NavLink
              key={id}
              to={to}
              end={to === '/'}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              className="relative flex flex-1 flex-col items-center justify-center gap-1 rounded-[6px] outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <motion.div
                whileTap={{ scale: 0.88 }}
                className="relative flex h-9 w-9 items-center justify-center"
              >
                {isActive && (
                  <motion.span
                    layoutId="bottomnav-indicator"
                    className="absolute inset-0 rounded-full bg-gradient-to-br from-primary to-primary-light shadow-[0_4px_14px_-2px_rgba(168,90,42,0.55)]"
                    transition={reduceMotion ? { duration: 0 } : { duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                  />
                )}
                <Icon
                  size={20}
                  strokeWidth={isActive ? 2.25 : 1.75}
                  className={`relative z-10 transition-colors duration-200 ${isActive ? 'text-white' : 'text-dark-muted'}`}
                />
              </motion.div>
              <span
                className={`relative z-10 text-xs leading-none transition-colors duration-200 ${
                  isActive ? 'font-button font-semibold text-primary' : 'font-medium text-dark-muted/80'
                }`}
              >
                {label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </motion.nav>
  );
}