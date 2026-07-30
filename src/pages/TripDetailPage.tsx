import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Layout from '../components/layout/Layout';
import Button from '../components/ui/Button';
import FAQAccordion from '../components/ui/FAQAccordion';
import CancellationPolicyDisplay from '../components/ui/CancellationPolicyDisplay';
import Modal from '../components/ui/Modal';
import BookingForm from '../components/ui/BookingForm';
import ItineraryDayPhotos from '../components/ui/ItineraryDayPhotos';
import GalleryCarousel from '../components/ui/GalleryCarousel';
import Lightbox from '../components/ui/Lightbox';
import PagedCarousel, { useResponsiveItemsPerView, type PagedCarouselHandle } from '../components/ui/PagedCarousel';
import TripHighlightIconDisplay from '../components/ui/TripHighlightIconDisplay';
import { getTripHighlightIcon, getTripHighlightPalette } from '../constants/tripHighlightIcons';
import { getUpcomingTripBySlug } from '../services/api';
import type { UpcomingTrip, TripHighlightCard, TripInclusionItem, TripConfidenceItem } from '../types/types-index';
import { formatDateRange, formatDate, publicSeatsLeft, PLACEHOLDER_IMAGE, formatPrice, getActivePrice, getStrikeThroughPrice, formatAgeRange } from '../utils/utils-index';
import { getGoogleCalendarUrl, downloadTripIcs, addToCalendar } from '../utils/calendar';
import { DEFAULT_CANCELLATION_POLICY } from '../constants/cancellationPolicy';
import {
  MapPin, Calendar, Clock, Users, UserCheck, CheckCircle, XCircle,
  Backpack, Navigation, ArrowLeft, Share2, CalendarPlus, Download, FileDown, Loader2, ExternalLink, Heart, ArrowRight,
  ChevronDown, ChevronUp, BadgeCheck,
  Shirt, Footprints, Glasses, HatGlasses, Headphones, BatteryCharging, Pill, SprayCan, Droplet, GlassWater,
  Cookie, Sparkles, FileText, IdCard, Hand, type LucideIcon,
} from 'lucide-react';

// Maps the number of itinerary days to a responsive grid so the cards always
// land in the requested row pattern on larger screens (2→one row of 2,
// 3→one row of 3, 4→2+2, 5→3+2, 6→3+3) while still stacking to fewer
// columns on narrow screens instead of ever scrolling horizontally.
function getItineraryGridClass(days: number): string {
  switch (days) {
    case 1:
      return 'grid-cols-1';
    case 2:
      return 'grid-cols-1 sm:grid-cols-2';
    case 4:
      return 'grid-cols-1 sm:grid-cols-2';
    default:
      // 3, 5, 6, and anything larger: 3 per row on large screens, which
      // naturally wraps into the 3+2 / 3+3 pattern for 5/6-day trips.
      return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
  }
}

// Fallback icon matching for Things to Carry items that don't have an
// admin-picked icon. Matches common packing-list keywords to a
// representative icon, falling back to the Backpack icon for anything
// unrecognized.
const THINGS_TO_CARRY_ICON_RULES: [RegExp, LucideIcon][] = [
  [/jacket|sweater|hoodie|fleece|thermal/i, Shirt],
  [/shoe|boot|sandal|footwear|trek/i, Footprints],
  [/sunglass|goggle/i, Glasses],
  [/cap|hat/i, HatGlasses],
  [/glove|mitten/i, Hand],
  [/earphone|headphone|earbud/i, Headphones],
  [/power ?bank|charger|battery/i, BatteryCharging],
  [/medicine|medication|pill|first aid/i, Pill],
  [/sunscreen|spf/i, SprayCan],
  [/moistur|lotion|cream/i, Droplet],
  [/water ?bottle|bottle/i, GlassWater],
  [/snack|food/i, Cookie],
  [/wipe|sanitiz|towel/i, Sparkles],
  [/tissue|paper/i, FileText],
  [/id proof|passport|aadhar|adhar|govern|voter|licen/i, IdCard],
];

function getThingsToCarryIcon(item: string): LucideIcon {
  const rule = THINGS_TO_CARRY_ICON_RULES.find(([pattern]) => pattern.test(item));
  return rule ? rule[1] : Backpack;
}

export default function TripDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [trip, setTrip] = useState<UpcomingTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('highlights');
  const [calendarMenuOpen, setCalendarMenuOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [countdown, setCountdown] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);
  const accommodationCarouselRef = useRef<PagedCarouselHandle>(null);
  const [faqsOpen, setFaqsOpen] = useState(false);
  const [cancellationOpen, setCancellationOpen] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [fashionLightboxOpen, setFashionLightboxOpen] = useState(false);
  const [fashionLightboxIndex, setFashionLightboxIndex] = useState(0);
  const navBarRef = useRef<HTMLElement>(null);
  const navLinkRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const calendarMenuRef = useRef<HTMLDivElement>(null);
  const accommodationPerView = useResponsiveItemsPerView({ base: 1, sm: 2, lg: 3 });

  useEffect(() => {
    if (!slug) return;
    getUpcomingTripBySlug(slug)
      .then(data => setTrip(data ?? null))
      .catch(() => setTrip(null))
      .finally(() => setLoading(false));
  }, [slug]);

  // Countdown timer — live tick toward trip start_date
  useEffect(() => {
    if (!trip?.start_date) return;
    const target = new Date(`${trip.start_date}T00:00:00`).getTime();
    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) { setCountdown(null); return; }
      setCountdown({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [trip?.start_date]);

  // Highlight the quick-jump tab for whichever section is currently in view.
  useEffect(() => {
    if (!trip) return;
    const ids = ['highlights', 'itinerary', 'accommodation', 'inclusions', 'gallery', 'confidence', 'faqs', 'cancellation'];
    const sections = ids
      .map(id => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      entries => {
        const visible = entries.filter(e => e.isIntersecting);
        if (visible.length === 0) return;
        // Prefer the section closest to the top of the viewport among those visible.
        const top = visible.reduce((a, b) => (a.boundingClientRect.top < b.boundingClientRect.top ? a : b));
        setActiveSection(top.target.id);
      },
      { rootMargin: '-150px 0px -60% 0px', threshold: 0 }
    );

    sections.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [trip]);

  // Keep the active tab scrolled into view within the horizontally-scrolling
  // nav strip, whether it became active from a click or from scrolling past
  // it manually — so it's never highlighted off to the left or right.
  useEffect(() => {
    const bar = navBarRef.current;
    const link = navLinkRefs.current[activeSection];
    if (!bar || !link) return;
    const target = link.offsetLeft - bar.clientWidth / 2 + link.clientWidth / 2;
    bar.scrollTo({ left: target, behavior: 'smooth' });
  }, [activeSection]);

  useEffect(() => {
    if (!calendarMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (!calendarMenuRef.current?.contains(e.target as Node)) setCalendarMenuOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCalendarMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [calendarMenuOpen]);

  if (loading) {
    return (
      <Layout>
        <div className="h-screen flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!trip) {
    return (
      <Layout>
        <div className="min-h-screen flex flex-col items-center justify-center text-center px-4">
          <h1 className="font-display text-4xl font-bold text-dark mb-4">Trip not found</h1>
          <Link to="/trips"><Button variant="primary">View All Trips</Button></Link>
        </div>
      </Layout>
    );
  }

  const remaining = publicSeatsLeft(trip.total_seats, trip.seats_booked, trip.waitlist_reserved || 0);
  const isFull = remaining === 0;
  const isAlmostFull = remaining > 0 && remaining <= 5;
  const { activePrice, isEarlyBird, deadlinePassed } = getActivePrice(trip.price, trip.early_bird_price, trip.early_bird_deadline);
  const strikeThroughPrice = getStrikeThroughPrice(activePrice, trip.price, isEarlyBird, trip.strike_through_price);
  const hasConfidenceItems = (trip.confidence_items?.length ?? 0) > 0;

  async function handleDownloadPdf() {
    if (!trip || pdfLoading) return;
    setPdfLoading(true);
    try {
      // Lazy-loaded so jsPDF (and its html2canvas dependency) only ever
      // download for someone who actually clicks this, not on every visit
      // to a trip page.
      const { downloadTripItineraryPdf } = await import('../utils/tripItineraryPdf');
      await downloadTripItineraryPdf(trip);
    } catch (err) {
      console.error('Failed to generate itinerary PDF', err);
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <Layout>
      {/* Hero */}
      <div className="relative min-h-[60vh] md:min-h-[70vh] overflow-hidden">
        <img src={trip.cover_image || PLACEHOLDER_IMAGE} alt={trip.title} className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--color-dark)_0%,var(--color-dark)_32%,transparent_55%)] opacity-90" />
        <div className="relative min-h-[60vh] md:min-h-[70vh] flex flex-col justify-end pl-3 sm:pl-4 lg:pl-4 pr-4 sm:pr-6 lg:pr-8 pt-24 sm:pt-28 pb-12 max-w-[1344px] mx-auto left-0 right-0">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            <Link to="/trips" className="inline-flex items-center gap-2 text-white/70 hover:text-white text-sm mb-4 transition-colors">
              <ArrowLeft size={16} /> All Trips
            </Link>
            <h1 className="font-display text-4xl md:text-6xl font-bold text-white mb-4">
              {(() => {
                const hyphenIdx = trip.title.indexOf('-');
                let firstLine: string;
                let secondLine: string;

                if (hyphenIdx !== -1) {
                  // Existing convention: a "-" in the title marks where the
                  // second line should start (e.g. "Sri Lanka - Island Escape").
                  firstLine = trip.title.slice(0, hyphenIdx + 1);
                  secondLine = trip.title.slice(hyphenIdx + 1).trim();
                } else {
                  // No manual "-" in the title: automatically drop the last
                  // word onto its own line so it doesn't get stranded at the
                  // end of a wrapped line (e.g. "Manali Mountain Escape").
                  const words = trip.title.trim().split(/\s+/);
                  if (words.length > 1) {
                    secondLine = words[words.length - 1];
                    firstLine = words.slice(0, -1).join(' ');
                  } else {
                    firstLine = trip.title;
                    secondLine = '';
                  }
                }

                if (!secondLine) return firstLine;

                return (
                  <>
                    {firstLine}
                    <br />
                    {secondLine}
                  </>
                );
              })()}
            </h1>
            <div className="flex w-fit items-center gap-2 text-secondary text-sm font-button font-semibold mb-3">
              <MapPin size={14} /> {trip.destination}
            </div>
            {trip.description && (
              <div className="max-w-xl mb-6">
                <p className={`text-white/80 text-base md:text-lg leading-relaxed ${descriptionExpanded ? '' : 'line-clamp-4'}`}>
                  {trip.description}
                </p>
                {trip.description.length > 150 && (
                  <button
                    type="button"
                    onClick={() => setDescriptionExpanded(v => !v)}
                    className="mt-1 text-primary text-sm font-button font-semibold underline underline-offset-2 hover:text-primary-dark transition-colors"
                  >
                    {descriptionExpanded ? 'Read less' : 'Read more'}
                  </button>
                )}
              </div>
            )}
            <div className="relative flex flex-wrap items-center gap-3 mb-5">
              <Button
                variant="primary"
                size="sm"
                onClick={() => setBookingOpen(true)}
                className="whitespace-nowrap sm:px-8 sm:py-4 sm:text-lg sm:rounded-lg"
              >
                {isFull ? 'Join Waitlist' : 'Book Your Seat'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={handleDownloadPdf}
                disabled={pdfLoading}
                className="whitespace-nowrap text-white border-white/40 hover:border-white hover:bg-white/10 sm:px-8 sm:py-4 sm:text-lg sm:rounded-lg"
              >
                {pdfLoading ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
                {pdfLoading ? 'Preparing…' : 'Download Itinerary'}
              </Button>
              {countdown && (
                <div className="flex flex-col items-center gap-2 mt-3 ml-auto md:mt-0 md:ml-0 md:absolute md:right-0 md:translate-x-10 md:top-0 bg-background-warm/95 backdrop-blur-md border border-dark/10 shadow-[0_10px_35px_-8px_rgba(45,33,24,0.35)] rounded-xl px-5 py-3.5">
                  <p className="flex items-center gap-1.5 text-primary text-[10px] font-button font-bold uppercase tracking-[0.2em] whitespace-nowrap">
                    <Clock size={11} /> Trip starts in
                  </p>
                  <div className="flex items-center gap-2">
                    {[
                      { v: countdown.days, l: 'Days' },
                      { v: countdown.hours, l: 'Hrs' },
                      { v: countdown.minutes, l: 'Min' },
                      { v: countdown.seconds, l: 'Sec' },
                    ].map(({ v, l }, i) => (
                      <div key={l} className="flex items-center gap-2">
                        <div className="text-center">
                          <div
                            className="relative w-10 h-9 overflow-hidden rounded-md bg-gradient-to-b from-dark-muted to-dark shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                            style={{ perspective: '80px' }}
                          >
                            <div className="absolute left-0 right-0 top-1/2 h-px bg-black/40 -translate-y-px z-10" />
                            <AnimatePresence mode="popLayout" initial={false}>
                              <motion.div
                                key={v}
                                initial={{ rotateX: 90, opacity: 0 }}
                                animate={{ rotateX: 0, opacity: 1 }}
                                exit={{ rotateX: -90, opacity: 0 }}
                                transition={{ duration: 0.8, ease: 'easeInOut' }}
                                style={{ transformOrigin: 'center', backfaceVisibility: 'hidden', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
                                className="absolute inset-0 flex items-center justify-center font-display text-lg font-bold text-white tabular-nums"
                              >
                                {String(v).padStart(2, '0')}
                              </motion.div>
                            </AnimatePresence>
                          </div>
                          <div className="text-dark/50 text-[9px] uppercase tracking-widest text-center mt-1">{l}</div>
                        </div>
                        {i < 3 && (
                          <div className="flex flex-col gap-1 self-start mt-3">
                            <span className="w-1 h-1 rounded-full bg-primary/50" />
                            <span className="w-1 h-1 rounded-full bg-primary/50" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-4 text-white/70 text-sm">
              <span className="flex items-center gap-2"><Calendar size={14} /> {formatDateRange(trip.start_date, trip.end_date)}</span>
              <span className="flex items-center gap-2"><Clock size={14} /> {trip.duration}</span>
              <span className="flex items-center gap-2"><Users size={14} />
                {isFull ? 'Sold out' : isAlmostFull ? 'Almost full — hurry!' : `Group of ${trip.total_seats}`}
              </span>
              {(trip.min_age != null || trip.max_age != null) && (
                <span className="flex items-center gap-2"><UserCheck size={14} /> {formatAgeRange(trip.min_age, trip.max_age)}</span>
              )}
			  {isEarlyBird && (
				<span className="flex items-center gap-1.5 bg-secondary text-white text-xs font-button font-semibold px-3 py-1.5 rounded-md">
				Early Bird
				</span>
			  )}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Quick jump nav */}
      <div className="sticky top-20 z-30 bg-white/95 backdrop-blur-md border-b border-background-warm px-4 sm:px-6 lg:px-8">
        <div className="max-w-[1344px] mx-auto flex items-center gap-2">
          <nav ref={navBarRef} className="flex-1 min-w-0 flex gap-1 overflow-x-auto no-scrollbar py-3">
            {(trip.highlight_cards?.length ?? 0) > 0 && (
              <a
                href="#highlights"
                ref={el => { navLinkRefs.current['highlights'] = el; }}
                className={`shrink-0 px-4 py-1.5 rounded-md text-sm font-button font-semibold transition-colors whitespace-nowrap ${activeSection === 'highlights' ? 'bg-primary text-white' : 'text-dark-muted hover:text-primary hover:bg-background-warm'}`}
              >
                Highlights
              </a>
            )}
            {trip.itinerary.length > 0 && (
              <a
                href="#itinerary"
                ref={el => { navLinkRefs.current['itinerary'] = el; }}
                className={`shrink-0 px-4 py-1.5 rounded-md text-sm font-button font-semibold transition-colors whitespace-nowrap ${activeSection === 'itinerary' ? 'bg-primary text-white' : 'text-dark-muted hover:text-primary hover:bg-background-warm'}`}
              >
                Itinerary
              </a>
            )}
            {(trip.accommodation_description || (trip.accommodation_photos?.length ?? 0) > 0) && (
              <a
                href="#accommodation"
                ref={el => { navLinkRefs.current['accommodation'] = el; }}
                className={`shrink-0 px-4 py-1.5 rounded-md text-sm font-button font-semibold transition-colors whitespace-nowrap ${activeSection === 'accommodation' ? 'bg-primary text-white' : 'text-dark-muted hover:text-primary hover:bg-background-warm'}`}
              >
                Stay
              </a>
            )}
            <a
              href="#inclusions"
              ref={el => { navLinkRefs.current['inclusions'] = el; }}
              className={`shrink-0 px-4 py-1.5 rounded-md text-sm font-button font-semibold transition-colors whitespace-nowrap ${activeSection === 'inclusions' ? 'bg-primary text-white' : 'text-dark-muted hover:text-primary hover:bg-background-warm'}`}
            >
              Inclusions
            </a>
            {(trip.gallery_images.length > 0 || (trip.gallery_items?.length ?? 0) > 0) && (
              <a
                href="#gallery"
                ref={el => { navLinkRefs.current['gallery'] = el; }}
                className={`shrink-0 px-4 py-1.5 rounded-md text-sm font-button font-semibold transition-colors whitespace-nowrap ${activeSection === 'gallery' ? 'bg-primary text-white' : 'text-dark-muted hover:text-primary hover:bg-background-warm'}`}
              >
                Gallery
              </a>
            )}
            {(trip.confidence_items?.length ?? 0) > 0 && (
              <a
                href="#confidence"
                ref={el => { navLinkRefs.current['confidence'] = el; }}
                className={`shrink-0 px-4 py-1.5 rounded-md text-sm font-button font-semibold transition-colors whitespace-nowrap ${activeSection === 'confidence' ? 'bg-primary text-white' : 'text-dark-muted hover:text-primary hover:bg-background-warm'}`}
              >
                Confidence
              </a>
            )}
            {trip.faqs.length > 0 && (
              <a
                href="#faqs"
                ref={el => { navLinkRefs.current['faqs'] = el; }}
                className={`shrink-0 px-4 py-1.5 rounded-md text-sm font-button font-semibold transition-colors whitespace-nowrap ${activeSection === 'faqs' ? 'bg-primary text-white' : 'text-dark-muted hover:text-primary hover:bg-background-warm'}`}
              >
                FAQs
              </a>
            )}
            <a
              href="#cancellation"
              ref={el => { navLinkRefs.current['cancellation'] = el; }}
              className={`shrink-0 px-4 py-1.5 rounded-md text-sm font-button font-semibold transition-colors whitespace-nowrap ${activeSection === 'cancellation' ? 'bg-primary text-white' : 'text-dark-muted hover:text-primary hover:bg-background-warm'}`}
            >
              Cancellation
            </a>
          </nav>

          {/* Pinned actions — stay visible through the whole page scroll. */}
          <div className="shrink-0 flex items-center gap-1 pl-1 border-l border-background-warm">
            <button
              type="button"
              onClick={() => navigator.share?.({ title: trip.title, url: window.location.href })}
              aria-label="Share this trip"
              title="Share this trip"
              className="h-9 w-9 flex items-center justify-center rounded-full text-dark-muted hover:text-primary hover:bg-background-warm transition-colors"
            >
              <Share2 size={16} />
            </button>
            <button
              type="button"
              onClick={() => addToCalendar(trip)}
              aria-label="Add to calendar"
              title="Add to calendar"
              className="h-9 w-9 flex items-center justify-center rounded-full text-dark-muted hover:text-primary hover:bg-background-warm transition-colors"
            >
              <CalendarPlus size={16} />
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={pdfLoading}
              aria-label="Download itinerary PDF"
              title="Download itinerary PDF"
              className="h-9 w-9 flex items-center justify-center rounded-full text-dark-muted hover:text-primary hover:bg-background-warm transition-colors disabled:opacity-50"
            >
              {pdfLoading ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative isolate px-4 sm:px-6 lg:px-8 py-16 pb-28 lg:pb-16">
        <div className="max-w-[1344px] mx-auto space-y-12">
            {/* Highlights */}
            {(trip.highlight_cards?.length ?? 0) > 0 ? (
              <section id="highlights" className="scroll-mt-44">
                <h2 className="font-display text-3xl font-bold text-dark mb-8 flex items-center justify-center gap-2 text-center">
                  Why You'll Love This Trip
                  <Heart size={20} className="text-primary/70 -rotate-6" fill="currentColor" fillOpacity={0.15} />
                </h2>
                <div className="flex flex-wrap justify-center divide-y divide-x-0 sm:divide-y-0 sm:divide-x divide-background-warm">
                  {trip.highlight_cards!.map((card: TripHighlightCard, i: number) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.07, duration: 0.5 }}
                      className="flex flex-col items-center text-center gap-3 px-4 py-5 w-1/2 sm:w-1/3 lg:w-1/6"
                    >
                      <TripHighlightIconDisplay icon={card.icon} index={i} />
                      <div>
                        <h3 className="font-display font-bold text-dark text-sm mb-1">{card.heading}</h3>
                        <p className="text-dark-muted text-xs leading-relaxed">{card.description}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </section>
            ) : null}

            {/* Itinerary */}
            {trip.itinerary.length > 0 && (
              <section id="itinerary" className="scroll-mt-44 mb-[60px]">
                <h2 className="font-display text-3xl font-bold text-dark mb-10 text-center">
                  {trip.itinerary.length} Day{trip.itinerary.length !== 1 ? 's' : ''} of Unforgettable Moments
                </h2>
                <div className={`grid gap-x-6 gap-y-12 pt-6 ${getItineraryGridClass(trip.itinerary.length)}`}>
                  {trip.itinerary.map((day, i) => {
                    const meta = getTripHighlightIcon(day.icon);
                    const palette = getTripHighlightPalette(i);
                    return (
                      <motion.div
                        key={day.day}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: Math.min(i, 8) * 0.07, duration: 0.5 }}
                        className="relative"
                      >
                        {/* Circular badge — half in, half out of the card's top edge */}
                        <div
                          className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full flex items-center justify-center shadow-md ring-4 ring-white font-button font-bold text-sm text-white"
                          style={{ backgroundColor: palette.fg }}
                        >
                          {meta ? <meta.Icon size={20} color="#fff" strokeWidth={2.25} /> : day.day}
                        </div>
                        <div className="w-full min-h-[380px] bg-white border border-background-warm rounded-2xl pt-8 pb-4 px-4 shadow-card hover:shadow-card-hover transition-shadow flex flex-col gap-2 text-center">
                          <h3 className="font-display font-bold text-dark text-base">{day.title}</h3>
                          <div className="flex-1">
                            <p className="text-dark-muted text-xs leading-relaxed">{day.description}</p>
                            {(day.bullets?.length ?? 0) > 0 && (
                              <ul className="text-left space-y-1 mt-2">
                                {day.bullets!.map((bullet, bi) => (
                                  <li key={bi} className="flex items-start gap-2 text-dark-muted text-xs leading-relaxed">
                                    <span className="mt-1.5 w-1 h-1 rounded-full bg-primary shrink-0" />
                                    <span>{bullet}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          {(day.images?.length ?? 0) > 0 && (
                            <ItineraryDayPhotos images={day.images || []} className="h-40 mt-1" />
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Accommodation — Stay. Relax. Repeat. */}
            {(trip.accommodation_description || (trip.accommodation_photos?.length ?? 0) > 0) && (
              <section id="accommodation" className="scroll-mt-44">
                <h2 className="font-display text-3xl font-bold text-dark mb-2">Stay. Relax. Repeat.</h2>
                {trip.accommodation_description && (
                  <p className="text-dark-muted leading-relaxed text-base mb-6">{trip.accommodation_description}</p>
                )}
                {(trip.accommodation_photos?.length ?? 0) > 0 && (() => {
                  const photos = trip.accommodation_photos!;
                  const INITIAL_COUNT = 3;
                  const hasMore = photos.length > INITIAL_COUNT;
                  return (
                    <>
                      <PagedCarousel
                        ref={accommodationCarouselRef}
                        items={photos}
                        itemsPerView={accommodationPerView}
                        keyExtractor={(_photo, i) => i}
                        renderItem={(photo, i) => (
                          <div className="aspect-video overflow-hidden rounded-xl">
                            <img src={photo} alt={`Accommodation ${i + 1}`} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
                          </div>
                        )}
                      />
                      {hasMore && (
                        <button
                          type="button"
                          onClick={() => accommodationCarouselRef.current?.next()}
                          className="mt-4 inline-flex items-center gap-1.5 text-sm font-button font-semibold text-primary hover:text-primary/80 transition-colors"
                        >
                          View Accommodation Details <ArrowRight size={15} />
                        </button>
                      )}
                    </>
                  );
                })()}
              </section>
            )}

            {/* Included / Not Included */}
            <section id="inclusions" className="scroll-mt-44">
              <div className="space-y-10">
                {/* What's Included */}
                {((trip.included_groups?.length ?? 0) > 0 || (trip.included_items?.length ?? 0) > 0) && (
                  <div>
                    <h2 className="font-display text-2xl font-bold text-dark mb-4">What's Included</h2>
                    {(trip.included_groups?.length ?? 0) > 0 ? (
                      <div className="grid sm:grid-cols-2 gap-4">
                        {trip.included_groups!.map((group, gi) => (
                          <div key={gi} className="bg-background-warm rounded-lg p-6">
                            <div className="flex items-center gap-2 mb-2">
                              {group.icon && <TripHighlightIconDisplay icon={group.icon} index={gi} size="sm" />}
                              <h3 className="font-display text-lg font-bold text-dark">{group.heading}</h3>
                            </div>
                            <ul className="space-y-1.5">
                              {group.bullets.map((bullet, bi) => (
                                <li key={bi} className="flex items-start gap-2 text-sm text-dark">
                                  <span className="mt-2 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                                  <span>{bullet}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {trip.included_items!.map((item: TripInclusionItem, i: number) => (
                          <div key={i} className="flex flex-col items-center text-center gap-2 bg-background-warm rounded-xl px-4 py-5">
                            {item.icon ? (
                              <TripHighlightIconDisplay icon={item.icon} index={i} size="sm" />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                                <CheckCircle size={18} className="text-green-600" />
                              </div>
                            )}
                            <span className="text-sm text-dark font-medium leading-snug">{item.description}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {/* What's Not Included */}
                {((trip.not_included_items?.length ?? 0) > 0 || trip.not_included.length > 0) && (
                  <div>
                    <h2 className="font-display text-2xl font-bold text-dark mb-4">What's Not Included</h2>
                    <div className="flex flex-wrap gap-2">
                      {(trip.not_included_items?.length ?? 0) > 0
                        ? trip.not_included_items!.map((item: TripInclusionItem, i: number) => (
                            <span key={i} className="flex items-center gap-1.5 bg-background-warm rounded-lg px-4 py-2 text-sm text-dark">
                              <XCircle size={14} className="text-red-400 shrink-0" />
                              {item.description}
                            </span>
                          ))
                        : trip.not_included.map((item, i) => (
                            <span key={i} className="flex items-center gap-1.5 bg-background-warm rounded-lg px-4 py-2 text-sm text-dark">
                              <XCircle size={14} className="text-red-400 shrink-0" />
                              {item}
                            </span>
                          ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {((trip.gallery_items?.length ?? 0) > 0 || trip.gallery_images.length > 0) && (
              <section id="gallery" className="scroll-mt-44">
                <div className="mb-6">
                  <h2 className="font-display text-3xl font-bold text-dark mb-2">Places You'll Definitely Post</h2>
                  {trip.gallery_description && (
                    <p className="text-dark-muted text-sm max-w-2xl">{trip.gallery_description}</p>
                  )}
                </div>
                {(() => {
                  const allItems: { photo: string; description?: string }[] =
                    (trip.gallery_items?.length ?? 0) > 0
                      ? trip.gallery_items!
                      : trip.gallery_images.map(photo => ({ photo }));
                  return <GalleryCarousel items={allItems} />;
                })()}
              </section>
            )}

            {/* Fashion Aesthetics */}
            {(trip.fashion_photos?.length ?? 0) > 0 && (
              <section className="scroll-mt-44">
                <h2 className="font-display text-2xl font-bold text-dark mb-2">Fashion Aesthetics</h2>
                {trip.fashion_description && (
                  <p className="text-dark-muted text-sm mb-4">{trip.fashion_description}</p>
                )}
                <div className="columns-2 sm:columns-3 gap-2 [&>*]:mb-2">
                  {(() => {
                    const VISIBLE_COUNT = 7;
                    const photos = trip.fashion_photos!;
                    const visible = photos.slice(0, VISIBLE_COUNT);
                    const remaining = photos.length - visible.length;
                    return visible.map((photo, i) => {
                      const isLastVisible = i === visible.length - 1;
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => { setFashionLightboxIndex(i); setFashionLightboxOpen(true); }}
                          className="relative block w-full overflow-hidden rounded-lg break-inside-avoid group"
                        >
                          {/* h-auto (no object-cover) lets each tile take the photo's own
                              aspect ratio, so admin-uploaded images are never cropped —
                              portrait, landscape, and square photos all show in full. */}
                          <img src={photo} alt={`Fashion ${i + 1}`} className="w-full h-auto block group-hover:scale-105 transition-transform duration-500" />
                          {isLastVisible && remaining > 0 && (
                            <div className="absolute inset-0 bg-dark/50 flex items-center justify-center">
                              <span className="text-white font-display font-bold text-lg">+{remaining}</span>
                            </div>
                          )}
                        </button>
                      );
                    });
                  })()}
                </div>
                <Lightbox
                  images={trip.fashion_photos!}
                  initialIndex={fashionLightboxIndex}
                  isOpen={fashionLightboxOpen}
                  onClose={() => setFashionLightboxOpen(false)}
                />
              </section>
            )}

            {/* Book Your Seat — sits directly below Fashion Aesthetics / Gallery, matching the quick-jump nav order.
                Travel with Confidence sits to its left as its own separate card. */}
            <div className={`grid grid-cols-1 gap-6 ${hasConfidenceItems ? 'lg:grid-cols-[1fr_640px] lg:divide-x lg:divide-background-warm' : ''}`}>
            {hasConfidenceItems && (
              <section id="confidence" className="scroll-mt-44 flex flex-col justify-center lg:pr-10">
                <h2 className="font-display text-3xl font-bold text-dark mb-3">Travel with Confidence</h2>
                {trip.confidence_description && (
                  <p className="text-dark-muted text-sm leading-relaxed mb-6">{trip.confidence_description}</p>
                )}
                <div className="grid grid-cols-1 gap-4 w-fit">
                  {trip.confidence_items!.map((item: TripConfidenceItem, i: number) => (
                    <div key={i} className="flex items-center justify-start gap-3 p-2">
                      {item.icon && <TripHighlightIconDisplay icon={item.icon} index={i} size="sm" />}
                      <p className="text-dark text-sm leading-relaxed">{item.description}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className={`bg-white rounded-2xl shadow-warm-lg border border-background-warm p-8 sm:py-10 sm:pl-10 sm:pr-14 ${hasConfidenceItems ? 'lg:ml-10' : 'max-w-2xl mx-auto w-full'}`}>
              <div className="max-w-xl mx-auto text-center">
                {activePrice != null && (
                  <div className="mb-5 pb-5 border-b border-background-warm">
                    {strikeThroughPrice != null ? (
                      <>
                        <div className="flex items-center justify-center gap-2">
                          <span className="font-display text-3xl font-bold text-primary">{formatPrice(activePrice)}</span>
                          <span className="text-dark-muted line-through text-lg">{formatPrice(strikeThroughPrice)}</span>
                        </div>
                        <p className="text-dark-muted text-xs mt-1">per person</p>

                        <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
                          <span className="bg-green-50 border border-green-200 text-green-700 text-xs font-button font-medium px-2.5 py-1 rounded-md">
                            Save {formatPrice(strikeThroughPrice - activePrice)}
                          </span>
                          {isEarlyBird && (
                            <span className="bg-secondary text-white text-xs font-button font-semibold px-2.5 py-1 rounded-md">
                              Early Bird
                            </span>
                          )}
                        </div>

                        {isEarlyBird && trip.early_bird_deadline && (
                          <p className="flex items-center justify-center gap-1 text-orange-600 text-xs font-medium mt-2">
                            <Clock size={12} className="shrink-0" />
                            Offer ends {formatDate(trip.early_bird_deadline, { day: 'numeric', month: 'long', year: 'numeric' })}
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="font-display text-3xl font-bold text-dark">{formatPrice(activePrice)}</span>
                        <p className="text-dark-muted text-xs mt-1">per person</p>
                        {deadlinePassed && (
                          <p className="text-dark-muted text-xs mt-1">Early-bird offer has ended</p>
                        )}
                      </>
                    )}
                  </div>
                )}
                <div className="mb-6">
                  {isFull ? (
                    <span className="inline-block bg-red-50 text-red-600 text-sm font-button font-semibold px-4 py-2 rounded-md">
                      Sold Out
                    </span>
                  ) : isAlmostFull ? (
                    <span className="inline-block bg-amber-50 text-amber-700 text-sm font-button font-semibold px-4 py-2 rounded-md">
                      Only {remaining} seats left — almost full!
                    </span>
                  ) : (
                    <span className="inline-block bg-green-50 text-green-700 text-sm font-button font-semibold px-4 py-2 rounded-md">
                      Seats available
                    </span>
                  )}
                </div>

                <div className="space-y-3 mb-6 max-w-xs mx-auto">
                  <div className="flex justify-between text-sm">
                    <span className="text-dark-muted">Dates</span>
                    <span className="text-dark font-medium">{formatDateRange(trip.start_date, trip.end_date)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-dark-muted">Duration</span>
                    <span className="text-dark font-medium">{trip.duration}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-dark-muted">Group Size</span>
                    <span className="text-dark font-medium">Max {trip.total_seats}</span>
                  </div>
                  {(trip.min_age != null || trip.max_age != null) && (
                    <div className="flex justify-between text-sm">
                      <span className="text-dark-muted">Age Range</span>
                      <span className="text-dark font-medium">{formatAgeRange(trip.min_age, trip.max_age)}</span>
                    </div>
                  )}
                </div>

                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  onClick={() => setBookingOpen(true)}
                >
                  {isFull ? 'Join Waitlist' : 'Book Your Seat'}
                </Button>

                <div className="flex items-center justify-center flex-nowrap gap-x-3 mt-3">
                  <div ref={calendarMenuRef} className="relative">
                    <button
                      onClick={() => setCalendarMenuOpen(o => !o)}
                      className="flex items-center gap-1.5 whitespace-nowrap text-sm text-dark-muted hover:text-primary transition-colors"
                    >
                      <CalendarPlus size={14} /> Add to calendar
                    </button>

                    {calendarMenuOpen && (
                      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-20 w-56 rounded-lg border-2 border-background-warm bg-white shadow-warm-lg py-1 overflow-hidden">
                        <a
                          href={getGoogleCalendarUrl(trip)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setCalendarMenuOpen(false)}
                          className="flex items-center gap-2 px-4 py-2 text-sm text-dark text-left hover:bg-background-warm transition-colors"
                        >
                          <Calendar size={14} className="shrink-0" /> Google Calendar
                        </a>
                        <button
                          type="button"
                          onClick={() => { downloadTripIcs(trip); setCalendarMenuOpen(false); }}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-dark text-left hover:bg-background-warm transition-colors"
                        >
                          <Download size={14} className="shrink-0" /> Apple / Outlook (.ics)
                        </button>
                      </div>
                    )}
                  </div>

                  <span className="text-background-warm">|</span>

                  <button
                    onClick={() => navigator.share?.({ title: trip.title, url: window.location.href })}
                    className="flex items-center gap-1.5 whitespace-nowrap text-sm text-dark-muted hover:text-primary transition-colors"
                  >
                    <Share2 size={14} /> Share this trip
                  </button>

                  <span className="text-background-warm">|</span>

                  <button
                    type="button"
                    onClick={handleDownloadPdf}
                    disabled={pdfLoading}
                    className="flex items-center gap-1.5 whitespace-nowrap text-sm text-dark-muted hover:text-primary transition-colors disabled:opacity-50"
                  >
                    {pdfLoading ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
                    {pdfLoading ? 'Preparing PDF…' : 'Download itinerary'}
                  </button>
                </div>

                <p className="flex items-center justify-center gap-1.5 text-xs text-dark-muted text-center mt-4">
                  <BadgeCheck size={14} className="text-green-600 shrink-0" />
                  No payment required to enquire. We'll contact you within 24 hours.
                </p>
              </div>
            </section>
            </div>

            {/* Things to Carry — kept directly above Meeting Point */}
            {((trip.things_to_carry_items?.length ?? 0) > 0) && (
              <section className="scroll-mt-44">
                <h2 className="font-display text-2xl font-bold text-dark mb-2">Things to Carry</h2>
                <p className="text-dark-muted text-sm mb-4">Pack smart. Travel light. Stay ready.</p>
                <div className="flex flex-wrap gap-2">
                  {trip.things_to_carry_items!.map((item: TripInclusionItem, i: number) => {
                    const Icon = (item.icon && getTripHighlightIcon(item.icon)?.Icon) || getThingsToCarryIcon(item.description);
                    return (
                      <span key={i} className="inline-flex items-center gap-1.5 bg-background-warm/60 rounded-lg px-3 py-2.5">
                        <Icon size={18} className="text-primary shrink-0" />
                        <span className="text-sm text-dark font-medium leading-snug whitespace-nowrap">{item.description}</span>
                      </span>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Meeting Point */}
            {trip.meeting_point && (
              <section className="bg-background-warm rounded-lg p-6">
                <h2 className="font-display text-2xl font-bold text-dark mb-3 flex items-center gap-2">
                  <Navigation size={22} className="text-primary" /> Meeting Point
                </h2>
                <p className="text-dark font-semibold mb-1">{trip.meeting_point}</p>
                {trip.meeting_address && (
                  <p className="text-dark-muted text-sm mb-3">{trip.meeting_address}</p>
                )}
                {(trip.meeting_time || trip.meeting_terminal || trip.meeting_details) && (
                  <dl className="mb-3 space-y-1 text-sm">
                    {trip.meeting_time && (
                      <div className="flex gap-1.5">
                        <dt className="font-semibold text-dark">Time:</dt>
                        <dd className="text-dark-muted">{trip.meeting_time}</dd>
                      </div>
                    )}
                    {trip.meeting_terminal && (
                      <div className="flex gap-1.5">
                        <dt className="font-semibold text-dark">Terminal:</dt>
                        <dd className="text-dark-muted">{trip.meeting_terminal}</dd>
                      </div>
                    )}
                    {trip.meeting_details && (
                      <div className="flex gap-1.5">
                        <dt className="font-semibold text-dark">Details:</dt>
                        <dd className="text-dark-muted">{trip.meeting_details}</dd>
                      </div>
                    )}
                  </dl>
                )}
                <a
                  href={trip.meeting_point_map_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trip.meeting_point)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-button font-semibold text-primary hover:text-primary/80 transition-colors"
                >
                  <MapPin size={15} /> View on map
                </a>
              </section>
            )}

            {/* Founder */}
            {trip.trip_founder && (trip.trip_founder.name || trip.trip_founder.photo) && (
              <section className="scroll-mt-44 bg-dark rounded-2xl p-8">
                <h2 className="font-display text-2xl font-bold text-white mb-6">Meet Your Trip Leader</h2>
                <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start">
                  {trip.trip_founder.photo ? (
                    <img
                      src={trip.trip_founder.photo}
                      alt={trip.trip_founder.name}
                      className="w-24 h-24 rounded-full object-cover border-4 border-primary/30 flex-shrink-0"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-white/10 border-4 border-primary/30 flex items-center justify-center flex-shrink-0">
                      <span className="text-white/40 text-3xl font-display font-bold">{trip.trip_founder.name.charAt(0)}</span>
                    </div>
                  )}
                  <div>
                    {trip.trip_founder.name && (
                      <h3 className="font-display text-xl font-bold text-white mb-1">{trip.trip_founder.name}</h3>
                    )}
                    {trip.trip_founder.description && (
                      <p className="text-white/70 text-sm leading-relaxed">{trip.trip_founder.description}</p>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* Eligibility — only shown when the admin has set an age
                restriction on this trip (Admin → Trips → Basic Info). */}
            {(trip.min_age != null || trip.max_age != null) && (
              <section className="bg-background-warm rounded-lg p-6">
                <h2 className="font-display text-2xl font-bold text-dark mb-2 flex items-center gap-2">
                  <UserCheck size={22} className="text-primary" /> Eligibility
                </h2>
                <p className="text-dark-muted">
                  This trip is open to travelers aged {formatAgeRange(trip.min_age, trip.max_age)}.
                </p>
              </section>
            )}

            {/* FAQs */}
            {trip.faqs.length > 0 && (
              <section id="faqs" className="scroll-mt-44">
                <button
                  type="button"
                  onClick={() => setFaqsOpen(o => !o)}
                  aria-expanded={faqsOpen}
                  className="w-full flex items-center justify-between gap-4 mb-6"
                >
                  <h2 className="font-display text-3xl font-bold text-dark">FAQs</h2>
                  {faqsOpen ? (
                    <ChevronUp size={24} className="text-primary shrink-0" />
                  ) : (
                    <ChevronDown size={24} className="text-primary shrink-0" />
                  )}
                </button>
                <AnimatePresence initial={false}>
                  {faqsOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <FAQAccordion faqs={trip.faqs} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>
            )}

            {/* Cancellation Policy */}
            <section id="cancellation" className="scroll-mt-44">
              <button
                type="button"
                onClick={() => setCancellationOpen(o => !o)}
                aria-expanded={cancellationOpen}
                className="w-full flex items-center justify-between gap-4 mb-6"
              >
                <h2 className="font-display text-3xl font-bold text-dark">Cancellation Policy</h2>
                {cancellationOpen ? (
                  <ChevronUp size={24} className="text-primary shrink-0" />
                ) : (
                  <ChevronDown size={24} className="text-primary shrink-0" />
                )}
              </button>
              <AnimatePresence initial={false}>
                {cancellationOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <CancellationPolicyDisplay policy={trip.cancellation_policy || DEFAULT_CANCELLATION_POLICY} />
                  </motion.div>
                )}
              </AnimatePresence>
            </section>

        </div>
      </div>

            {/* Sticky mobile booking bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-background-warm shadow-warm-lg px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          {/* Left: price + meta */}
          <div className="min-w-0 flex-1">
            {/* Row 1: discounted price + original price + Save */}
            <div className="flex items-center gap-1.5">
              {activePrice != null ? (
                <>
                  <span className="font-display text-base font-bold text-dark shrink-0">{formatPrice(activePrice)}</span>
                  {strikeThroughPrice != null && (
                    <>
                      <span className="text-dark-muted line-through text-xs shrink-0">{formatPrice(strikeThroughPrice)}</span>
                      <span className="bg-green-50 border border-green-200 text-green-700 text-[10px] font-button font-medium px-1.5 py-0.5 rounded-md shrink-0 whitespace-nowrap">
                        Save {formatPrice(strikeThroughPrice - activePrice)}
                      </span>
                    </>
                  )}
                </>
              ) : (
                <span className="text-sm text-dark-muted">Enquire for pricing</span>
              )}
            </div>

            {/* Row 2: Early Bird + Ends date */}
            <div className="flex items-center gap-1.5 mt-1 overflow-x-auto no-scrollbar">
              {isEarlyBird && (
                <span className="bg-secondary text-white text-[10px] font-button font-semibold px-1.5 py-0.5 rounded-md shrink-0 whitespace-nowrap">
                  Early Bird
                </span>
              )}
              {isEarlyBird && trip.early_bird_deadline && (
                <span className="flex items-center gap-0.5 text-orange-600 text-[10px] font-medium shrink-0 whitespace-nowrap">
                  <Clock size={10} className="shrink-0" />
                  Offer ends {formatDate(trip.early_bird_deadline, { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              )}
            </div>
          </div>

          {/* Right: CTA with seats-left inside */}
          <Button
            variant="primary"
            size="sm"
            onClick={() => setBookingOpen(true)}
            className="!rounded-lg !px-4 !py-2 shrink-0 flex flex-col items-center !gap-0 leading-tight"
          >
            <span className="text-sm font-bold whitespace-nowrap">
              {isFull ? 'Join Waitlist' : 'Book Your Seat'}
            </span>
            {isAlmostFull && (
              <span className="text-[9px] font-normal text-white/85 mt-0.5">
                Only {remaining} left!
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* End Banner */}
      {trip.end_banner && (trip.end_banner.heading || trip.end_banner.image) && (
        <div className="relative overflow-hidden mt-0">
          {trip.end_banner.image && (
            <img src={trip.end_banner.image} alt="" className="absolute inset-0 w-full h-full object-cover" />
          )}
          <div className={`relative ${trip.end_banner.image ? 'bg-dark/70' : 'bg-dark'} py-20 px-4 sm:px-6 lg:px-8`}>
            <div className="max-w-[1344px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
              <div>
                {trip.end_banner.heading && (
                  <h2 className="font-display text-4xl md:text-5xl font-bold text-white leading-tight mb-4">
                    {trip.end_banner.heading}
                  </h2>
                )}
                {trip.end_banner.description && (
                  <p className="text-white/70 text-lg leading-relaxed mb-6">{trip.end_banner.description}</p>
                )}
                {trip.end_banner.cta_label && (
                  trip.end_banner.cta_url ? (
                    <a
                      href={trip.end_banner.cta_url}
                      className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white font-button font-semibold px-8 py-3 rounded-full transition-colors"
                    >
                      {trip.end_banner.cta_label} <ExternalLink size={15} />
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setBookingOpen(true)}
                      className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white font-button font-semibold px-8 py-3 rounded-full transition-colors"
                    >
                      {trip.end_banner.cta_label}
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Booking Modal — routes to an enquiry or the waitlist depending on
          whether what's requested (solo seat, or N for a group) actually
          fits in what's left; see BookingForm. */}
      <Modal
        isOpen={bookingOpen}
        onClose={() => setBookingOpen(false)}
        title={isFull ? 'Join Waitlist' : 'Book Your Seat'}
        size="lg"
      >
        <BookingForm
          tripId={trip.id}
          tripTitle={trip.title}
          terms={trip.terms_and_conditions}
          remainingSeats={remaining}
          minAge={trip.min_age}
          maxAge={trip.max_age}
          onSuccess={() => setTimeout(() => setBookingOpen(false), 3000)}
        />
      </Modal>
    </Layout>
  );
}
