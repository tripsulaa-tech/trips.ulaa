import { Home, Briefcase, Globe2, Info, Phone } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

interface BottomNavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  end?: boolean;
}

const navItems: BottomNavItem[] = [
  { label: 'Home', to: '/', icon: Home, end: true },
  { label: 'Upcoming', to: '/trips', icon: Briefcase },
  { label: 'Journey', to: '/completed-trips', icon: Globe2 },
  { label: 'About', to: '/about', icon: Info },
  { label: 'Contact', to: '/contact', icon: Phone },
];

export default function BottomNav() {
  const location = useLocation();

  const activeIndex = navItems.findIndex(({ to, end }) =>
    end ? location.pathname === to : location.pathname === to || location.pathname.startsWith(`${to}/`)
  );
  const safeIndex = Math.max(activeIndex, 0);

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 lg:hidden bg-white border-t border-gray-100 pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary mobile navigation"
    >
      <div className="grid grid-cols-5 h-16">
        {navItems.map(({ label, to, icon: Icon, end }, index) => {
          const isActive = index === safeIndex;

          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              className="relative flex flex-col items-center justify-center gap-1 outline-none"
            >
              {isActive && (
                <motion.div
                  layoutId="bottomnav-pill"
                  className="absolute inset-x-3 top-2 bottom-2 rounded-2xl bg-primary/10"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <Icon
                size={20}
                strokeWidth={isActive ? 2.2 : 1.5}
                className={`relative z-10 transition-colors ${isActive ? 'text-primary' : 'text-gray-500'}`}
              />
              <span
                className={`text-[10px] leading-none relative z-10 transition-colors ${
                  isActive ? 'text-primary font-semibold' : 'text-gray-500 font-medium'
                }`}
              >
                {label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}