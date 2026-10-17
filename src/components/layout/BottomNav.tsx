import { NavLink, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { BOTTOM_NAV_ITEMS as navItems } from '../../constants/bottomNav';

export default function BottomNav() {
  const location = useLocation();
  const reduceMotion = useReducedMotion();

  // Tabs (names, routes, icons) are fixed in constants/bottomNav.ts: no database fetch,
  // no live subscription.

  const isItemActive = (to: string) =>
    to === '/' ? location.pathname === to : location.pathname === to || location.pathname.startsWith(`${to}/`);

  // -1 (no tab highlighted) on pages that are not a tab, e.g. /games.
  const activeIndex = navItems.findIndex(({ to }) => isItemActive(to));

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
      data-toast-avoid
      className="fixed bottom-0 inset-x-0 z-40 lg:hidden w-full border-t border-background-warm bg-white shadow-[0_-4px_20px_rgba(168,90,42,0.08)] pb-[env(safe-area-inset-bottom)]"
    >
      {/* Edge-to-edge bar — fills the full width and sits directly on the
          bottom edge of the screen on both iOS and Android. */}
      <div className="relative mx-auto flex h-16 w-full max-w-md">
        {navItems.map(({ id, label, to, Icon }, index) => {
          const isActive = index === activeIndex;

          return (
            <NavLink
              key={id}
              to={to}
              end={to === '/'}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              className="relative flex flex-1 flex-col items-center justify-center gap-1 rounded-[6px] outline-none focus-visible:ring-2 focus-visible:ring-primary"
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