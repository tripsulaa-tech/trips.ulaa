import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Layout from '../components/layout/Layout';
import Button from '../components/ui/Button';
import FAQAccordion from '../components/ui/FAQAccordion';
import CancellationPolicyDisplay from '../components/ui/CancellationPolicyDisplay';
import Modal from '../components/ui/Modal';
import BookingForm from '../components/ui/BookingForm';
import ItineraryDayPhotos from '../components/ui/ItineraryDayPhotos';
import PdfDownloadMenu from '../components/ui/PdfDownloadMenu';
import GalleryCarousel from '../components/ui/GalleryCarousel';
import GalleryViewer from '../components/ui/GalleryViewer';
import PagedCarousel, { type PagedCarouselHandle } from '../components/ui/PagedCarousel';
import { useResponsiveItemsPerView } from '../components/ui/useResponsiveItemsPerView';
import TripHighlightIconDisplay from '../components/ui/TripHighlightIconDisplay';
import { getTripHighlightIcon, getTripHighlightPalette, type TripHighlightIconType } from '../constants/tripHighlightIcons';
import { getUpcomingTripBySlug, getSiteContent } from '../services/api';
import { subscribeToTable } from '../services/realtime';
import type { UpcomingTrip, TripHighlightCard, TripInclusionItem, TripConfidenceItem, ButtonLabelsConfig } from '../types/types-index';
import { formatDateRange, formatDate, publicSeatsLeft, PLACEHOLDER_IMAGE, formatPrice, getActivePrice, getStrikeThroughPrice, formatAgeRange, getCoverImageStyle } from '../utils/utils-index';
import { getGoogleCalendarUrl, downloadTripIcs, addToCalendar } from '../utils/calendar';
import { DEFAULT_CANCELLATION_POLICY } from '../constants/cancellationPolicy';
import { DEFAULT_BUTTON_LABELS } from '../constants/buttonLabels';
import {
  MapPin,
  Calendar,
  Clock,
  Users,
  UserCheck,
  CheckCircle,
  XCircle,
  Backpack,
  NavigationArrow as Navigation,
  ArrowLeft,
  ShareNetwork as Share2,
  CalendarPlus,
  Download,
  ArrowSquareOut as ExternalLink,
  Heart,
  ArrowRight,
  Play,
  CaretDown as ChevronDown,
  CaretUp as ChevronUp,
  SealCheck as BadgeCheck,
  ShirtFolded as Shirt,
  Footprints,
  Sunglasses as Glasses,
  Beanie as HatGlasses,
  Headphones,
  BatteryCharging,
  Pill,
  Drop as SprayCan,
  Drop as Droplet,
  Drop as GlassWater,
  Cookie,
  Sparkle as Sparkles,
  FileText,
  IdentificationCard as IdCard,
  Hand,
  ShieldCheck,
  Flame,
  Stamp,
  Airplane as Plane,
  CreditCard,
  Camera,
  Plug as PlugZap,
} from '@phosphor-icons/react';

// Tracks whether the viewport is at/above the `sm` breakpoint (640px) so
// scroll-triggered entrance animations can be skipped on mobile (per design
// request) while remaining on larger screens.
function useIsDesktop(): boolean {
  const getValue = () => (typeof window === 'undefined' ? true : window.innerWidth >= 640);
  const [isDesktop, setIsDesktop] = useState(getValue);

  useEffect(() => {
    const onResize = () => setIsDesktop(getValue());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return isDesktop;
}

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
const THINGS_TO_CARRY_ICON_RULES: [RegExp, TripHighlightIconType][] = [
  [/jacket|sweater|hoodie|fleece|thermal/i, Shirt],
  [/shoe|boot|sandal|footwear|trek/i, Footprints],
  [/sunglass|goggle/i, Glasses],
  [/cap|hat/i, HatGlasses],
  [/glove|mitten/i, Hand],
  [/earphone|headphone|earbud/i, Headphones],
  [/adapter|\bplug\b|converter/i, PlugZap],
  [/power ?bank|charger|battery/i, BatteryCharging],
  [/medicine|medication|pill|first aid/i, Pill],
  [/sunscreen|spf/i, SprayCan],
  [/moistur|lotion|cream/i, Droplet],
  [/water ?bottle|bottle/i, GlassWater],
  [/snack|food/i, Cookie],
  [/wipe|sanitiz|towel/i, Sparkles],
  [/tissue|paper/i, FileText],
  // Photo/photograph checked before the passport/id-proof rule below, since
  // "Passport-size photographs" would otherwise match on "passport".
  [/passport.{0,10}photo|photograph/i, Camera],
  [/\beta\b|visa|travel authoriz|entry permit/i, Stamp],
  [/flight|air ticket|boarding pass|\bticket/i, Plane],
  [/insurance/i, ShieldCheck],
  [/debit card|credit card|currency|rupee|\bcash\b/i, CreditCard],
  [/id proof|passport|aadhar|adhar|govern|voter|licen|document/i, IdCard],
];

function getThingsToCarryIcon(item: string): TripHighlightIconType {
  const rule = THINGS_TO_CARRY_ICON_RULES.find(([pattern]) => pattern.test(item));
  return rule ? rule[1] : Backpack;
}

export default function TripDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const [trip, setTrip] = useState<UpcomingTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [buttonLabels, setButtonLabels] = useState<ButtonLabelsConfig>(DEFAULT_BUTTON_LABELS);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('highlights');
  const [calendarMenuOpen, setCalendarMenuOpen] = useState(false);
  const [countdown, setCountdown] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);
  const accommodationCarouselRef = useRef<PagedCarouselHandle>(null);
  const [faqsOpen, setFaqsOpen] = useState(false);
  const [cancellationOpen, setCancellationOpen] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [expandedHighlights, setExpandedHighlights] = useState<Set<number>>(new Set());
  // Tracks whether the "Why You'll Love This Trip" heart has been tapped —
  // once loved, the heart stays filled pink (with a soft glow) and all
  // reason cards are expanded in one go.
  const [heartLoved, setHeartLoved] = useState(false);
  const isDesktop = useIsDesktop();
  const toggleHighlight = (i: number) => {
    setExpandedHighlights(prev => {
      const next = new Set(prev);
      if (next.has(i)) {
        next.delete(i);
      } else {
        next.add(i);
      }
      return next;
    });
  };
  // Tapping the heart expands every reason card at once, rather than
  // requiring each one to be tapped individually. Tapping it again
  // collapses everything back down.
  const handleHeartLove = (count: number) => {
    setHeartLoved(prevLoved => {
      const nextLoved = !prevLoved;
      setExpandedHighlights(nextLoved ? new Set(Array.from({ length: count }, (_, idx) => idx)) : new Set());
      return nextLoved;
    });
  };
  // Generic helper for the small "tap to fill" icon toggles below (What's
  // Included / Travel with Confidence), which mirror the desktop hover-fill
  // effect but need an explicit tap target on mobile since there's no hover.
  const toggleInSet = (setter: React.Dispatch<React.SetStateAction<Set<number>>>, i: number) => {
    setter(prev => {
      const next = new Set(prev);
      if (next.has(i)) {
        next.delete(i);
      } else {
        next.add(i);
      }
      return next;
    });
  };
  const [activeIncludedGroups, setActiveIncludedGroups] = useState<Set<number>>(new Set());
  const [activeIncludedItems, setActiveIncludedItems] = useState<Set<number>>(new Set());
  const [activeConfidenceItems, setActiveConfidenceItems] = useState<Set<number>>(new Set());
  const [expandedItineraryDays, setExpandedItineraryDays] = useState<Set<number>>(new Set());
  const toggleItineraryDay = (i: number) => {
    setExpandedItineraryDays(prev => {
      const next = new Set(prev);
      if (next.has(i)) {
        next.delete(i);
      } else {
        next.add(i);
      }
      return next;
    });
  };
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

  // Admin-editable "Pack Your Bags" / "Join Waitlist" button text (see
  // /admin/button-labels — AdminButtonLabels.tsx). Starts from the defaults
  // so there's no flash of missing text, then swaps in the saved copy once
  // it loads, and stays live via the same site_content Realtime channel
  // BottomNav.tsx subscribes to for its own admin-edited content.
  useEffect(() => {
    getSiteContent<ButtonLabelsConfig>('button_labels')
      .then(data => {
        if (data && data.primaryCta) setButtonLabels(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToTable(
      'site_content',
      () => {
        getSiteContent<ButtonLabelsConfig>('button_labels')
          .then(data => {
            if (data && data.primaryCta) setButtonLabels(data);
          })
          .catch(() => {});
      },
      'key=eq.button_labels'
    );
    return unsubscribe;
  }, []);

  // Live status — if the admin flips "Coming Soon" (or edits seats, price,
  // etc.) while someone is already sitting on this trip's page, merge the
  // change straight in so it reflects immediately. Note: if the admin fully
  // unpublishes this trip while someone is viewing it, the update won't be
  // pushed here (an anonymous viewer's Realtime feed can't see a row that
  // no longer passes the public "is_published = true" policy) — the page
  // will still show the last-loaded version until they refresh or navigate.
  useEffect(() => {
    if (!trip?.id) return;
    const unsubscribe = subscribeToTable<Partial<UpcomingTrip>>(
      'upcoming_trips',
      (payload) => {
        if (payload.eventType === 'UPDATE' && payload.new) {
          setTrip(t => (t ? { ...t, ...payload.new } : t));
        }
      },
      `id=eq.${trip.id}`
    );
    return unsubscribe;
  }, [trip?.id]);

  // Deep-link support for "?book=1" (e.g. the downloaded itinerary PDF's
  // "Pack Your Bags" link) — opens the booking modal automatically once
  // the trip has loaded, instead of requiring the visitor to find the CTA.
  useEffect(() => {
    if (trip && searchParams.get('book') === '1') setBookingOpen(true);
  }, [trip, searchParams]);

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
    const ids = ['highlights', 'itinerary', 'accommodation', 'inclusions', 'gallery', 'confidence', 'details', 'faqs', 'cancellation'];
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

  // Coming Soon trips (Admin → Upcoming Trips → Add/Edit Trip → Publish
  // tab) intentionally show only the hero banner (cover image + title) on
  // the public detail page — everything else (itinerary, pricing, FAQs,
  // booking, etc.) is hidden while the rest of the trip's content is
  // still being filled in. This renders instead of, not alongside, the
  // full page below.
  if (trip.status === 'coming_soon') {
    return (
      <Layout>
        <div className="relative mt-[81px] aspect-[9/16] sm:aspect-[21/9] overflow-hidden bg-dark">
          <img
            src={trip.hero_mobile_image || trip.cover_image || PLACEHOLDER_IMAGE}
            alt={trip.title}
            className={
              trip.hero_mobile_image
                ? 'absolute inset-0 w-full h-full object-cover sm:hidden'
                : 'absolute inset-x-0 top-0 w-full aspect-[9/8] object-cover sm:hidden'
            }
            style={trip.hero_mobile_image ? undefined : getCoverImageStyle(trip.cover_image_crop)}
          />
          <img
            src={trip.cover_image || PLACEHOLDER_IMAGE}
            alt={trip.title}
            className="hidden sm:block absolute inset-0 w-full h-full object-cover"
            style={getCoverImageStyle(trip.cover_image_crop)}
          />
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0%,transparent_45%,var(--color-dark)_85%)] sm:bg-[linear-gradient(to_right,var(--color-dark)_0%,var(--color-dark)_32%,transparent_55%)] sm:opacity-90" />
          <div className="relative sm:absolute sm:inset-0 w-full h-full">
            <div className="relative w-full h-full flex flex-col justify-end pl-4 sm:pl-6 lg:pl-8 pr-4 sm:pr-6 lg:pr-8 pt-32 sm:pt-28 pb-8 sm:pb-12 max-w-[1344px] mx-auto">
              <motion.div className="flex flex-col" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
                <Link
                  to="/trips"
                  onClick={() => sessionStorage.setItem('ulaa:restoreScroll:/trips', '1')}
                  className="inline-flex items-center gap-2 text-white/70 hover:text-white text-sm mb-3 sm:mb-4 transition-colors w-fit"
                >
                  <ArrowLeft size={16} /> All Trips
                </Link>
                <span className="inline-flex w-fit items-center gap-1.5 bg-amber-500 text-white text-xs font-button font-semibold px-3 py-1.5 rounded-md mb-3 sm:mb-4">
                  Coming Soon
                </span>
                <h1 className="font-display text-3xl sm:text-4xl md:text-6xl font-bold text-white mb-3 sm:mb-4 leading-tight">
                  {trip.title}
                </h1>
              </motion.div>
            </div>
          </div>
        </div>
        <div className="max-w-[1344px] mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 text-center">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-dark mb-3">Something exciting is on the way!</h2>
          <p className="text-dark-muted text-sm sm:text-base max-w-lg mx-auto mb-8">
            We're putting the finishing touches on this adventure. The full itinerary, pricing, and
            booking details will be available soon. While you wait, check out our other upcoming
            trips or explore our completed trips to see the unforgettable experiences our community
            has already shared.
          </p>
          <div className="flex flex-row flex-wrap items-center justify-center gap-3 sm:gap-4">
            <Link to="/trips">
              <Button
                variant="primary"
                size="sm"
                className="group/btn whitespace-nowrap sm:px-8 sm:py-4 sm:text-lg sm:rounded-lg"
              >
                View All Trips
                <ArrowRight size={16} className="transition-transform group-hover/btn:translate-x-1 sm:w-[18px] sm:h-[18px]" />
              </Button>
            </Link>
            <Link to="/completed-trips">
              <Button
                variant="outline"
                size="sm"
                className="whitespace-nowrap sm:px-8 sm:py-4 sm:text-lg sm:rounded-lg"
              >
                <Play size={14} className="fill-current sm:w-4 sm:h-4" />
                View Gallery
              </Button>
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  const remaining = publicSeatsLeft(trip.total_seats, trip.seats_booked, trip.waitlist_reserved || 0);
  const isFull = remaining === 0;
  const isAlmostFull = remaining > 0 && remaining <= 5;
  const { activePrice, isEarlyBird, deadlinePassed } = getActivePrice(trip.price, trip.early_bird_price, trip.early_bird_deadline);
  const strikeThroughPrice = getStrikeThroughPrice(activePrice, trip.price, isEarlyBird, trip.strike_through_price);
  // Amount still payable before the trip once the advance/reservation
  // amount is paid — powers the "Reserve today with only ₹X" panel below,
  // which replaces the old plain "Seats available" badge when the admin
  // has set advance_amount for this trip (see add_trip_advance_amount.sql).
  const remainingAfterAdvance = activePrice != null && trip.advance_amount != null
    ? Math.max(0, activePrice - trip.advance_amount)
    : null;
  const hasConfidenceItems = (trip.confidence_items?.length ?? 0) > 0;

  return (
    <Layout>
      {/* Hero */}
      {/*
        Mobile (<sm) banner box stays a fixed aspect-[9/16] to match the
        Hero Banner Image (Mobile) upload's recommended 9:16 portrait shape
        (Admin → Add/Edit Trip → Media) — the image fills the box edge to
        edge via object-cover, same as the desktop hero does at sm+.

        When no hero_mobile_image is uploaded, the mobile element falls back
        to the landscape cover_image instead. Stretching a landscape photo
        across a tall 9:16 box with plain object-cover would over-crop it,
        so that fallback case keeps the old behaviour: sized to aspect-[9/8]
        (the ratio the Cover Image Editor's crop is actually framed at) and
        anchored to the top, with bg-dark filling the remainder below,
        blending into the existing gradient overlay.
      */}
      <div className="relative mt-[81px] aspect-[9/16] sm:aspect-[21/9] overflow-hidden bg-dark">
        {/*
          Two <img> elements, one shown at a time via sm:hidden / hidden sm:block,
          rather than a single element swapping `src` — the mobile hero uses an
          optional, separately-uploaded hero_mobile_image (Admin → Add/Edit
          Trip → Media) with no crop applied, while the sm+ hero always uses
          cover_image with the saved cover_image_crop (position + zoom, set
          in the same place).
        */}
        <img
          src={trip.hero_mobile_image || trip.cover_image || PLACEHOLDER_IMAGE}
          alt={trip.title}
          className={
            trip.hero_mobile_image
              ? 'absolute inset-0 w-full h-full object-cover sm:hidden'
              : 'absolute inset-x-0 top-0 w-full aspect-[9/8] object-cover sm:hidden'
          }
          style={trip.hero_mobile_image ? undefined : getCoverImageStyle(trip.cover_image_crop)}
        />
        <img
          src={trip.cover_image || PLACEHOLDER_IMAGE}
          alt={trip.title}
          className="hidden sm:block absolute inset-0 w-full h-full object-cover"
          style={getCoverImageStyle(trip.cover_image_crop)}
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0%,transparent_55%,var(--color-dark)_78%)] sm:bg-[linear-gradient(to_right,var(--color-dark)_0%,var(--color-dark)_32%,transparent_55%)] sm:opacity-90" />
        <div className="relative sm:absolute sm:inset-0 w-full h-full">
          <div className="relative w-full h-full flex flex-col justify-end pl-4 sm:pl-6 lg:pl-8 pr-4 sm:pr-6 lg:pr-8 pt-32 sm:pt-28 pb-8 sm:pb-12 max-w-[1344px] mx-auto">
          <motion.div className="flex flex-col" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            <Link
              to="/trips"
              onClick={() => sessionStorage.setItem('ulaa:restoreScroll:/trips', '1')}
              className="order-1 inline-flex items-center gap-2 text-white/70 hover:text-white text-sm mb-3 sm:mb-4 transition-colors"
            >
              <ArrowLeft size={16} /> All Trips
            </Link>
            <h1 className="order-3 sm:order-2 font-display text-3xl sm:text-4xl md:text-6xl font-bold text-white mb-3 sm:mb-4 leading-tight">
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
            <div className="order-4 sm:order-3 flex w-fit items-center gap-2 text-secondary text-sm font-button font-semibold mb-3">
              <MapPin size={14} /> {trip.destination}
            </div>
            {trip.description && (
              <div className="hidden sm:block order-5 sm:order-4 max-w-xl mb-4 sm:mb-6">
                <p className={`text-white/80 text-sm sm:text-base md:text-lg leading-relaxed ${descriptionExpanded ? '' : 'line-clamp-2 sm:line-clamp-4'}`}>
                  {trip.description}
                </p>
                {trip.description.length > 100 && (
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
            <div className="order-6 sm:order-5 relative flex flex-row flex-wrap items-center gap-2.5 sm:gap-3 mb-5">
              <Button
                variant="primary"
                size="sm"
                onClick={() => setBookingOpen(true)}
                className="group/btn flex-1 sm:flex-none whitespace-nowrap sm:w-auto !px-3 !py-2 !text-sm !min-h-[44px] sm:!px-8 sm:!py-4 sm:!text-lg sm:!min-h-[56px] sm:rounded-lg"
              >
                {isFull ? buttonLabels.waitlistCta : buttonLabels.primaryCta}
                {!isFull && <ArrowRight size={16} className="transition-transform group-hover/btn:translate-x-1 sm:w-[18px] sm:h-[18px]" />}
              </Button>
              {!trip.hide_pdf_download && (
                <PdfDownloadMenu trip={trip} variant="hero" />
              )}
            </div>
            <div className="order-7 sm:order-6 mt-1 sm:mt-0 flex flex-wrap items-center gap-x-3 gap-y-2 sm:gap-4 text-white/70 text-xs sm:text-sm mb-4 sm:mb-0">
              <span className="flex items-center gap-2"><Calendar size={14} /> {formatDateRange(trip.start_date, trip.end_date)}</span>
              <span className="flex items-center gap-2"><Clock size={14} /> {trip.duration}</span>
              <span className="flex items-center gap-2"><Users size={14} />
                {isFull ? 'Sold out' : isAlmostFull ? 'Almost full — hurry!' : `${trip.total_seats} Travellers`}
              </span>
              {(trip.min_age != null || trip.max_age != null) && (
                <span className="flex items-center gap-2"><UserCheck size={14} /> {formatAgeRange(trip.min_age, trip.max_age)}</span>
              )}
			  {isEarlyBird && (
				<span className="hidden sm:flex items-center gap-1.5 bg-secondary text-white text-xs font-button font-semibold px-3 py-1.5 rounded-md">
				Early Bird
				</span>
			  )}
            </div>
          </motion.div>
          </div>
        </div>
      </div>

      {/* Quick jump nav */}
      <div className="sticky top-20 z-30 bg-white/95 backdrop-blur-md border-b border-background-warm px-3 sm:px-6 lg:px-8">
        <div className="max-w-[1344px] mx-auto flex items-center gap-1 sm:gap-2">
          <nav ref={navBarRef} aria-label="Jump to section" className="flex-1 min-w-0 flex gap-1 overflow-x-auto no-scrollbar py-2.5 sm:py-3">
            {(trip.highlight_cards?.length ?? 0) > 0 && (
              <a
                href="#highlights"
                ref={el => { navLinkRefs.current['highlights'] = el; }}
                aria-current={activeSection === 'highlights' ? 'true' : undefined}
                className={`shrink-0 px-4 py-1.5 rounded-md text-sm font-button font-semibold transition-colors whitespace-nowrap ${activeSection === 'highlights' ? 'bg-primary text-white' : 'text-dark-muted hover:text-primary hover:bg-background-warm'}`}
              >
                Highlights
              </a>
            )}
            {trip.itinerary.length > 0 && (
              <a
                href="#itinerary"
                ref={el => { navLinkRefs.current['itinerary'] = el; }}
                aria-current={activeSection === 'itinerary' ? 'true' : undefined}
                className={`shrink-0 px-4 py-1.5 rounded-md text-sm font-button font-semibold transition-colors whitespace-nowrap ${activeSection === 'itinerary' ? 'bg-primary text-white' : 'text-dark-muted hover:text-primary hover:bg-background-warm'}`}
              >
                Itinerary
              </a>
            )}
            {(trip.accommodation_description || (trip.accommodation_photos?.length ?? 0) > 0) && (
              <a
                href="#accommodation"
                ref={el => { navLinkRefs.current['accommodation'] = el; }}
                aria-current={activeSection === 'accommodation' ? 'true' : undefined}
                className={`shrink-0 px-4 py-1.5 rounded-md text-sm font-button font-semibold transition-colors whitespace-nowrap ${activeSection === 'accommodation' ? 'bg-primary text-white' : 'text-dark-muted hover:text-primary hover:bg-background-warm'}`}
              >
                Stay
              </a>
            )}
            <a
              href="#inclusions"
              ref={el => { navLinkRefs.current['inclusions'] = el; }}
              aria-current={activeSection === 'inclusions' ? 'true' : undefined}
              className={`shrink-0 px-4 py-1.5 rounded-md text-sm font-button font-semibold transition-colors whitespace-nowrap ${activeSection === 'inclusions' ? 'bg-primary text-white' : 'text-dark-muted hover:text-primary hover:bg-background-warm'}`}
            >
              Inclusions
            </a>
            {(trip.gallery_images.length > 0 || (trip.gallery_items?.length ?? 0) > 0) && (
              <a
                href="#gallery"
                ref={el => { navLinkRefs.current['gallery'] = el; }}
                aria-current={activeSection === 'gallery' ? 'true' : undefined}
                className={`shrink-0 px-4 py-1.5 rounded-md text-sm font-button font-semibold transition-colors whitespace-nowrap ${activeSection === 'gallery' ? 'bg-primary text-white' : 'text-dark-muted hover:text-primary hover:bg-background-warm'}`}
              >
                Gallery
              </a>
            )}
            {(trip.confidence_items?.length ?? 0) > 0 && (
              <a
                href="#confidence"
                ref={el => { navLinkRefs.current['confidence'] = el; }}
                aria-current={activeSection === 'confidence' ? 'true' : undefined}
                className={`shrink-0 px-4 py-1.5 rounded-md text-sm font-button font-semibold transition-colors whitespace-nowrap ${activeSection === 'confidence' ? 'bg-primary text-white' : 'text-dark-muted hover:text-primary hover:bg-background-warm'}`}
              >
                Confidence
              </a>
            )}
            {((trip.things_to_carry_items?.length ?? 0) > 0 || !!trip.meeting_point || !!(trip.trip_founder?.name || trip.trip_founder?.photo)) && (
              <a
                href="#details"
                ref={el => { navLinkRefs.current['details'] = el; }}
                aria-current={activeSection === 'details' ? 'true' : undefined}
                className={`shrink-0 px-4 py-1.5 rounded-md text-sm font-button font-semibold transition-colors whitespace-nowrap ${activeSection === 'details' ? 'bg-primary text-white' : 'text-dark-muted hover:text-primary hover:bg-background-warm'}`}
              >
                Details
              </a>
            )}
            {trip.faqs.length > 0 && (
              <a
                href="#faqs"
                ref={el => { navLinkRefs.current['faqs'] = el; }}
                aria-current={activeSection === 'faqs' ? 'true' : undefined}
                className={`shrink-0 px-4 py-1.5 rounded-md text-sm font-button font-semibold transition-colors whitespace-nowrap ${activeSection === 'faqs' ? 'bg-primary text-white' : 'text-dark-muted hover:text-primary hover:bg-background-warm'}`}
              >
                FAQs
              </a>
            )}
            <a
              href="#cancellation"
              ref={el => { navLinkRefs.current['cancellation'] = el; }}
              aria-current={activeSection === 'cancellation' ? 'true' : undefined}
              className={`shrink-0 px-4 py-1.5 rounded-md text-sm font-button font-semibold transition-colors whitespace-nowrap ${activeSection === 'cancellation' ? 'bg-primary text-white' : 'text-dark-muted hover:text-primary hover:bg-background-warm'}`}
            >
              Cancellation
            </a>
          </nav>

          {/* Pinned actions — stay visible through the whole page scroll. */}
          <div className="shrink-0 flex items-center gap-0.5 sm:gap-1 pl-1 border-l border-background-warm">
            <button
              type="button"
              onClick={() => navigator.share?.({ title: trip.title, url: window.location.href })}
              aria-label="Share this trip"
              title="Share this trip"
              className="h-8 w-8 sm:h-9 sm:w-9 flex items-center justify-center rounded-full text-dark-muted hover:text-primary hover:bg-background-warm transition-colors"
            >
              <Share2 size={15} className="sm:hidden" />
              <Share2 size={16} className="hidden sm:block" />
            </button>
            <button
              type="button"
              onClick={() => addToCalendar(trip)}
              aria-label="Add to calendar"
              title="Add to calendar"
              className="hidden sm:flex h-9 w-9 items-center justify-center rounded-full text-dark-muted hover:text-primary hover:bg-background-warm transition-colors"
            >
              <CalendarPlus size={16} />
            </button>
            {!trip.hide_pdf_download && (
              <PdfDownloadMenu trip={trip} variant="icon" />
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative isolate px-4 sm:px-6 lg:px-8 py-8 sm:py-16 pb-12 lg:pb-16">
        <div className="max-w-[1344px] mx-auto space-y-9 sm:space-y-12">
            {/* Countdown — premium flip-clock card, shown at all breakpoints.
                Below `lg` this keeps its original centered/stacked mobile
                layout untouched; at `lg`+ it spans the full content width
                (matching every other section on the page) and reflows into
                a horizontal banner so the extra width reads as intentional,
                not just stretched. */}
            {countdown && (
              <div>
                <div className="relative rounded-[28px] p-px bg-gradient-to-br from-primary-light/50 via-white/10 to-primary/40 shadow-[0_28px_60px_-20px_rgba(15,9,5,0.55)]">
                  <motion.button
                    type="button"
                    onClick={() => setBookingOpen(true)}
                    aria-label={`Trip starts soon — tap to ${buttonLabels.primaryCta}`}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.985 }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                    className="countdown-grain group/btn relative overflow-hidden block w-full text-left bg-gradient-to-br from-[#1B120B] via-[#2C1D12] to-[#170F09] countdown-gradient rounded-[27px] px-6 py-7 sm:px-10 sm:py-10 lg:px-14 lg:py-11"
                  >
                    {/* Soft radial spotlight + ambient glows for depth */}
                    <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-80 lg:w-[36rem] rounded-full bg-primary-light/20 blur-[90px]" />
                    <div className="pointer-events-none absolute -bottom-16 -left-10 w-40 h-40 rounded-full bg-primary/15 blur-3xl" />
                    <div className="pointer-events-none absolute -bottom-16 -right-10 w-40 h-40 rounded-full bg-primary/15 blur-3xl hidden lg:block" />
                    {/* Diagonal shimmer sweep — has more room to read as a
                        deliberate effect now the card spans full width */}
                    <div className="pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent countdown-shimmer hidden lg:block" />
                    {/* Floating sparkles */}
                    <Sparkles size={14} className="countdown-float pointer-events-none absolute top-5 right-9 text-primary-light/40" style={{ animationDelay: '0.4s' }} />
                    <Sparkles size={10} className="countdown-float pointer-events-none absolute bottom-7 left-7 text-primary-light/30" style={{ animationDelay: '1.6s' }} />

                    {(isAlmostFull || isFull) && (
                      <span className="absolute top-4 right-4 sm:top-5 sm:right-5 z-10 inline-flex items-center gap-1.5 bg-gradient-to-r from-amber-400/15 to-amber-300/10 backdrop-blur-sm border border-amber-300/25 text-amber-200 text-[10px] font-button font-bold uppercase tracking-wide px-2.5 py-1 rounded-full">
                        <Flame size={11} className="text-amber-300" />
                        {isFull ? 'Sold out' : `${remaining} seats left`}
                      </span>
                    )}

                    <div className="relative flex flex-col items-center gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
                      <div className="flex flex-col items-center lg:items-start gap-1.5 lg:w-56 lg:shrink-0">
                        <p className="flex items-center gap-2 text-[11px] lg:text-xs font-button font-bold uppercase tracking-[0.25em] whitespace-nowrap bg-gradient-to-r from-primary-light to-amber-200 bg-clip-text text-transparent">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-light opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-light" />
                          </span>
                          Trip starts in
                        </p>
                        <p className="hidden lg:block text-white/35 text-xs font-medium">
                          {trip.destination} &middot; {formatDateRange(trip.start_date, trip.end_date)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 sm:gap-3 lg:gap-4">
                        {[
                          { v: countdown.days, l: 'Days' },
                          { v: countdown.hours, l: 'Hrs' },
                          { v: countdown.minutes, l: 'Min' },
                          { v: countdown.seconds, l: 'Sec' },
                        ].map(({ v, l }, i) => (
                          <div key={l} className="flex items-center gap-2 sm:gap-3 lg:gap-4">
                            <div className="text-center">
                              <div
                                className={`relative w-16 h-16 sm:w-[4.5rem] sm:h-[4.5rem] lg:w-24 lg:h-24 overflow-hidden rounded-2xl bg-white/[0.06] backdrop-blur-md border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_10px_28px_-10px_rgba(0,0,0,0.65)] ${l === 'Sec' ? 'countdown-tick' : ''}`}
                              >
                                <div className="absolute inset-0 bg-gradient-to-b from-white/[0.08] to-transparent" />
                                <div className="absolute left-0 right-0 top-1/2 h-px bg-white/[0.06] -translate-y-px z-10" />
                                <AnimatePresence mode="popLayout" initial={false}>
                                  <motion.div
                                    key={v}
                                    initial={{ rotateX: 90, opacity: 0 }}
                                    animate={{ rotateX: 0, opacity: 1 }}
                                    exit={{ rotateX: -90, opacity: 0 }}
                                    transition={{ duration: 0.7, ease: 'easeInOut' }}
                                    style={{ transformOrigin: 'center', backfaceVisibility: 'hidden', perspective: '400px' }}
                                    className="absolute inset-0 flex items-center justify-center font-display text-3xl sm:text-4xl lg:text-5xl font-bold bg-gradient-to-b from-white to-primary-light/90 bg-clip-text text-transparent tabular-nums"
                                  >
                                    {String(v).padStart(2, '0')}
                                  </motion.div>
                                </AnimatePresence>
                              </div>
                              <div className="text-white/45 text-[10px] lg:text-xs font-medium uppercase tracking-[0.2em] text-center mt-2">{l}</div>
                            </div>
                            {i < 3 && (
                              <span className="text-primary-light/40 font-display text-xl sm:text-2xl lg:text-3xl font-bold pb-4 sm:pb-5 lg:pb-6 select-none">:</span>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-col items-center lg:items-end gap-2 lg:w-56 lg:shrink-0">
                        <span className="hidden lg:inline-flex items-center gap-2 bg-gradient-to-r from-primary-light/20 to-amber-300/10 border border-primary-light/30 text-primary-light font-button font-bold text-sm px-5 py-2.5 rounded-full transition-colors group-hover/btn:from-primary-light/30 group-hover/btn:to-amber-300/20">
                          {buttonLabels.primaryCta}
                          <ArrowRight size={14} className="transition-transform group-hover/btn:translate-x-1" />
                        </span>
                        <p className="flex items-center gap-1.5 text-white/55 text-[11px] font-medium lg:hidden">
                          Don't miss out — tap to {buttonLabels.primaryCta}
                          <ArrowRight size={12} className="text-primary-light transition-transform group-hover/btn:translate-x-1" />
                        </p>
                        <p className="hidden lg:block text-white/35 text-xs">
                          Don't miss out — tap to {buttonLabels.primaryCta}
                        </p>
                      </div>
                    </div>
                  </motion.button>
                </div>
              </div>
            )}
            {/* Highlights */}
            {(trip.highlight_cards?.length ?? 0) > 0 ? (
              <section id="highlights" className="scroll-mt-44">
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-dark mb-5 sm:mb-8 flex items-center justify-center gap-2 text-center">
                  Why You'll Love This Trip
                  <button
                    type="button"
                    onClick={() => handleHeartLove(trip.highlight_cards!.length)}
                    aria-pressed={heartLoved}
                    aria-label={heartLoved ? "Tap to collapse all reasons" : "Tap to fall in love with this trip"}
                    className="relative inline-flex items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  >
                    {/* Minimal cue that the heart is tappable, before it's been loved */}
                    {!heartLoved && (
                      <span className="absolute inset-0 -m-1 rounded-full border border-primary/30 animate-ping" />
                    )}
                    <motion.span
                      className="inline-flex"
                      animate={heartLoved ? { scale: [1, 1.2, 1] } : {}}
                      transition={heartLoved ? { duration: 0.4, ease: 'easeOut' } : {}}
                    >
                      <Heart
                        size={20}
                        className={`-rotate-6 transition-colors duration-300 ${heartLoved ? 'text-pink-500 heart-glow' : 'text-primary/70'}`}
                        fill={heartLoved ? '#ec4899' : 'currentColor'}
                        fillOpacity={heartLoved ? 1 : 0.15}
                      />
                    </motion.span>
                  </button>
                </h2>
                <p className="sm:hidden text-center text-dark-muted text-sm -mt-3 mb-4">
                  Tap the heart to reveal all reasons
                </p>
                <div className="flex flex-wrap justify-center divide-y divide-x-0 sm:divide-y-0 sm:divide-x divide-background-warm">
                  {trip.highlight_cards!.map((card: TripHighlightCard, i: number) => {
                    const isOpen = expandedHighlights.has(i);
                    return (
                      <motion.div
                        key={i}
                        initial={isDesktop ? { opacity: 0, y: 20 } : false}
                        whileInView={isDesktop ? { opacity: 1, y: 0 } : undefined}
                        viewport={{ once: true }}
                        transition={isDesktop ? { delay: i * 0.07, duration: 0.5 } : undefined}
                        className="group flex flex-col items-center text-center gap-2 sm:gap-3 px-3 sm:px-4 py-4 sm:py-5 w-1/2 sm:w-1/3 lg:w-1/6"
                      >
                        <button
                          type="button"
                          onClick={() => toggleHighlight(i)}
                          aria-expanded={isOpen}
                          aria-label={`${card.heading} — tap for details`}
                          className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:pointer-events-none"
                        >
                          <TripHighlightIconDisplay icon={card.icon} index={i} filled={isOpen} hoverFill />
                        </button>
                        <div className="w-full">
                          <h3 className="font-display font-bold text-dark text-base mb-1">{card.heading}</h3>
                          {isOpen && (
                            <p className="sm:hidden overflow-hidden text-dark-muted text-sm leading-relaxed">
                              {card.description}
                            </p>
                          )}
                          <p className="hidden sm:block text-dark-muted text-sm leading-relaxed">{card.description}</p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {/* Itinerary */}
            {trip.itinerary.length > 0 && (
              <section id="itinerary" className="scroll-mt-44 mb-10 sm:mb-[60px]">
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-dark mb-6 sm:mb-10 text-center px-2">
                  {trip.itinerary.length} Day{trip.itinerary.length !== 1 ? 's' : ''} of Unforgettable Moments
                </h2>
                <p className="text-center text-dark-muted text-sm -mt-4 mb-6">
                  Tap a day's icon to see the details
                </p>
                <div className={`grid gap-x-6 gap-y-9 sm:gap-y-12 pt-6 ${getItineraryGridClass(trip.itinerary.length)}`}>
                  {trip.itinerary.map((day, i) => {
                    const meta = getTripHighlightIcon(day.icon);
                    const palette = getTripHighlightPalette(i);
                    const isDayOpen = expandedItineraryDays.has(i);
                    const hasDetails = Boolean(day.description) || (day.bullets?.length ?? 0) > 0;
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
                        <button
                          type="button"
                          onClick={() => hasDetails && toggleItineraryDay(i)}
                          aria-expanded={isDayOpen}
                          aria-label={`${day.title} — tap for details`}
                          className={`absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full flex items-center justify-center shadow-md ring-4 ring-white font-button font-bold text-sm text-white focus:outline-none focus-visible:ring-primary/50 ${hasDetails ? 'cursor-pointer' : 'cursor-default'} ${hasDetails && !isDayOpen ? 'itinerary-icon-glow' : ''}`}
                          style={{ backgroundColor: palette.fg }}
                        >
                          {meta ? <meta.Icon size={20} color="#fff" strokeWidth={2.25} /> : day.day}
                        </button>
                        <div className="w-full bg-white border border-background-warm rounded-2xl pt-8 pb-4 px-4 shadow-card hover:shadow-card-hover transition-shadow flex flex-col gap-2 text-center">
                          <h3 className="font-display font-bold text-dark text-base">{day.title}</h3>
                          <AnimatePresence initial={false}>
                            {isDayOpen && hasDetails && (
                              <motion.div
                                key="day-details"
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.3 }}
                                className="overflow-hidden"
                              >
                                <p className="text-dark-muted text-sm leading-relaxed">{day.description}</p>
                                {(day.bullets?.length ?? 0) > 0 && (
                                  <ul className="text-left space-y-1 mt-2">
                                    {day.bullets!.map((bullet, bi) => (
                                      <li key={bi} className="flex items-start gap-2 text-dark-muted text-sm leading-relaxed">
                                        <span className="mt-1.5 w-1 h-1 rounded-full bg-primary shrink-0" />
                                        <span>{bullet}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
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
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-dark mb-2">Stay. Relax. Repeat.</h2>
                {trip.accommodation_description && (
                  <p className="text-dark-muted leading-relaxed text-sm sm:text-base mb-4 sm:mb-6">{trip.accommodation_description}</p>
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
                          <div key={gi} className="group relative bg-background-warm rounded-lg p-6">
                            {/* Full-card tap target on mobile so the fill animation triggers
                                from anywhere on the card; on desktop it's inert (pointer-events-none)
                                so the existing hover-fill on the card keeps working as before. */}
                            <button
                              type="button"
                              onClick={() => toggleInSet(setActiveIncludedGroups, gi)}
                              aria-expanded={activeIncludedGroups.has(gi)}
                              aria-label={`${group.heading} — tap for details`}
                              className="absolute inset-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:pointer-events-none"
                            />
                            <div className="flex items-center gap-2 mb-2">
                              {group.icon && (
                                <TripHighlightIconDisplay icon={group.icon} index={gi} size="md" filled={activeIncludedGroups.has(gi)} hoverFill />
                              )}
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
                          <div key={i} className="group relative flex flex-col items-center text-center gap-2 bg-background-warm rounded-xl px-4 py-5">
                            <button
                              type="button"
                              onClick={() => toggleInSet(setActiveIncludedItems, i)}
                              aria-expanded={activeIncludedItems.has(i)}
                              aria-label={`${item.description} — tap for details`}
                              className="absolute inset-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:pointer-events-none"
                            />
                            {item.icon ? (
                              <TripHighlightIconDisplay icon={item.icon} index={i} size="sm" filled={activeIncludedItems.has(i)} hoverFill />
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
                  <h2 className="font-display text-2xl sm:text-3xl font-bold text-dark mb-2">Places You'll Definitely Post</h2>
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
                          <motion.img
                            layoutId={`fashion-gallery-${i}`}
                            src={photo}
                            alt={`Fashion ${i + 1}`}
                            className="w-full h-auto block group-hover:scale-105 transition-transform duration-500"
                          />
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
                <GalleryViewer
                  images={trip.fashion_photos!}
                  initialIndex={fashionLightboxIndex}
                  isOpen={fashionLightboxOpen}
                  onClose={() => setFashionLightboxOpen(false)}
                  openLayoutId={`fashion-gallery-${fashionLightboxIndex}`}
                  fallbackLocation={trip.title}
                />
              </section>
            )}

            {/* Pack Your Bags — sits directly below Fashion Aesthetics / Gallery, matching the quick-jump nav order.
                Travel with Confidence sits to its left as its own separate card. */}
            <div className={`grid grid-cols-1 gap-5 sm:gap-6 ${hasConfidenceItems ? 'lg:grid-cols-[1fr_640px] lg:divide-x lg:divide-background-warm' : ''}`}>
            {hasConfidenceItems && (
              <section id="confidence" className="scroll-mt-44 flex flex-col justify-center lg:pr-10">
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-dark mb-3">Travel with Confidence</h2>
                {trip.confidence_description && (
                  <p className="text-dark-muted text-base leading-relaxed mb-4 sm:mb-6">{trip.confidence_description}</p>
                )}
                <div className="grid grid-cols-1 gap-0.5 w-fit">
                  {trip.confidence_items!.map((item: TripConfidenceItem, i: number) => (
                    <div key={i} className="group relative flex items-center justify-start gap-3 p-1">
                      <button
                        type="button"
                        onClick={() => toggleInSet(setActiveConfidenceItems, i)}
                        aria-expanded={activeConfidenceItems.has(i)}
                        aria-label={`${item.description} — tap for details`}
                        className="absolute inset-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:pointer-events-none"
                      />
                      {item.icon && (
                        <TripHighlightIconDisplay icon={item.icon} index={i} size="sm" filled={activeConfidenceItems.has(i)} hoverFill />
                      )}
                      <p className="text-dark text-base leading-relaxed">{item.description}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className={`bg-white rounded-2xl shadow-warm-lg border border-background-warm p-5 py-6 sm:p-8 sm:py-10 sm:pl-10 sm:pr-14 ${hasConfidenceItems ? 'lg:ml-10' : 'max-w-2xl mx-auto w-full'}`}>
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
                  ) : trip.advance_amount != null ? (
                    <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 justify-center">
                      <span className="shrink-0 w-9 h-9 rounded-full bg-green-600 flex items-center justify-center">
                        <ShieldCheck size={18} className="text-white" strokeWidth={2.5} />
                      </span>
                      <div className="text-left">
                        <p className="text-dark font-semibold text-sm sm:text-base">
                          Reserve today with only <span className="text-green-600 font-bold">{formatPrice(trip.advance_amount)}</span>
                        </p>
                        {remainingAfterAdvance != null && (
                          <p className="text-dark-muted text-xs sm:text-sm mt-0.5">
                            Remaining <span className="font-bold">{formatPrice(remainingAfterAdvance)}</span> payable before the trip.
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <span className="inline-block bg-green-50 text-green-700 text-sm font-button font-semibold px-4 py-2 rounded-md">
                      Seats available
                    </span>
                  )}
                </div>

                <div className="space-y-3 mb-6 max-w-xs mx-auto">
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-2 text-dark-muted"><Calendar size={14} className="text-primary shrink-0" /> Dates</span>
                    <span className="text-dark font-medium">{formatDateRange(trip.start_date, trip.end_date)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-2 text-dark-muted"><Clock size={14} className="text-primary shrink-0" /> Duration</span>
                    <span className="text-dark font-medium">{trip.duration}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-2 text-dark-muted"><Users size={14} className="text-primary shrink-0" /> Group Size</span>
                    <span className="text-dark font-medium">Max {trip.total_seats}</span>
                  </div>
                  {(trip.min_age != null || trip.max_age != null) && (
                    <div className="flex justify-between text-sm">
                      <span className="flex items-center gap-2 text-dark-muted"><UserCheck size={14} className="text-primary shrink-0" /> Age Range</span>
                      <span className="text-dark font-medium">{formatAgeRange(trip.min_age, trip.max_age)}</span>
                    </div>
                  )}
                </div>

                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  onClick={() => setBookingOpen(true)}
                  className="group/btn"
                >
                  {isFull ? (
                    buttonLabels.waitlistCta
                  ) : trip.advance_amount != null ? (
                    <span className="flex flex-col items-center leading-tight">
                      <span className="flex items-center gap-1.5">
                        {buttonLabels.primaryCta}
                        <ArrowRight size={16} className="transition-transform group-hover/btn:translate-x-1" />
                      </span>
                      <span className="text-xs font-medium opacity-90 mt-0.5">
                        At only {formatPrice(trip.advance_amount)} today
                      </span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      {buttonLabels.primaryCta}
                      <ArrowRight size={16} className="transition-transform group-hover/btn:translate-x-1" />
                    </span>
                  )}
                </Button>

                <div className="flex items-center justify-center flex-wrap gap-x-3 gap-y-2 mt-3">
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

                  {!trip.hide_pdf_download && (
                    <>
                      <span className="text-background-warm">|</span>

                      <PdfDownloadMenu trip={trip} variant="text" />
                    </>
                  )}
                </div>

                <div className="flex items-start justify-center gap-1.5 text-xs text-dark-muted mt-4">
                  <BadgeCheck size={14} className="text-green-600 shrink-0 mt-0.5" />
                  <span className="text-left max-w-[15.5rem]">
                    No payment required to enquire. We'll contact you within 24 hours.
                  </span>
                </div>
              </div>
            </section>
            </div>

            {/* Details — Things to Carry, Meeting Point, Trip Leader, grouped
                under one quick-jump anchor since none is substantial enough
                to warrant its own nav tab. */}
            {((trip.things_to_carry_items?.length ?? 0) > 0 || trip.meeting_point || (trip.trip_founder && (trip.trip_founder.name || trip.trip_founder.photo))) && (
              <div id="details" className="scroll-mt-44 space-y-9 sm:space-y-12">

            {/* Things to Carry — kept directly above Meeting Point */}
            {((trip.things_to_carry_items?.length ?? 0) > 0) && (
              <section className="scroll-mt-44">
                <h2 className="font-display text-xl sm:text-2xl font-bold text-dark mb-2">Things to Carry</h2>
                <p className="text-dark-muted text-sm mb-3 sm:mb-4">Pack smart. Travel light. Stay ready.</p>
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
              <section className="bg-background-warm rounded-lg p-5 sm:p-6">
                <h2 className="font-display text-xl sm:text-2xl font-bold text-dark mb-3 flex items-center gap-2">
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

            {/* Eligibility — only shown when the admin has set an age
                restriction on this trip (Admin → Trips → Basic Info). */}
            {(trip.min_age != null || trip.max_age != null) && (
              <section className="bg-background-warm rounded-lg p-5 sm:p-6">
                <h2 className="font-display text-xl sm:text-2xl font-bold text-dark mb-2 flex items-center gap-2">
                  <UserCheck size={22} className="text-primary" /> Eligibility
                </h2>
                <p className="text-dark-muted">
                  This trip is open to travelers aged {formatAgeRange(trip.min_age, trip.max_age)}.
                </p>
              </section>
            )}

            {/* Founder */}
            {trip.trip_founder && (trip.trip_founder.name || trip.trip_founder.photo) && (
              <section className="scroll-mt-44 bg-dark rounded-2xl p-5 sm:p-8">
                <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mb-4 sm:mb-6 text-center">Meet Your Trip Leader</h2>
                <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-center sm:items-start">
                  {trip.trip_founder.photo ? (
                    <img
                      src={trip.trip_founder.photo}
                      alt={trip.trip_founder.name}
                      className="w-40 h-40 sm:w-44 sm:h-44 rounded-full object-cover border-4 border-primary/30 flex-shrink-0"
                    />
                  ) : (
                    <div className="w-40 h-40 sm:w-44 sm:h-44 rounded-full bg-white/10 border-4 border-primary/30 flex items-center justify-center flex-shrink-0">
                      <span className="text-white/40 text-6xl font-display font-bold">{trip.trip_founder.name.charAt(0)}</span>
                    </div>
                  )}
                  <div className="text-center sm:text-left flex-1">
                    {trip.trip_founder.name && (
                      <h3 className="font-display text-xl font-bold text-white mb-0.5">{trip.trip_founder.name}</h3>
                    )}
                    {trip.trip_founder.designation && (
                      <p className="text-primary text-sm font-semibold mb-2">{trip.trip_founder.designation}</p>
                    )}
                    {trip.trip_founder.description && (
                      <p className="text-white/70 text-sm leading-relaxed whitespace-pre-line">{trip.trip_founder.description}</p>
                    )}
                  </div>
                </div>
              </section>
            )}

              </div>
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
                  <h2 className="font-display text-2xl sm:text-3xl font-bold text-dark">FAQs</h2>
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
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-dark">Cancellation Policy</h2>
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
            {activePrice != null ? (
              trip.advance_amount != null ? (
                <>
                  {/* Row 1: advance amount is now the hero figure */}
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-display text-lg font-bold text-primary shrink-0">{formatPrice(trip.advance_amount)}</span>
                    <span className="text-dark-muted text-[11px] shrink-0">to reserve</span>
                  </div>

                  {/* Row 2: total price + strike-through + Save, now secondary */}
                  <div className="flex items-center gap-1.5 mt-0.5 overflow-x-auto no-scrollbar">
                    {strikeThroughPrice != null && (
                      <span className="text-dark-muted line-through text-[10px] shrink-0">{formatPrice(strikeThroughPrice)}</span>
                    )}
                    <span className="text-dark text-[10px] font-semibold shrink-0">{formatPrice(activePrice)} total</span>
                    {strikeThroughPrice != null && (
                      <span className="bg-green-50 border border-green-200 text-green-700 text-[9px] font-button font-medium px-1.5 py-0.5 rounded-md shrink-0 whitespace-nowrap">
                        Save {formatPrice(strikeThroughPrice - activePrice)}
                      </span>
                    )}
                  </div>

                  {/* Row 3: Early Bird + Ends date, kept but compact */}
                  {isEarlyBird && (
                    <div className="flex items-center gap-1.5 mt-0.5 overflow-x-auto no-scrollbar">
                      <span className="bg-secondary text-white text-[9px] font-button font-semibold px-1.5 py-0.5 rounded-md shrink-0 whitespace-nowrap">
                        Early Bird
                      </span>
                      {trip.early_bird_deadline && (
                        <span className="flex items-center gap-0.5 text-orange-600 text-[9px] font-medium shrink-0 whitespace-nowrap">
                          <Clock size={9} className="shrink-0" />
                          Ends {formatDate(trip.early_bird_deadline, { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* No advance_amount configured for this trip: unchanged original layout */}
                  <div className="flex items-center gap-1.5">
                    <span className="font-display text-base font-bold text-dark shrink-0">{formatPrice(activePrice)}</span>
                    {strikeThroughPrice != null && (
                      <>
                        <span className="text-dark-muted line-through text-xs shrink-0">{formatPrice(strikeThroughPrice)}</span>
                        <span className="bg-green-50 border border-green-200 text-green-700 text-[10px] font-button font-medium px-1.5 py-0.5 rounded-md shrink-0 whitespace-nowrap">
                          Save {formatPrice(strikeThroughPrice - activePrice)}
                        </span>
                      </>
                    )}
                  </div>
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
                </>
              )
            ) : (
              <span className="text-sm text-dark-muted">Enquire for pricing</span>
            )}
          </div>

          {/* Right: CTA with seats-left inside */}
          <Button
            variant="primary"
            size="sm"
            onClick={() => setBookingOpen(true)}
            className="!rounded-lg !px-4 !py-2 shrink-0 flex flex-col items-center !gap-0 leading-tight"
          >
            <span className="text-sm font-bold whitespace-nowrap">
              {isFull ? buttonLabels.waitlistCta : buttonLabels.primaryCta}
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
          <div className={`relative ${trip.end_banner.image ? 'bg-dark/70' : 'bg-dark'} pt-12 sm:pt-20 pb-10 px-4 sm:px-6 lg:px-8`}>
            <div className="max-w-[1344px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
              <div className="mt-8 sm:mt-12">
                {trip.end_banner.heading && (
                  <h2 className="font-display text-2xl sm:text-4xl md:text-5xl font-bold text-white leading-tight mb-4">
                    {trip.end_banner.heading}
                  </h2>
                )}
                {trip.end_banner.description && (
                  <p className="text-white/70 text-sm sm:text-lg leading-relaxed mb-6">{trip.end_banner.description}</p>
                )}
                {trip.end_banner.cta_label && (
                  <div className="flex flex-row flex-wrap items-center gap-3">
                    {trip.end_banner.cta_url ? (
                      <a
                        href={trip.end_banner.cta_url}
                        className="group/btn inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white font-button font-semibold px-3 py-2 text-sm min-h-[44px] sm:px-8 sm:py-4 sm:text-lg rounded-lg transition-colors"
                      >
                        {trip.end_banner.cta_label} <ExternalLink size={15} />
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setBookingOpen(true)}
                        className="group/btn inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white font-button font-semibold px-3 py-2 text-sm min-h-[44px] sm:px-8 sm:py-4 sm:text-lg rounded-lg transition-colors"
                      >
                        {trip.end_banner.cta_label}
                        <ArrowRight size={16} className="transition-transform group-hover/btn:translate-x-1" />
                      </button>
                    )}
                    <a
                      href="#highlights"
                      className="inline-flex items-center justify-center gap-2 bg-transparent text-white border-2 border-white/40 hover:border-white hover:bg-white/10 font-button font-semibold px-3 py-2 text-sm min-h-[44px] sm:px-8 sm:py-4 sm:text-lg rounded-lg transition-colors"
                    >
                      Explore Trip
                    </a>
                  </div>
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
        title={isFull ? buttonLabels.waitlistCta : buttonLabels.primaryCta}
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
