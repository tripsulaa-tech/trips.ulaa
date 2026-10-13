import { Link, useLocation } from 'react-router-dom';
import LostTrailIllustration from './LostTrailIllustration';
import { WhatsAppIcon } from '../icons/WhatsAppIcon';
import { SITE_ORIGIN, WHATSAPP_NUMBER } from '../../constants/site';
import { getWhatsAppLink } from '../../utils/utils-index';

export type NotFoundAction = {
  label: string;
  to: string;
  /** e.g. flagging scroll restoration before navigating back to a listing page. */
  onClick?: () => void;
};

interface NotFoundSceneProps {
  /** Script line above the title. */
  label?: string;
  title: string;
  message: string;
  primary: NotFoundAction;
  secondary?: NotFoundAction;
  /** Public pages: quick links to the main sections plus a WhatsApp help
   *  link that pre-fills the address that didn't work. Off for the admin area. */
  showHelp?: boolean;
}

const QUICK_LINKS: NotFoundAction[] = [
  { label: 'Home', to: '/' },
  { label: 'Upcoming trips', to: '/trips' },
  { label: 'Past trips', to: '/completed-trips' },
  { label: 'About us', to: '/about' },
  { label: 'Contact', to: '/contact' },
];

// Same look as Button's primary/outline variants, as real links — a <button>
// nested in an <a> would give keyboard users two tab stops for one action.
const LINK_BASE =
  'inline-flex items-center justify-center rounded-md min-h-[44px] sm:min-h-[48px] px-5 sm:px-6 text-sm sm:text-base font-button font-semibold border-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
const LINK_PRIMARY = `${LINK_BASE} bg-primary border-primary text-white shadow-warm hover:bg-primary-dark hover:border-primary-dark hover:shadow-warm-lg`;
const LINK_OUTLINE = `${LINK_BASE} border-primary text-primary hover:bg-primary hover:text-white`;

/** The one "not found" design used across the site — the catch-all 404 page,
 *  a trip/album whose slug doesn't exist, and unknown admin URLs all render
 *  this, so a visitor never meets two different dead-end screens. */
export default function NotFoundScene({ label = 'Off the map', title, message, primary, secondary, showHelp = true }: NotFoundSceneProps) {
  const { pathname, search } = useLocation();
  const requested = `${pathname}${search}`;
  const shown = [primary.to, secondary?.to];
  const quickLinks = QUICK_LINKS.filter(l => !shown.includes(l.to));

  return (
    // pt-28/32 clears the fixed navbar; min-h-screen keeps the footer below the fold.
    <section className="min-h-screen flex items-center px-4 sm:px-6 lg:px-8 pt-28 sm:pt-32 pb-14 sm:pb-20">
      <div className="mx-auto w-full max-w-6xl grid items-center gap-10 lg:gap-16 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <p className="font-script font-normal text-3xl md:text-4xl text-primary">{label}</p>
          <h1 className="mt-3 font-display font-bold text-dark leading-tight text-balance text-3xl sm:text-4xl lg:text-5xl">{title}</h1>
          <p className="mt-4 max-w-xl text-dark-muted leading-relaxed sm:text-lg">{message}</p>

          <div className="mt-7 flex flex-col sm:flex-row gap-3">
            <Link to={primary.to} onClick={primary.onClick} className={LINK_PRIMARY}>{primary.label}</Link>
            {secondary && <Link to={secondary.to} onClick={secondary.onClick} className={LINK_OUTLINE}>{secondary.label}</Link>}
          </div>

          {showHelp && (
            <>
              {quickLinks.length > 0 && (
                <nav aria-label="Other pages" className="hidden sm:flex mt-9 pt-5 border-t border-background-warm flex-wrap gap-x-6 gap-y-2">
                  {quickLinks.map(l => (
                    <Link key={l.to} to={l.to} className="text-sm font-button font-semibold text-dark hover:text-primary hover:underline underline-offset-4 transition-colors">
                      {l.label}
                    </Link>
                  ))}
                </nav>
              )}
              {/* Phones already have the bottom nav, so the quick links above are
                  tablet-and-up only; the divider moves down here on small screens. */}
              <div className={`mt-9 pt-5 border-t border-background-warm ${quickLinks.length > 0 ? 'sm:mt-5 sm:pt-0 sm:border-t-0' : ''}`}>
                <a
                  href={getWhatsAppLink(WHATSAPP_NUMBER, `Hi Ulaa! This link didn't open for me: ${SITE_ORIGIN}${requested}`)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-button font-semibold text-[#128C7E] hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary rounded"
                >
                  <WhatsAppIcon size={18} aria-hidden="true" />
                  Can&apos;t find a trip? Message us on WhatsApp
                </a>
              </div>
            </>
          )}

          <p className="mt-6 text-xs text-dark-muted/80 break-all">
            <span className="font-semibold">You tried:</span> {requested}
          </p>
        </div>

        <div className="rounded-lg bg-background-warm/70 border border-background-warm overflow-hidden">
          <LostTrailIllustration className="w-full h-auto block" />
        </div>
      </div>
    </section>
  );
}
