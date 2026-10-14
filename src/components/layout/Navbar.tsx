import { useEffect, useState, type MouseEvent } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  List as Menu,
  X,
} from '@phosphor-icons/react';
import Button from '../ui/Button';
import { useAuth } from '../../context/useAuth';
import { useBranding } from '../../hooks/useBranding';

const navLinks = [
  { label: 'Home', to: '/' },
  { label: 'Upcoming Trips', to: '/trips' },
  { label: 'Completed Trips', to: '/completed-trips' },
  { label: 'Games', to: '/games' },
  { label: 'About', to: '/about' },
  { label: 'Contact', to: '/contact' },
];

// Beige/cream version of the logo for sitting on photos and dark sections. The
// regular (dark) logo comes from the admin-managed branding as before.
const LIGHT_LOGO = '/ULAA-logo-Header-Biege.png';

// Any section can opt in to a light-on-dark header while it is behind the
// navbar by carrying data-header-theme="dark" (hero photos, dark bands,
// footer). Everything else is treated as light. Checked at the navbar's
// vertical middle, so the header flips exactly as a section passes under it.
const HEADER_PROBE_Y = 40;

function useHeaderTheme(routeKey: string) {
  const [dark, setDark] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      setScrolled(window.scrollY > 8);
      const sections = document.querySelectorAll<HTMLElement>('[data-header-theme="dark"]');
      let over = false;
      sections.forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.top <= HEADER_PROBE_Y && r.bottom > HEADER_PROBE_Y) over = true;
      });
      setDark(over);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    // Lazy-loaded sections mount after the first paint and change the page
    // height — re-measure when that happens, and once more shortly after
    // each route change.
    const settle = window.setTimeout(schedule, 150);
    const ro = new ResizeObserver(schedule);
    ro.observe(document.body);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.clearTimeout(settle);
      if (frame) cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [routeKey]);

  return { dark, scrolled };
}

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { urls: brand } = useBranding();
  const { dark: overDark, scrolled } = useHeaderTheme(location.key);
  // The open mobile menu is a solid white panel, so the bar above it must
  // read as light no matter what is behind it.
  const dark = overDark && !isOpen;

  // Close the mobile menu whenever the route changes. Adjusted during render
  // (rather than in an effect) to avoid an extra cascading render.
  const [prevLocationKey, setPrevLocationKey] = useState(location.key);
  if (location.key !== prevLocationKey) {
    setPrevLocationKey(location.key);
    if (isOpen) setIsOpen(false);
  }

  const handleLogoClick = (e: MouseEvent) => {
    // Admin-only: toggle logo between the public home page and the admin dashboard.
    if (!user) return;
    e.preventDefault();
    if (location.pathname === '/') {
      navigate('/admin');
    } else {
      navigate('/');
    }
  };

  return (
    <motion.header
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className={`fixed top-0 left-0 right-0 z-40 px-4 sm:px-6 lg:px-8 transition-colors duration-300 ${
        isOpen ? 'bg-white border-b border-background-warm shadow-card' : ''
      }`}
    >
      {/* No solid bar: a fading veil sits behind the header. Content scrolling
          underneath is blurred most at the very top and fades to sharp lower
          down (mask), and a tint keeps the links readable — dark over photos
          and dark sections, white over light pages. */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 top-0 h-[calc(100%+28px)] transition-opacity duration-300 ${
          isOpen ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <div
          className={`absolute inset-0 backdrop-blur-md transition-opacity duration-300 ${scrolled ? 'opacity-100' : 'opacity-0'}`}
          style={{
            WebkitMaskImage: 'linear-gradient(to bottom, #000 55%, transparent 100%)',
            maskImage: 'linear-gradient(to bottom, #000 55%, transparent 100%)',
          }}
        />
        <div
          className={`absolute inset-0 bg-gradient-to-b from-black/50 via-black/20 to-transparent transition-opacity duration-300 ${
            dark ? 'opacity-100' : 'opacity-0'
          }`}
        />
        <div
          className={`absolute inset-0 bg-gradient-to-b from-background via-background/80 to-transparent transition-opacity duration-300 ${
            dark ? 'opacity-0' : 'opacity-100'
          }`}
        />
      </div>
      <nav className="relative max-w-[1344px] mx-auto">
        <div className="flex items-center justify-between h-20 py-2">
          <Link to="/" onClick={handleLogoClick} className="flex items-center gap-3 group">
            {/* Both logos sit in the same grid cell with identical sizing, so
                they overlap pixel-for-pixel and only the colours crossfade
                (display:block also removes the inline-image baseline gap that
                nudged the second logo's position). */}
            <span className="grid transition-transform duration-300 group-hover:scale-105">
              <img
                src={brand.header_logo}
                alt="Ulaa Logo"
                className={`col-start-1 row-start-1 block h-14 sm:h-16 w-auto transition-opacity duration-300 ${
                  dark ? 'opacity-0' : 'opacity-100'
                }`}
              />
              <img
                src={LIGHT_LOGO}
                alt=""
                aria-hidden="true"
                className={`col-start-1 row-start-1 block h-14 sm:h-16 w-auto transition-opacity duration-300 ${
                  dark ? 'opacity-100' : 'opacity-0'
                }`}
              />
            </span>
          </Link>

          <div className="hidden lg:flex items-center gap-8">
            {navLinks.map(({ label, to }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) => `
                  relative font-body text-sm font-medium transition-colors duration-200
                  ${
                    dark
                      ? isActive
                        ? 'text-white [text-shadow:0_1px_10px_rgba(0,0,0,0.35)]'
                        : 'text-white/90 hover:text-white [text-shadow:0_1px_10px_rgba(0,0,0,0.35)]'
                      : isActive
                        ? 'text-primary'
                        : 'text-dark hover:text-primary'
                  }
                  after:absolute after:bottom-[-4px] after:left-0 after:w-0 after:h-0.5
                  ${dark ? 'after:bg-white' : 'after:bg-primary'} after:transition-all after:duration-200
                  hover:after:w-full
                  ${isActive ? 'after:w-full' : ''}
                `}
              >
                {label}
              </NavLink>
            ))}
          </div>

          <div className="hidden lg:block">
            <Link to="/trips">
              <Button variant="primary" size="sm">
                Book Now
              </Button>
            </Link>
          </div>

          <button
            onClick={() => setIsOpen(!isOpen)}
            className={`lg:hidden p-2.5 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center ${
              dark ? 'text-white hover:bg-white/10' : 'text-dark hover:bg-background'
            }`}
            aria-label={isOpen ? 'Close menu' : 'Open menu'}
          >
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="lg:hidden bg-white border-t border-background-warm overflow-hidden"
          >
            <div className="px-4 py-6 space-y-1">
              {navLinks.map(({ label, to }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) => `
                    block px-4 py-3.5 min-h-[44px] flex items-center rounded-lg font-body font-medium text-base transition-colors
                    ${isActive ? 'text-primary bg-background-warm' : 'text-dark hover:bg-background-warm hover:text-primary'}
                  `}
                >
                  {label}
                </NavLink>
              ))}
              <div className="pt-2">
                <Link to="/trips" className="block">
                  <Button variant="primary" size="md" fullWidth>
                    Book Now
                  </Button>
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
