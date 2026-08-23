import type { RefObject } from 'react';
import PdfDownloadMenu from '../../components/ui/PdfDownloadMenu';
import type { UpcomingTrip } from '../../types/types-index';
import { addToCalendar } from '../../utils/calendar';
import { ShareNetwork as Share2, CalendarPlus } from '@phosphor-icons/react';

interface TripQuickNavProps {
  trip: UpcomingTrip;
  activeSection: string;
  navBarRef: RefObject<HTMLElement | null>;
  navLinkRefs: RefObject<Record<string, HTMLAnchorElement | null>>;
  hasConfidenceItems: boolean;
  hasDetailsSection: boolean;
}

// Section tab, factored out since every entry shares the same active/inactive
// styling and aria-current wiring — only the id/label/visibility differ.
function NavTab({
  id,
  label,
  activeSection,
  navLinkRefs,
}: {
  id: string;
  label: string;
  activeSection: string;
  navLinkRefs: RefObject<Record<string, HTMLAnchorElement | null>>;
}) {
  return (
    <a
      href={`#${id}`}
      ref={el => { navLinkRefs.current[id] = el; }}
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
  navLinkRefs,
  hasConfidenceItems,
  hasDetailsSection,
}: TripQuickNavProps) {
  return (
    <div className="sticky top-20 z-30 bg-white/95 backdrop-blur-md border-b border-background-warm px-3 sm:px-6 lg:px-8">
      <div className="max-w-[1344px] mx-auto flex items-center gap-1 sm:gap-2">
        <nav ref={navBarRef} aria-label="Jump to section" className="flex-1 min-w-0 flex gap-1 overflow-x-auto no-scrollbar py-2.5 sm:py-3">
          {(trip.highlight_cards?.length ?? 0) > 0 && (
            <NavTab id="highlights" label="Highlights" activeSection={activeSection} navLinkRefs={navLinkRefs} />
          )}
          {trip.itinerary.length > 0 && (
            <NavTab id="itinerary" label="Itinerary" activeSection={activeSection} navLinkRefs={navLinkRefs} />
          )}
          {(trip.accommodation_description || (trip.accommodation_photos?.length ?? 0) > 0) && (
            <NavTab id="accommodation" label="Stay" activeSection={activeSection} navLinkRefs={navLinkRefs} />
          )}
          <NavTab id="inclusions" label="Inclusions" activeSection={activeSection} navLinkRefs={navLinkRefs} />
          {(trip.gallery_images.length > 0 || (trip.gallery_items?.length ?? 0) > 0) && (
            <NavTab id="gallery" label="Gallery" activeSection={activeSection} navLinkRefs={navLinkRefs} />
          )}
          {hasConfidenceItems && (
            <NavTab id="confidence" label="Confidence" activeSection={activeSection} navLinkRefs={navLinkRefs} />
          )}
          {hasDetailsSection && (
            <NavTab id="details" label="Details" activeSection={activeSection} navLinkRefs={navLinkRefs} />
          )}
          {trip.faqs.length > 0 && (
            <NavTab id="faqs" label="FAQs" activeSection={activeSection} navLinkRefs={navLinkRefs} />
          )}
          <NavTab id="cancellation" label="Cancellation" activeSection={activeSection} navLinkRefs={navLinkRefs} />
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
