import type { RefObject } from 'react';
import PdfDownloadMenu from '../../components/ui/PdfDownloadMenu';
import type { UpcomingTrip } from '../../types/types-index';
import { addToCalendar } from '../../utils/calendar';
import { ShareNetwork as Share2, CalendarPlus } from '@phosphor-icons/react';

interface TripQuickNavProps {
  trip: UpcomingTrip;
  activeSection: string;
  navBarRef: RefObject<HTMLElement | null>;
  // Callback that stores/clears this nav link's DOM node on the owning
  // page's navLinkRefs — passed down instead of the ref object itself so
  // NavTab never mutates a value reachable through its own props (see
  // TripDetailPage's registerNavLink).
  registerNavLink: (id: string, el: HTMLAnchorElement | null) => void;
  hasConfidenceItems: boolean;
  hasDetailsSection: boolean;
}

// Section tab, factored out since every entry shares the same active/inactive
// styling and aria-current wiring — only the id/label/visibility differ.
function NavTab({
  id,
  label,
  activeSection,
  registerNavLink,
}: {
  id: string;
  label: string;
  activeSection: string;
  registerNavLink: (id: string, el: HTMLAnchorElement | null) => void;
}) {
  return (
    <a
      href={`#${id}`}
      ref={el => registerNavLink(id, el)}
      aria-current={activeSection === id ? 'true' : undefined}
      className={`shrink-0 px-4 py-1.5 rounded-md text-sm font-button font-semibold transition-colors whitespace-nowrap ${activeSection === id ? 'bg-primary text-white' : 'text-dark-muted hover:text-primary hover:bg-background-warm'}`}
    >
      {label}
    </a>
  );
}

export default function TripQuickNav({
  trip,
  activeSection,
  navBarRef,
  registerNavLink,
  hasConfidenceItems,
  hasDetailsSection,
}: TripQuickNavProps) {
  return (
    <div className="sticky top-20 z-30 bg-white/95 backdrop-blur-md border-b border-background-warm px-3 sm:px-6 lg:px-8">
      <div className="max-w-[1344px] mx-auto flex items-center gap-1 sm:gap-2">
        <nav ref={navBarRef} aria-label="Jump to section" className="flex-1 min-w-0 flex gap-1 overflow-x-auto no-scrollbar py-2.5 sm:py-3">
          {(trip.highlight_cards?.length ?? 0) > 0 && (
            <NavTab id="highlights" label="Highlights" activeSection={activeSection} registerNavLink={registerNavLink} />
          )}
          {trip.itinerary.length > 0 && (
            <NavTab id="itinerary" label="Itinerary" activeSection={activeSection} registerNavLink={registerNavLink} />
          )}
          {(trip.accommodation_description || (trip.accommodation_photos?.length ?? 0) > 0) && (
            <NavTab id="accommodation" label="Stay" activeSection={activeSection} registerNavLink={registerNavLink} />
          )}
          <NavTab id="inclusions" label="Inclusions" activeSection={activeSection} registerNavLink={registerNavLink} />
          {(trip.gallery_images.length > 0 || (trip.gallery_items?.length ?? 0) > 0) && (
            <NavTab id="gallery" label="Gallery" activeSection={activeSection} registerNavLink={registerNavLink} />
          )}
          {hasConfidenceItems && (
            <NavTab id="confidence" label="Confidence" activeSection={activeSection} registerNavLink={registerNavLink} />
          )}
          {hasDetailsSection && (
            <NavTab id="details" label="Details" activeSection={activeSection} registerNavLink={registerNavLink} />
          )}
          {trip.faqs.length > 0 && (
            <NavTab id="faqs" label="FAQs" activeSection={activeSection} registerNavLink={registerNavLink} />
          )}
          <NavTab id="cancellation" label="Cancellation" activeSection={activeSection} registerNavLink={registerNavLink} />
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
  );
}
