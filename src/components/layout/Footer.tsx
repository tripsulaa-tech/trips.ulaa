import { Link } from 'react-router-dom';
import { Mail, Phone, MapPin, Heart, Mountain, Image, Users, Home, ChevronRight, Info } from 'lucide-react';
import { getWhatsAppLink } from '../../utils';

const WHATSAPP_NUMBER = '916381336772';

const navItems = [
  { label: 'Upcoming Trips', to: '/trips', icon: Mountain },
  { label: 'Completed Trips', to: '/completed-trips', icon: Image },
  { label: 'About ULAA', to: '/about', icon: Users },
  { label: 'Contact Us', to: '/contact', icon: Phone },
];

// Desktop "Quick Links" column includes Home in addition to the mobile nav items
const quickLinks = [
  { label: 'Home', to: '/', icon: Home },
  { label: 'Upcoming Trips', to: '/trips', icon: Mountain },
  { label: 'Completed Trips', to: '/completed-trips', icon: Image },
  { label: 'About Us', to: '/about', icon: Info },
  { label: 'Contact', to: '/contact', icon: Phone },
];

const socialItems = [
  {
    label: 'Instagram',
    href: 'https://www.instagram.com/ulaa.trips?igsh=MXhpbHdwOXhmamZsZw==',
    external: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
      </svg>
    ),
  },
  {
    label: 'WhatsApp',
    href: getWhatsAppLink(WHATSAPP_NUMBER),
    external: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    ),
  },
  {
    label: 'Email',
    href: 'mailto:trips.ulaa@gmail.com',
    external: false,
    icon: <Mail className="w-5 h-5" />,
  },
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-[#271e18] text-[#fdfcf6] overflow-hidden">
      {/* ===================== MOBILE / TABLET ===================== */}
      <div className="lg:hidden">
        <div className="max-w-md mx-auto px-6 sm:px-8 pt-6 pb-10 text-center">
          {/* Logo */}
          <Link to="/" className="inline-block">
            <img
              src="/ULAA-logo-Footer.png"
              alt="ULAA — Unseen. Local. Adventures. Activities."
              className="w-full max-w-[260px] mx-auto h-auto -mb-3"
            />
          </Link>

          {/* Tagline */}
          <p className="mt-4 text-[#a89a8a] text-[15px] leading-relaxed">
            Girls-only travel experiences
            <br />
            Discover hidden destinations together.
          </p>

        {/* Social icons */}
        <div className="mt-6 flex items-center justify-center gap-8 sm:gap-10">
          {socialItems.map(({ label, href, external, icon }) => (
            <a
              key={label}
              href={href}
              {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              aria-label={label}
              className="flex flex-col items-center gap-2 group"
            >
              <span className="w-16 h-16 rounded-full border border-[#a85a2a]/40 flex items-center justify-center text-[#e4782f] transition-colors group-hover:bg-[#a85a2a]/10">
                {icon}
              </span>
              <span className="text-[13px] text-[#fdfcf6]/90">{label}</span>
            </a>
          ))}
        </div>

        {/* Ornamental divider */}
        <div className="mt-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-[#a85a2a]/40" />
          <svg viewBox="0 0 24 24" className="w-4 h-4 text-[#e4782f]" fill="currentColor">
            <path d="M12 2c1 3 3 5 6 6-3 1-5 3-6 6-1-3-3-5-6-6 3-1 5-3 6-6z" />
          </svg>
          <span className="h-px flex-1 bg-[#a85a2a]/40" />
        </div>

        {/* Nav row */}
        <div className="mt-8 grid grid-cols-4">
          {navItems.map(({ label, to, icon: Icon }, i) => (
            <Link
              key={to}
              to={to}
              className={`flex flex-col items-center gap-2 px-1 ${i !== 0 ? 'border-l border-white/10' : ''}`}
            >
              <Icon className="w-5 h-5 text-[#efe3cf]" strokeWidth={1.75} />
              <span className="text-[12px] sm:text-[13px] leading-tight text-[#efe3cf]">
                {label.split(' ').map((word, idx) => (
                  <span key={idx} className="block">{word}</span>
                ))}
              </span>
            </Link>
          ))}
        </div>

        {/* Contact box */}
        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] py-3.5 px-3 flex items-center justify-between gap-1 overflow-x-auto no-scrollbar">
          <a
            href="mailto:trips.ulaa@gmail.com"
            className="flex items-center gap-1 text-[10px] sm:text-[11px] text-[#fdfcf6]/95 hover:text-[#e4782f] transition-colors whitespace-nowrap shrink-0"
          >
            <Mail className="w-3.5 h-3.5 text-[#e4782f] shrink-0" strokeWidth={1.75} />
            trips.ulaa@gmail.com
          </a>
          <span className="h-6 w-px bg-white/10 shrink-0" />
          <a
            href="tel:+916381336772"
            className="flex items-center gap-1 text-[10px] sm:text-[11px] text-[#fdfcf6]/95 hover:text-[#e4782f] transition-colors whitespace-nowrap shrink-0"
          >
            <Phone className="w-3.5 h-3.5 text-[#e4782f] shrink-0" strokeWidth={1.75} />
            +91 63813 36772
          </a>
          <span className="h-6 w-px bg-white/10 shrink-0" />
          <div className="flex items-center gap-1 text-[10px] sm:text-[11px] text-[#fdfcf6]/95 whitespace-nowrap shrink-0">
            <MapPin className="w-3.5 h-3.5 text-[#e4782f] shrink-0" strokeWidth={1.75} />
            India
          </div>
        </div>

          {/* Bottom */}
          <p className="mt-8 text-[13px] text-[#a89a8a] flex items-center justify-center gap-1.5">
            Made with <Heart className="w-3.5 h-3.5 text-[#e4782f] fill-[#e4782f]" /> for the fearless women of India.
          </p>
          <p className="mt-2 text-[12px] text-[#a89a8a]/80">
            © {year} ULAA. All rights reserved.
          </p>
        </div>
      </div>

      {/* ===================== DESKTOP ===================== */}
      <div className="hidden lg:block relative px-6 xl:px-10 py-10">
        <div className="relative max-w-7xl mx-auto grid grid-cols-[1.3fr_1fr_1fr_1fr] gap-x-10 xl:gap-x-16">
          {/* Logo + description */}
          <div>
            <Link to="/" className="inline-block">
              <img
                src="/ULAA-logo-Footer.png"
                alt="ULAA — Unseen. Local. Adventures. Activities."
                className="w-full max-w-[210px] h-auto"
              />
            </Link>
            <p className="mt-3 text-[#a89a8a] text-[15px] leading-relaxed max-w-sm">
              A girls-only travel community for curated trips to India's most beautiful hidden destinations.
            </p>
          </div>

          {/* Quick Links */}
          <div className="border-l border-white/10 pl-10 xl:pl-14">
            <h3 className="text-[#e4782f] text-sm font-button font-semibold tracking-[0.15em] uppercase">
              Quick Links
            </h3>
            <span className="mt-2 block w-8 h-px bg-[#e4782f]" />
            <ul className="mt-4 space-y-5">
              {quickLinks.map(({ label, to, icon: Icon }) => (
                <li key={to}>
                  <Link
                    to={to}
                    className="group flex items-center gap-2.5 text-[#fdfcf6]/90 hover:text-[#e4782f] transition-colors text-[15px]"
                  >
                    <Icon className="w-4 h-4 text-[#e4782f] shrink-0" strokeWidth={1.75} />
                    {label}
                    <ChevronRight
                      className="w-4 h-4 text-[#fdfcf6]/40 group-hover:text-[#e4782f] group-hover:translate-x-0.5 transition-all"
                      strokeWidth={2}
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div className="border-l border-white/10 pl-10 xl:pl-14">
            <h3 className="text-[#e4782f] text-sm font-button font-semibold tracking-[0.15em] uppercase">
              Contact
            </h3>
            <span className="mt-2 block w-8 h-px bg-[#e4782f]" />
            <ul className="mt-4 space-y-5 text-[15px]">
              <li>
                <a
                  href="mailto:trips.ulaa@gmail.com"
                  className="flex items-center gap-2.5 text-[#fdfcf6]/90 hover:text-[#e4782f] transition-colors"
                >
                  <Mail className="w-4 h-4 text-[#e4782f] shrink-0" strokeWidth={1.75} />
                  trips.ulaa@gmail.com
                </a>
              </li>
              <li>
                <a
                  href="tel:+916381336772"
                  className="flex items-center gap-2.5 text-[#fdfcf6]/90 hover:text-[#e4782f] transition-colors"
                >
                  <Phone className="w-4 h-4 text-[#e4782f] shrink-0" strokeWidth={1.75} />
                  +91 63813 36772
                </a>
              </li>
              <li className="flex items-start gap-2.5 text-[#fdfcf6]/90">
                <MapPin className="w-4 h-4 text-[#e4782f] shrink-0 mt-0.5" strokeWidth={1.75} />
                India — Explore Everywhere
              </li>
            </ul>
          </div>

          {/* Follow Us */}
          <div className="border-l border-white/10 pl-10 xl:pl-14">
            <h3 className="text-[#e4782f] text-sm font-button font-semibold tracking-[0.15em] uppercase">
              Follow Us
            </h3>
            <span className="mt-2 block w-8 h-px bg-[#e4782f]" />
            <div className="mt-4 flex items-center gap-3">
              {socialItems.map(({ label, href, external, icon }) => (
                <a
                  key={label}
                  href={href}
                  {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  aria-label={label}
                  className="w-11 h-11 rounded-full border border-[#a85a2a]/40 flex items-center justify-center text-[#fdfcf6]/90 hover:text-[#e4782f] hover:bg-[#a85a2a]/10 transition-colors"
                >
                  {icon}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="relative max-w-7xl mx-auto mt-8 pt-5 border-t border-white/10 flex items-center justify-center gap-3 text-[13px] text-[#a89a8a]">
          <span className="flex items-center gap-1.5">
            Made with <Heart className="w-3.5 h-3.5 text-[#e4782f] fill-[#e4782f]" /> for the fearless women of India.
          </span>
          <span className="h-3.5 w-px bg-white/15" />
          <span>© {year} ULAA. All rights reserved.</span>
        </div>
      </div>
    </footer>
  );
}
