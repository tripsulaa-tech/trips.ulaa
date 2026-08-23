import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import Button from '../components/ui/Button';
import TripCountdownCard from '../components/ui/TripCountdownCard';
import type { PagedCarouselHandle } from '../components/ui/PagedCarousel';
import { useCloseOnOutsideClick } from '../hooks/useCloseOnOutsideClick';
import { getUpcomingTripBySlug, getSiteContent } from '../services/api';
import { subscribeToTable } from '../services/realtime';
import type { UpcomingTrip, ButtonLabelsConfig, BookingFormDraft } from '../types/types-index';
import { publicSeatsLeft, getActivePrice, getStrikeThroughPrice, formatDateRange } from '../utils/utils-index';
import { DEFAULT_BUTTON_LABELS } from '../constants/buttonLabels';

import TripComingSoon from './trip-detail/TripComingSoon';
import TripHero from './trip-detail/TripHero';
import TripQuickNav from './trip-detail/TripQuickNav';
import TripHighlightsSection from './trip-detail/TripHighlightsSection';
import TripItinerarySection from './trip-detail/TripItinerarySection';
import TripAccommodationSection from './trip-detail/TripAccommodationSection';
import TripInclusionsSection from './trip-detail/TripInclusionsSection';
import TripGallerySection from './trip-detail/TripGallerySection';
import TripFashionSection from './trip-detail/TripFashionSection';
import TripConfidenceBookingSection from './trip-detail/TripConfidenceBookingSection';
import TripDetailsSection from './trip-detail/TripDetailsSection';
import TripFaqCancellationSection from './trip-detail/TripFaqCancellationSection';
import TripStickyBookingBar from './trip-detail/TripStickyBookingBar';
import TripEndBanner from './trip-detail/TripEndBanner';
import TripBookingModal from './trip-detail/TripBookingModal';
import { useIsDesktop } from './trip-detail/tripDetailUtils';

export default function TripDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const [trip, setTrip] = useState<UpcomingTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [buttonLabels, setButtonLabels] = useState<ButtonLabelsConfig>(DEFAULT_BUTTON_LABELS);
  const [bookingOpen, setBookingOpen] = useState(false);
  // Whatever the user has typed/picked into the booking form so far, kept
  // here (not inside BookingForm) so it survives the modal being closed
  // and reopened without a submission — see BookingForm's initialDraft /
  // onDraftChange props and isBookingDraftDirty.
  const [bookingDraft, setBookingDraft] = useState<BookingFormDraft | null>(null);
  const [activeSection, setActiveSection] = useState('highlights');
  const [calendarMenuOpen, setCalendarMenuOpen] = useState(false);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- opening the booking modal in response to a "?book=1" deep link, not syncing an external system
    if (trip && searchParams.get('book') === '1') setBookingOpen(true);
  }, [trip, searchParams]);

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

  useCloseOnOutsideClick(calendarMenuOpen, [calendarMenuRef], () => setCalendarMenuOpen(false), { escape: true });

  const openBooking = () => setBookingOpen(true);

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

  if (trip.status === 'coming_soon') {
    return <TripComingSoon trip={trip} />;
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
  const hasDetailsSection = (trip.things_to_carry_items?.length ?? 0) > 0
    || !!trip.meeting_point
    || !!(trip.trip_founder?.name || trip.trip_founder?.photo);

  return (
    <Layout>
      <TripHero
        trip={trip}
        buttonLabels={buttonLabels}
        isFull={isFull}
        isAlmostFull={isAlmostFull}
        isEarlyBird={isEarlyBird}
        descriptionExpanded={descriptionExpanded}
        setDescriptionExpanded={setDescriptionExpanded}
        onBook={openBooking}
      />

      <TripQuickNav
        trip={trip}
        activeSection={activeSection}
        navBarRef={navBarRef}
        navLinkRefs={navLinkRefs}
        hasConfidenceItems={hasConfidenceItems}
        hasDetailsSection={hasDetailsSection}
      />

      {/* Main Content */}
      <div className="relative isolate px-4 sm:px-6 lg:px-8 py-8 sm:py-16 pb-12 lg:pb-16">
        <div className="max-w-[1344px] mx-auto space-y-9 sm:space-y-12">
          {/* Countdown — premium card, shown at all breakpoints. Below
              `lg` this keeps a centered/stacked mobile layout; at `lg`+ it
              spans the full content width (matching every other section
              on the page) and reflows into a horizontal banner so the
              extra width reads as intentional, not just stretched. The
              card owns its own live tick and renders nothing once the
              trip has started. */}
          <TripCountdownCard
            startDate={trip.start_date}
            destination={trip.destination}
            dateRangeLabel={formatDateRange(trip.start_date, trip.end_date)}
            ctaLabel={buttonLabels.primaryCta}
            onCtaClick={openBooking}
            isAlmostFull={isAlmostFull}
            isFull={isFull}
            remainingSeats={remaining}
          />

          {(trip.highlight_cards?.length ?? 0) > 0 && (
            <TripHighlightsSection
              highlightCards={trip.highlight_cards!}
              isDesktop={isDesktop}
              expandedHighlights={expandedHighlights}
              toggleHighlight={toggleHighlight}
              heartLoved={heartLoved}
              onHeartLove={handleHeartLove}
            />
          )}

          {trip.itinerary.length > 0 && (
            <TripItinerarySection
              itinerary={trip.itinerary}
              expandedItineraryDays={expandedItineraryDays}
              toggleItineraryDay={toggleItineraryDay}
            />
          )}

          {(trip.accommodation_description || (trip.accommodation_photos?.length ?? 0) > 0) && (
            <TripAccommodationSection
              description={trip.accommodation_description}
              photos={trip.accommodation_photos}
              carouselRef={accommodationCarouselRef}
            />
          )}

          <TripInclusionsSection
            trip={trip}
            activeIncludedGroups={activeIncludedGroups}
            setActiveIncludedGroups={setActiveIncludedGroups}
            activeIncludedItems={activeIncludedItems}
            setActiveIncludedItems={setActiveIncludedItems}
            toggleInSet={toggleInSet}
          />

          {((trip.gallery_items?.length ?? 0) > 0 || trip.gallery_images.length > 0) && (
            <TripGallerySection trip={trip} />
          )}

          {(trip.fashion_photos?.length ?? 0) > 0 && (
            <TripFashionSection
              photos={trip.fashion_photos!}
              description={trip.fashion_description}
              tripTitle={trip.title}
            />
          )}

          <TripConfidenceBookingSection
            trip={trip}
            buttonLabels={buttonLabels}
            confidenceItems={trip.confidence_items}
            activeConfidenceItems={activeConfidenceItems}
            setActiveConfidenceItems={setActiveConfidenceItems}
            toggleInSet={toggleInSet}
            activePrice={activePrice}
            strikeThroughPrice={strikeThroughPrice}
            isEarlyBird={isEarlyBird}
            deadlinePassed={deadlinePassed}
            remainingAfterAdvance={remainingAfterAdvance}
            isFull={isFull}
            isAlmostFull={isAlmostFull}
            remaining={remaining}
            calendarMenuOpen={calendarMenuOpen}
            setCalendarMenuOpen={setCalendarMenuOpen}
            calendarMenuRef={calendarMenuRef}
            onBook={openBooking}
          />

          <TripDetailsSection trip={trip} />

          <TripFaqCancellationSection
            trip={trip}
            faqsOpen={faqsOpen}
            setFaqsOpen={setFaqsOpen}
            cancellationOpen={cancellationOpen}
            setCancellationOpen={setCancellationOpen}
          />
        </div>
      </div>

      <TripStickyBookingBar
        trip={trip}
        buttonLabels={buttonLabels}
        activePrice={activePrice}
        strikeThroughPrice={strikeThroughPrice}
        isEarlyBird={isEarlyBird}
        isFull={isFull}
        isAlmostFull={isAlmostFull}
        remaining={remaining}
        onBook={openBooking}
      />

      {trip.end_banner && (
        <TripEndBanner endBanner={trip.end_banner} onBook={openBooking} />
      )}

      <TripBookingModal
        trip={trip}
        buttonLabels={buttonLabels}
        isFull={isFull}
        remaining={remaining}
        isOpen={bookingOpen}
        onClose={() => setBookingOpen(false)}
        bookingDraft={bookingDraft}
        onDraftChange={setBookingDraft}
      />
    </Layout>
  );
}
