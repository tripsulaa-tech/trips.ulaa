import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useLocation, Link } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import NotFoundState from '../components/ui/NotFoundState';
import { TripDetailSkeleton } from '../components/ui/Skeletons';
import TripCountdownCard from '../components/ui/TripCountdownCard';
import type { PagedCarouselHandle } from '../components/ui/PagedCarousel';
import { useCloseOnOutsideClick } from '../hooks/useCloseOnOutsideClick';
import { useScrollRestoration } from '../hooks/useScrollRestoration';
import { usePageMeta } from '../hooks/usePageMeta';
import { getUpcomingTripBySlug, getUpcomingTripByIdAdmin, getSiteContent } from '../services/api';
import { subscribeToTable } from '../services/realtime';
import type { UpcomingTrip, ButtonLabelsConfig, BookingFormDraft } from '../types/types-index';
import { publicSeatsLeft, getActivePrice, getStrikeThroughPrice, earlyBirdSeatsLabel, earlyBirdRuleNote, formatPrice } from '../utils/utils-index';
import { DEFAULT_BUTTON_LABELS } from '../constants/buttonLabels';
import { hasPackages } from '../utils/tripOptions';

import TripComingSoon from './trip-detail/TripComingSoon';
import TripHero from './trip-detail/TripHero';
import TripQuickNav from './trip-detail/TripQuickNav';
import TripHighlightsSection from './trip-detail/TripHighlightsSection';
import TripItinerarySection from './trip-detail/TripItinerarySection';
import TripAccommodationSection from './trip-detail/TripAccommodationSection';
import TripInclusionsSection from './trip-detail/TripInclusionsSection';
import TripPackagesSection from './trip-detail/TripPackagesSection';
import { withBasicPricing } from '../utils/tripOptions';
import TripGallerySection from './trip-detail/TripGallerySection';
import TripFashionSection from './trip-detail/TripFashionSection';
import TripConfidenceBookingSection from './trip-detail/TripConfidenceBookingSection';
import TripDetailsSection from './trip-detail/TripDetailsSection';
import TripFaqCancellationSection from './trip-detail/TripFaqCancellationSection';
import TripStickyBookingBar from './trip-detail/TripStickyBookingBar';
import TripEndBanner from './trip-detail/TripEndBanner';
import TripBookingModal from './trip-detail/TripBookingModal';
import TripSpecialOfferPopup from './trip-detail/TripSpecialOfferPopup';
import { useIsDesktop } from './trip-detail/tripDetailUtils';
import { Compass } from '@phosphor-icons/react';

import { pageTitle } from '../constants/site';
export default function TripDetailPage() {
  const { slug, id: previewId } = useParams<{ slug: string; id: string }>();
  // Admin "Preview page" route (/admin/trips/:id/preview): renders the real
  // public page for any trip, drafts included, but read-only — no booking,
  // no live-sync, not indexed.
  const isPreview = !!previewId;
  // Preview only: lets the admin flip between the Coming Soon layout and the
  // full published layout to see how the trip will look either way.
  // null = follow the trip's real status.
  const [previewLayout, setPreviewLayout] = useState<'full' | 'coming_soon' | null>(null);
  const [searchParams] = useSearchParams();
  const location = useLocation();
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
  // Starts expanded when the page is opened via a #cancellation deep link
  // (e.g. the invoice PDF's terms note), so it's already open on first paint.
  const [cancellationOpen, setCancellationOpen] = useState(
    () => typeof window !== 'undefined' && window.location.hash === '#cancellation'
  );
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [expandedHighlights, setExpandedHighlights] = useState<Set<number>>(new Set());
  // Tracks whether the "Why You'll Love This Trip" heart has been tapped —
  // once loved, the heart stays filled pink (with a soft glow) and all
  // reason cards are expanded in one go.
  const [heartLoved, setHeartLoved] = useState(false);
  const isDesktop = useIsDesktop();
  // Keyed by pathname (not just '/trips/:slug') so each trip's own scroll
  // position is remembered separately. `!loading` gates the restore until
  // the real trip content (and therefore the page's real height) has
  // rendered — see useScrollRestoration's `ready` param.
  // A #cancellation deep link wins over any remembered scroll position —
  // otherwise the restore (which re-asserts for 1.5s) would drag the page
  // away from the section we're about to jump to.
  const hasCancellationHash = location.hash === '#cancellation';
  if (hasCancellationHash) sessionStorage.removeItem(`ulaa:restoreScroll:${location.pathname}`);
  useScrollRestoration(location.pathname, !loading && !hasCancellationHash);

  // Deep link support (e.g. from the invoice PDF's terms note →
  // /trips/<slug>#cancellation): the Cancellation Policy block is collapsed
  // by default, so open it, then keep the section pinned at its anchor
  // position (instant jumps, once per frame) for a few seconds while images
  // and fonts above it finish loading and shift the layout. Stops the moment
  // the visitor scrolls, touches, clicks or presses a key themselves.
  const wantsCancellation = !loading && !!trip && location.hash === '#cancellation';
  // Open the collapsed block during render (not in an effect) when the deep link arrives.
  // Only on the moment the deep link starts applying, so closing it by hand stays closed.
  const [prevWantsCancellation, setPrevWantsCancellation] = useState(false);
  if (wantsCancellation !== prevWantsCancellation) {
    setPrevWantsCancellation(wantsCancellation);
    if (wantsCancellation) setCancellationOpen(true);
  }
  useEffect(() => {
    if (!wantsCancellation) return;
    let cancelled = false;
    const root = document.documentElement;
    const pin = () => {
      if (cancelled) return;
      const el = document.getElementById('cancellation');
      if (!el) return;
      const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
      if (Math.abs(el.getBoundingClientRect().top - margin) > 2) {
        const prev = root.style.scrollBehavior;
        root.style.scrollBehavior = 'auto'; // bypass the site's global smooth scrolling
        el.scrollIntoView({ block: 'start' });
        root.style.scrollBehavior = prev;
      }
    };
    pin();
    // setInterval (not requestAnimationFrame) so it keeps working when the
    // link opens in a background tab, where rAF is paused.
    const intervalId = window.setInterval(pin, 50);
    const stopTimer = window.setTimeout(() => { cancelled = true; window.clearInterval(intervalId); }, 5000);
    const stop = () => { cancelled = true; window.clearInterval(intervalId); };
    // Only a deliberate scroll gesture by the visitor hands control back.
    const events = ['wheel', 'touchmove'] as const;
    events.forEach((ev) => window.addEventListener(ev, stop, { passive: true, once: true }));
    const onVisible = () => { if (document.visibilityState === 'visible') pin(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.clearTimeout(stopTimer);
      events.forEach((ev) => window.removeEventListener(ev, stop));
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [wantsCancellation]);

  // Falls back to a generic title/description while the trip is still
  // loading (or if the slug doesn't resolve), then swaps in the trip's own
  // once it arrives — so sharing a trip link renders that trip's title and
  // cover photo instead of the site-wide default.
  usePageMeta({
    title: pageTitle(trip ? trip.title : 'Upcoming Trips'),
    description: trip?.description,
    image: trip?.cover_image,
    path: isPreview ? `/admin/trips/${previewId}/preview` : `/trips/${slug ?? ''}`,
  });
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
  // Stable callback passed down to TripQuickNav/NavTab instead of the raw
  // navLinkRefs object, so the child never mutates a ref reachable through
  // its own props directly (react-hooks/immutability) — the mutation stays
  // local to the component that owns the ref.
  const registerNavLink = useCallback((id: string, el: HTMLAnchorElement | null) => {
    navLinkRefs.current[id] = el;
  }, []);
  const calendarMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const request = isPreview
      ? (previewId ? getUpcomingTripByIdAdmin(previewId) : null)
      : (slug ? getUpcomingTripBySlug(slug) : null);
    if (!request) return;
    request
      .then(data => setTrip(data ?? null))
      .catch(() => setTrip(null))
      .finally(() => setLoading(false));
  }, [slug, previewId, isPreview]);

  // Admin-editable "Pack Your Bags" / "Join Waitlist" button text (see
  // the Home Page admin's "Button Naming" tab). Starts from the defaults
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
  // images, etc.) while someone is already sitting on this trip's page,
  // pull the fresh row so it reflects immediately.
  //
  // Deliberately re-fetches via the REST API rather than merging
  // payload.new straight into state (which is what this used to do): the
  // Realtime WebSocket payload isn't a reliable source for every column on
  // a trip with a lot of image/array data (cover/mobile-hero images,
  // gallery_items, itinerary day photos, accommodation/fashion photos,
  // highlight_cards, etc.) — large rows can hit Supabase Realtime's
  // payload-size limit and get silently dropped or truncated, which showed
  // up as text edits (small payload) going live instantly while image
  // edits (much bigger payload) didn't. A plain re-fetch has no such limit
  // and matches the pattern the trips-listing pages already use (see
  // UpcomingTripsPage.tsx / UpcomingTripsPreview.tsx) — self-correcting on
  // every event instead of trusting the socket payload's contents.
  useEffect(() => {
    if (!trip?.id || (!slug && !isPreview)) return;
    const unsubscribe = subscribeToTable(
      'upcoming_trips',
      (payload) => {
        if (payload.eventType === 'UPDATE') {
          (isPreview ? getUpcomingTripByIdAdmin(trip.id) : getUpcomingTripBySlug(slug!))
            .then(data => { if (data) setTrip(data); })
            .catch(() => {});
        }
      },
      `id=eq.${trip.id}`
    );
    return unsubscribe;
  }, [trip?.id, slug, isPreview]);

  // Deep-link support for "?book=1" (e.g. the downloaded itinerary PDF's
  // "Pack Your Bags" link) — opens the booking modal automatically once
  // the trip has loaded, instead of requiring the visitor to find the CTA.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- opening the booking modal in response to a "?book=1" deep link, not syncing an external system
    if (trip && !isPreview && searchParams.get('book') === '1') setBookingOpen(true);
  }, [trip, searchParams, isPreview]);

  // Highlight the quick-jump tab for whichever section is currently in view.
  useEffect(() => {
    if (!trip) return;
    const ids = ['highlights', 'itinerary', 'accommodation', 'inclusions', 'packages', 'gallery', 'confidence', 'details', 'faqs', 'cancellation'];
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

  // Package card the visitor tapped (null = opened via a plain Book button).
  const [preselectedPackageId, setPreselectedPackageId] = useState<string | null>(null);
  // Preview is look-only: booking buttons do nothing so no real enquiry can be made.
  const openBooking = () => { if (isPreview) return; setPreselectedPackageId(null); setBookingOpen(true); };
  const choosePackage = (packageId: string) => { if (isPreview) return; setPreselectedPackageId(packageId); setBookingOpen(true); };

  if (loading) {
    return (
      <Layout>
        <TripDetailSkeleton />
      </Layout>
    );
  }

  if (!trip) {
    return (
      <Layout>
        <NotFoundState
          icon={<Compass size={28} />}
          title="Trip not found"
          message="This trip may have been removed or the link is out of date. Check out our other upcoming adventures instead."
          actionLabel={isPreview ? 'Back to Trips admin' : 'View All Trips'}
          actionTo={isPreview ? '/admin/trips' : '/trips'}
        />
      </Layout>
    );
  }

  const showComingSoon = isPreview && previewLayout
    ? previewLayout === 'coming_soon'
    : trip.status === 'coming_soon';
  const statusLabel = trip.status === 'draft' ? 'Draft (not visible to the public)' : trip.status === 'coming_soon' ? 'Coming Soon' : 'Published';
  const previewBanner = isPreview ? (
    <div className="fixed top-0 inset-x-0 z-[100] bg-dark text-white text-xs sm:text-sm font-button font-semibold px-4 py-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 shadow-card">
      <span>Admin preview — {statusLabel}. Booking is disabled.</span>
      <span className="inline-flex items-center gap-1" role="group" aria-label="Preview layout">
        <button
          type="button"
          onClick={() => setPreviewLayout('coming_soon')}
          className={`px-2.5 py-1 rounded-md transition-colors ${showComingSoon ? 'bg-white text-dark' : 'bg-white/15 hover:bg-white/25'}`}
        >
          Coming Soon view
        </button>
        <button
          type="button"
          onClick={() => setPreviewLayout('full')}
          className={`px-2.5 py-1 rounded-md transition-colors ${!showComingSoon ? 'bg-white text-dark' : 'bg-white/15 hover:bg-white/25'}`}
        >
          Published view
        </button>
      </span>
      <Link to="/admin/trips" className="underline underline-offset-2 hover:opacity-80 whitespace-nowrap">Back to admin</Link>
    </div>
  ) : null;

  if (showComingSoon) {
    return <>{previewBanner}<TripComingSoon trip={trip} /></>;
  }

  const remaining = publicSeatsLeft(trip.total_seats, trip.seats_booked, trip.waitlist_reserved || 0);
  const isFull = remaining === 0;
  const isAlmostFull = remaining > 0 && remaining <= 5;
  // Headline price = the first package's (Basic) price when the trip has
  // packages; Premium etc. show in "Choose Your Package" and the booking form.
  const pricedTrip = withBasicPricing(trip);
  const { activePrice, isEarlyBird, deadlinePassed, isSpecialOffer } = getActivePrice(pricedTrip.price, pricedTrip.early_bird_price, pricedTrip.early_bird_deadline, pricedTrip.special_offer_price, pricedTrip.special_offer_date, pricedTrip.special_offer_end_date, pricedTrip.early_bird_seats, pricedTrip.early_bird_seats_taken);
  const strikeThroughPrice = getStrikeThroughPrice(activePrice, pricedTrip.price, isEarlyBird, trip.strike_through_price, isSpecialOffer);
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
    || !!(trip.trip_leader?.name || trip.trip_leader?.photo);

  return (
    <Layout>
      {previewBanner}
      <TripHero
        trip={trip}
        buttonLabels={buttonLabels}
        isFull={isFull}
        isAlmostFull={isAlmostFull}
        isEarlyBird={isEarlyBird}
        isSpecialOffer={isSpecialOffer}
        seatsLeft={remaining}
        descriptionExpanded={descriptionExpanded}
        setDescriptionExpanded={setDescriptionExpanded}
        onBook={openBooking}
      />

      <TripQuickNav
        trip={trip}
        activeSection={activeSection}
        navBarRef={navBarRef}
        registerNavLink={registerNavLink}
        hasConfidenceItems={hasConfidenceItems}
        hasDetailsSection={hasDetailsSection}
        hasPackages={hasPackages(trip.trip_options)}
      />

      {/* Main Content */}
      <div className="relative isolate px-4 sm:px-6 lg:px-8 py-8 sm:py-16 pb-12 lg:pb-16">
        <div className="max-w-[1344px] mx-auto space-y-9 sm:space-y-12">
          {/* Countdown — boarding-pass card: sleeps-to-go + route on the
              left, seat map + booking button on the stub. Stacks on mobile.
              Renders nothing once the trip has started. */}
          <TripCountdownCard
            startDate={trip.start_date}
            destination={trip.destination}
            totalSeats={trip.total_seats}
            ctaLabel={isFull ? buttonLabels.waitlistCta : buttonLabels.primaryCta}
            onCtaClick={openBooking}
            isAlmostFull={isAlmostFull}
            isFull={isFull}
            remainingSeats={remaining}
            earlyBird={isEarlyBird && activePrice != null && earlyBirdSeatsLabel(pricedTrip)
              ? {
                  price: formatPrice(activePrice),
                  label: earlyBirdSeatsLabel(pricedTrip) as string,
                  note: earlyBirdRuleNote(pricedTrip, activePrice, trip.advance_amount) ?? undefined,
                }
              : null}
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

          <TripPackagesSection
            trip={trip}
            buttonLabels={buttonLabels}
            onChoose={choosePackage}
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
            trip={pricedTrip}
            buttonLabels={buttonLabels}
            confidenceItems={trip.confidence_items}
            activeConfidenceItems={activeConfidenceItems}
            setActiveConfidenceItems={setActiveConfidenceItems}
            toggleInSet={toggleInSet}
            activePrice={activePrice}
            strikeThroughPrice={strikeThroughPrice}
            isEarlyBird={isEarlyBird}
            isSpecialOffer={isSpecialOffer}
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
        trip={pricedTrip}
        buttonLabels={buttonLabels}
        activePrice={activePrice}
        strikeThroughPrice={strikeThroughPrice}
        isEarlyBird={isEarlyBird}
        isSpecialOffer={isSpecialOffer}
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
        initialPackageId={preselectedPackageId}
      />

      <TripSpecialOfferPopup
        trip={pricedTrip}
        isSpecialOffer={isSpecialOffer}
        activePrice={activePrice}
        strikeThroughPrice={strikeThroughPrice}
        isAlmostFull={isAlmostFull}
        remaining={remaining}
        onBook={openBooking}
      />
    </Layout>
  );
}
