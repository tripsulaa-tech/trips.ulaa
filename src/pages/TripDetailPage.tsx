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
  ChevronDown, ChevronUp,
} from 'lucide-react';

export default function TripDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [trip, setTrip] = useState<UpcomingTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('highlights');
  const [calendarMenuOpen, setCalendarMenuOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [countdown, setCountdown] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);
  const [showAllAccommodationPhotos, setShowAllAccommodationPhotos] = useState(false);
  const [faqsOpen, setFaqsOpen] = useState(false);
  const [cancellationOpen, setCancellationOpen] = useState(false);
  const navBarRef = useRef<HTMLElement>(null);
  const navLinkRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const calendarMenuRef = useRef<HTMLDivElement>(null);

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
      <div className="relative h-[60vh] md:h-[70vh] overflow-hidden">
        <img src={trip.cover_image || PLACEHOLDER_IMAGE} alt={trip.title} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-dark/40 via-dark/30 to-dark/90" />
        <div className="absolute inset-0 flex flex-col justify-end px-4 sm:px-6 lg:px-8 pb-12 max-w-[1344px] mx-auto left-0 right-0">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            <Link to="/trips" className="inline-flex items-center gap-2 text-white/70 hover:text-white text-sm mb-4 transition-colors">
              <ArrowLeft size={16} /> All Trips
            </Link>
            <h1 className="font-display text-4xl md:text-6xl font-bold text-white mb-4">{trip.title}</h1>
            <div className="flex flex-wrap items-center gap-4 text-white/80 text-sm mb-5">
              <span className="flex items-center gap-2"><Calendar size={14} /> {formatDateRange(trip.start_date, trip.end_date)}</span>
              <span className="flex items-center gap-2"><Clock size={14} /> {trip.duration}</span>
              <span className="flex items-center gap-2"><Users size={14} />
                {isFull ? 'Sold out' : isAlmostFull ? 'Almost full — hurry!' : `Group of ${trip.total_seats}`}
              </span>
              {(trip.min_age !== undefined || trip.max_age !== undefined) && (
                <span className="flex items-center gap-2"><UserCheck size={14} /> {formatAgeRange(trip.min_age, trip.max_age)}</span>
              )}
			  {isEarlyBird && (
				<span className="flex items-center gap-1.5 bg-secondary text-white text-xs font-button font-semibold px-3 py-1.5 rounded-md">
				Early Bird
				</span>
			  )}
            </div>
            {trip.description && (
              <p className="text-white/85 text-base md:text-lg leading-relaxed max-w-2xl mb-6 line-clamp-3">
                {trip.description}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3 mb-5">
              <Button variant="primary" size="md" onClick={() => setBookingOpen(true)}>
                {isFull ? 'Join Waitlist' : 'Book Your Seat'}
              </Button>
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={pdfLoading}
                className="inline-flex items-center justify-center gap-2 font-button font-semibold tracking-wide px-6 py-3 min-h-[48px] rounded-md text-base bg-white/15 backdrop-blur-md border border-white/30 text-white hover:bg-white/25 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {pdfLoading ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
                {pdfLoading ? 'Preparing…' : 'Download Itinerary'}
              </button>
            </div>
            <div className="flex w-fit items-center gap-2 bg-white/15 backdrop-blur-md border border-white/30 text-white text-sm font-button font-semibold px-4 py-1.5 rounded-md">
              <MapPin size={14} /> {trip.destination}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Countdown Timer */}
      {countdown && (
        <div className="bg-dark py-5 px-4 sm:px-6 lg:px-8">
          <div className="max-w-[1344px] mx-auto flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8">
            <p className="text-white/60 text-xs font-button font-semibold uppercase tracking-[0.15em]">Trip starts in</p>
            <div className="flex items-center gap-3 sm:gap-6">
              {[
                { v: countdown.days, l: 'Days' },
                { v: countdown.hours, l: 'Hours' },
                { v: countdown.minutes, l: 'Minutes' },
                { v: countdown.seconds, l: 'Seconds' },
              ].map(({ v, l }, i) => (
                <div key={l} className="flex items-start gap-3 sm:gap-6">
                  <div className="text-center">
                    <div className="font-display text-3xl sm:text-4xl font-bold text-white tabular-nums w-14 text-center">
                      {String(v).padStart(2, '0')}
                    </div>
                    <div className="text-white/50 text-[10px] uppercase tracking-widest mt-1">{l}</div>
                  </div>
                  {i < 3 && <span className="font-display text-2xl font-bold text-white/30 mt-1">:</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Quick jump nav */}
      <div className="sticky top-20 z-30 bg-white/95 backdrop-blur-md border-b border-background-warm px-4 sm:px-6 lg:px-8">
        <div className="max-w-[1344px] mx-auto flex items-center gap-2">
          <nav ref={navBarRef} className="flex-1 min-w-0 flex gap-1 overflow-x-auto no-scrollbar py-3">
            {(trip.highlight_cards?.length || trip.highlights.length) > 0 && (
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
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y divide-x-0 sm:divide-y-0 sm:divide-x divide-background-warm">
                  {trip.highlight_cards!.map((card: TripHighlightCard, i: number) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.07, duration: 0.5 }}
                      className="flex flex-col items-center text-center gap-3 px-4 py-5"
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
            ) : trip.highlights.length > 0 ? (
              <section id="highlights" className="scroll-mt-44">
                <h2 className="font-display text-3xl font-bold text-dark mb-6">Trip Highlights</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {trip.highlights.map((h, i) => (
                    <div key={i} className="flex items-start gap-3 bg-background-warm rounded-lg px-4 py-3">
                      <CheckCircle size={18} className="text-primary shrink-0 mt-0.5" />
                      <span className="text-dark text-sm">{h}</span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {/* Itinerary */}
            {trip.itinerary.length > 0 && (
              <section id="itinerary" className="scroll-mt-44">
                <h2 className="font-display text-3xl font-bold text-dark mb-10 text-center">
                  {trip.itinerary.length} Day{trip.itinerary.length !== 1 ? 's' : ''} of Unforgettable Moments
                </h2>
                <div
                  className="grid gap-x-4 gap-y-10 justify-center"
                  style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 240px))' }}
                >
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
                          className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full flex items-center justify-center shadow-sm font-button font-bold text-sm"
                          style={meta
                            ? { backgroundColor: palette.bg, color: palette.fg }
                            : { backgroundColor: palette.fg, color: '#fff' }}
                        >
                          {meta ? <meta.Icon size={20} /> : day.day}
                        </div>
                        <div className="w-full min-h-[380px] bg-white border border-background-warm rounded-2xl pt-8 pb-4 px-4 shadow-card hover:shadow-card-hover transition-shadow flex flex-col gap-2 text-center">
                          <h3 className="font-display font-bold text-dark text-base">{day.title}</h3>
                          <p className="text-dark-muted text-xs leading-relaxed flex-1">{day.description}</p>
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
                  const visiblePhotos = showAllAccommodationPhotos ? photos : photos.slice(0, INITIAL_COUNT);
                  const hasMore = photos.length > INITIAL_COUNT;
                  return (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {visiblePhotos.map((photo, i) => (
                          <div key={i} className="aspect-video overflow-hidden rounded-xl">
                            <img src={photo} alt={`Accommodation ${i + 1}`} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
                          </div>
                        ))}
                      </div>
                      {hasMore && !showAllAccommodationPhotos && (
                        <button
                          type="button"
                          onClick={() => setShowAllAccommodationPhotos(true)}
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
            <section id="inclusions" className="scroll-mt-44 grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* What's Included */}
              {((trip.included_items?.length ?? 0) > 0 || trip.included.length > 0) && (
                <div>
                  <h2 className="font-display text-2xl font-bold text-dark mb-4">What's Included</h2>
                  <div className="flex flex-wrap gap-2">
                    {(trip.included_items?.length ?? 0) > 0
                      ? trip.included_items!.map((item: TripInclusionItem, i: number) => (
                          <span key={i} className="flex items-center gap-1.5 bg-background-warm rounded-lg px-4 py-2 text-sm text-dark">
                            {item.icon ? <span>{item.icon}</span> : <CheckCircle size={14} className="text-green-500 shrink-0" />}
                            {item.description}
                          </span>
                        ))
                      : trip.included.map((item, i) => (
                          <span key={i} className="flex items-center gap-1.5 bg-background-warm rounded-lg px-4 py-2 text-sm text-dark">
                            <CheckCircle size={14} className="text-green-500 shrink-0" />
                            {item}
                          </span>
                        ))}
                  </div>
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
            </section>

            {/* Things to carry */}
            {trip.things_to_carry.length > 0 && (
              <section>
                <h2 className="font-display text-2xl font-bold text-dark mb-4 flex items-center gap-2">
                  <Backpack size={24} className="text-primary" /> Things to Carry
                </h2>
                <div className="flex flex-wrap gap-2">
                  {trip.things_to_carry.map((item, i) => (
                    <span key={i} className="bg-background-warm rounded-lg px-4 py-2 text-sm text-dark">
                      {item}
                    </span>
                  ))}
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

            {/* Gallery — "Places You'll Definitely Post" */}
            {((trip.gallery_items?.length ?? 0) > 0 || trip.gallery_images.length > 0) && (
              <section id="gallery" className="scroll-mt-44">
                <h2 className="font-display text-3xl font-bold text-dark mb-6">Places You'll Definitely Post</h2>
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
                <h2 className="font-display text-3xl font-bold text-dark mb-6">Fashion Aesthetics</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {trip.fashion_photos!.map((photo, i) => (
                    <div key={i} className="aspect-[3/4] overflow-hidden rounded-xl">
                      <img src={photo} alt={`Fashion ${i + 1}`} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Travel with Confidence */}
            {(trip.confidence_items?.length ?? 0) > 0 && (
              <section id="confidence" className="scroll-mt-44">
                <h2 className="font-display text-3xl font-bold text-dark mb-6">Travel with Confidence</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {trip.confidence_items!.map((item: TripConfidenceItem, i: number) => (
                    <div key={i} className="flex items-center gap-4 p-2">
                      {item.icon && <TripHighlightIconDisplay icon={item.icon} index={0} size="lg" />}
                      <p className="text-dark text-sm leading-relaxed">{item.description}</p>
                    </div>
                  ))}
                </div>
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
            {(trip.min_age !== undefined || trip.max_age !== undefined) && (
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

            {/* Book Your Seat — moved here (was a right-hand sticky sidebar) so it reads as a final call-to-action before the End Banner. */}
            <section className="bg-white rounded-2xl shadow-warm-lg border border-background-warm p-8 sm:p-10">
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
                  {(trip.min_age !== undefined || trip.max_age !== undefined) && (
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

                <div ref={calendarMenuRef} className="relative">
                  <button
                    onClick={() => setCalendarMenuOpen(o => !o)}
                    className="w-full flex items-center justify-center gap-2 mt-3 text-sm text-dark-muted hover:text-primary transition-colors"
                  >
                    <CalendarPlus size={14} /> Add to calendar
                  </button>

                  {calendarMenuOpen && (
                    <div className="absolute top-full left-0 right-0 mt-2 z-20 rounded-lg border-2 border-background-warm bg-white shadow-warm-lg py-1 overflow-hidden">
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

                <button
                  onClick={() => navigator.share?.({ title: trip.title, url: window.location.href })}
                  className="w-full flex items-center justify-center gap-2 mt-2 text-sm text-dark-muted hover:text-primary transition-colors"
                >
                  <Share2 size={14} /> Share this trip
                </button>

                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={pdfLoading}
                  className="w-full flex items-center justify-center gap-2 mt-2 text-sm text-dark-muted hover:text-primary transition-colors disabled:opacity-50"
                >
                  {pdfLoading ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
                  {pdfLoading ? 'Preparing PDF…' : 'Download itinerary PDF'}
                </button>

                <p className="text-xs text-dark-muted text-center mt-4">
                  No payment required to enquire. We'll contact you within 24 hours.
                </p>
              </div>
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
