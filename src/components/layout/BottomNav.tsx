import { Home, Calendar, MapPinned, Heart, Headphones } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

interface BottomNavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  end?: boolean;
}

const navItems: BottomNavItem[] = [
  { label: 'Home', to: '/', icon: Home, end: true },
  { label: 'Upcoming', to: '/trips', icon: Calendar },
  { label: 'Journey', to: '/completed-trips', icon: MapPinned },
  { label: 'About', to: '/about', icon: Heart },
  { label: 'Contact', to: '/contact', icon: Headphones },
];

export default function BottomNav() {
  const location = useLocation();
  const reduceMotion = useReducedMotion();

  const activeIndex = navItems.findIndex(({ to, end }) =>
    end ? location.pathname === to : location.pathname === to || location.pathname.startsWith(`${to}/`)
  );
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
      // pointer-events-none on the wrapper + pointer-events-auto on the dock
      // below keeps the transparent side-gutters (and the centered dock's
      // margins on wider/tablet widths) from silently eating taps meant for
      // whatever sits underneath them.
      className="fixed bottom-0 inset-x-0 z-40 lg:hidden pointer-events-none px-3 pt-1 pb-[max(env(safe-area-inset-bottom),0.625rem)]"
    >
      {/* Floating glass dock — inset from the screen edges instead of the
          old edge-to-edge bar, with a frosted backdrop-blur, a warm elevation
          shadow, and a hairline inner highlight so it reads as a physical,
          raised object rather than a flat strip glued to the viewport. */}
      <div className="pointer-events-auto relative mx-auto flex h-16 max-w-md rounded-[8px] border border-white/70 bg-white/80 backdrop-blur-xl shadow-[0_8px_40px_rgba(168,90,42,0.18),inset_0_1px_0_rgba(255,255,255,0.6)]">
        {navItems.map(({ label, to, icon: Icon, end }, index) => {
          const isActive = index === safeIndex;

          return (
            <NavLink
              key={to}
              to={to}
              end={end}
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
