import { motion } from 'framer-motion';
import {
  Plus,
  PencilSimple as Edit2,
  Trash as Trash2,
  Eye,
  EyeSlash as EyeOff,
  Download,
  Upload,
  ClipboardText as ClipboardList,
  Hourglass,
  FileArrowDown as FileDown,
  FileX,
  Megaphone,
  CaretUp as ChevronUp,
  CaretDown as ChevronDown,
} from '@phosphor-icons/react';
import Button from '../../components/ui/Button';
import AddFab from '../../components/ui/AddFab';
import type { UpcomingTrip } from '../../types/types-index';
import { formatDate } from '../../utils/utils-index';

interface AdminTripsTableProps {
  trips: UpcomingTrip[];
  loading: boolean;
  pdfDownloadingId: string | null;
  importInputRef: React.RefObject<HTMLInputElement | null>;
  onImportInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onExportTemplate: () => void;
  onAddTrip: () => void;
  onView: (trip: UpcomingTrip) => void;
  onEdit: (trip: UpcomingTrip) => void;
  onDelete: (trip: UpcomingTrip) => void;
  onTogglePublish: (trip: UpcomingTrip) => void;
  onToggleComingSoon: (trip: UpcomingTrip) => void;
  onToggleHidePdf: (trip: UpcomingTrip) => void;
  onToggleSpecialOfferPromo: (trip: UpcomingTrip) => void;
  onMoveTrip: (index: number, dir: -1 | 1) => void;
  onDownloadPdf: (trip: UpcomingTrip) => void;
}

/** The Trips admin page's toolbar (Add Trip, status counts, Import/Export
 *  Template) plus the trips table itself with its per-row quick actions.
 *  Split out of the original single-file AdminTrips.tsx — see that
 *  component's own comment for the rest of the split. */
export default function AdminTripsTable({
  trips, loading, pdfDownloadingId,
  importInputRef, onImportInputChange, onExportTemplate,
  onAddTrip, onView, onEdit, onDelete,
  onTogglePublish, onToggleComingSoon, onToggleHidePdf, onToggleSpecialOfferPromo, onMoveTrip, onDownloadPdf,
}: AdminTripsTableProps) {
  const publishedCount = trips.filter(t => t.status === 'published').length;
  const comingSoonCount = trips.filter(t => t.status === 'coming_soon').length;
  const draftCount = trips.filter(t => t.status === 'draft').length;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="hidden sm:flex justify-end">
          <Button variant="primary" size="sm" onClick={onAddTrip}>
            <Plus size={16} aria-hidden="true" /> Add Trip
          </Button>
        </div>
        <AddFab onClick={onAddTrip} label="Add trip" />

        {/* Status breakdown + template import/export, grouped into one
            card instead of a bare sentence and two unlabeled icon
            buttons sitting directly on the page background — that read
            as leftover debug UI rather than an intentional toolbar.
            Each status gets its own color-coded pill (scannable at a
            glance, and wraps cleanly on narrow screens instead of one
            long sentence breaking mid-phrase); Import/Export get visible
            text labels instead of relying on a hover-only title. */}
        <div className="bg-white rounded-lg shadow-card px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <ClipboardList size={18} className="text-primary shrink-0" aria-hidden="true" />
            <span className="inline-flex items-center gap-1.5 text-xs font-button font-semibold pl-1.5 pr-2.5 py-1 rounded-full bg-green-50 text-green-700">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" aria-hidden="true" />
              {publishedCount} Published
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-button font-semibold pl-1.5 pr-2.5 py-1 rounded-full bg-amber-50 text-amber-700">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" aria-hidden="true" />
              {comingSoonCount} Coming Soon
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-button font-semibold pl-1.5 pr-2.5 py-1 rounded-full bg-background-warm text-dark-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-dark-muted shrink-0" aria-hidden="true" />
              {draftCount} Draft
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={onImportInputChange}
            />
            <button
              onClick={() => importInputRef.current?.click()}
              title="Import Template"
              className="inline-flex items-center gap-1.5 text-xs font-button font-semibold px-2.5 py-1.5 rounded-md border-2 border-primary/30 text-primary hover:bg-primary/5 transition-colors"
            >
              <Upload size={14} aria-hidden="true" /> Import
            </button>
            <button
              onClick={onExportTemplate}
              title="Export Template"
              className="inline-flex items-center gap-1.5 text-xs font-button font-semibold px-2.5 py-1.5 rounded-md border-2 border-primary/30 text-primary hover:bg-primary/5 transition-colors"
            >
              <Download size={14} aria-hidden="true" /> Export
            </button>
          </div>
        </div>
        {trips.length > 1 && (
          <p className="text-xs text-dark-muted flex items-center gap-1.5 px-1">
            <ChevronUp size={12} className="shrink-0" aria-hidden="true" />
            Use the ↑/↓ arrows next to each trip to set the order cards appear in on the homepage and the full Trips page.
          </p>
        )}
      </div>

      {loading ? (
        <div className="text-center py-16 text-dark-muted">Loading...</div>
      ) : trips.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg shadow-card">
          <p className="font-display text-xl text-dark-muted mb-4">No trips yet.</p>
          <Button variant="primary" size="md" className="max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]" onClick={onAddTrip}><Plus size={16} aria-hidden="true" /> Add Your First Trip</Button>
        </div>
      ) : (
        <>
          {/* Mobile (below sm): a card per trip — the desktop table's hidden
              md/lg columns (destination, date, seats) plus a 112px-wide
              Actions column squeezing 6 icon buttons meant a phone was left
              with a cramped, hard-to-tap row, so this gives every field and
              action room to breathe instead. Same pattern as AdminAlbums /
              AdminTripLeaders. */}
          <div className="sm:hidden space-y-3">
            {trips.map((trip, index) => {
              const seatsLeft = Math.max(0, trip.total_seats - trip.seats_booked);
              return (
                <motion.div
                  key={trip.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-white rounded-lg shadow-card p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex flex-col shrink-0">
                        <button onClick={() => onMoveTrip(index, -1)} disabled={index === 0} aria-label={`Move ${trip.title} up`} className="p-0.5 rounded hover:bg-background disabled:opacity-30 text-dark-muted"><ChevronUp size={14} aria-hidden="true" /></button>
                        <button onClick={() => onMoveTrip(index, 1)} disabled={index === trips.length - 1} aria-label={`Move ${trip.title} down`} className="p-0.5 rounded hover:bg-background disabled:opacity-30 text-dark-muted"><ChevronDown size={14} aria-hidden="true" /></button>
                      </div>
                      {trip.cover_image ? (
                        <img src={trip.cover_image} alt={trip.title} className="w-12 h-12 rounded-md object-cover flex-shrink-0" loading="lazy" decoding="async" />
                      ) : (
                        <div className="w-12 h-12 rounded-md bg-background-warm flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <button
                          onClick={() => onView(trip)}
                          className="text-sm font-medium text-dark truncate text-left hover:text-primary hover:underline underline-offset-2 block"
                          aria-label={`View details for ${trip.title}`}
                        >
                          {trip.title}
                        </button>
                        <p className="text-xs text-dark-muted truncate">{trip.destination}</p>
                      </div>
                    </div>
                    <span className={`shrink-0 text-2xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap ${
                      trip.status === 'published' ? 'bg-green-100 text-green-700'
                      : trip.status === 'coming_soon' ? 'bg-amber-100 text-amber-700'
                      : 'bg-background-warm text-dark-muted'
                    }`}>
                      {trip.status === 'published' ? 'Published' : trip.status === 'coming_soon' ? 'Coming Soon' : 'Draft'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-dark-muted whitespace-nowrap">
                      {formatDate(trip.start_date, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    <span className="text-xs text-dark-muted whitespace-nowrap">
                      {trip.seats_booked}/{trip.total_seats} seats ({seatsLeft} left)
                    </span>
                  </div>

                  <div className="flex items-center justify-end gap-0.5 pt-1 border-t border-background-warm">
                    <button onClick={() => onToggleComingSoon(trip)} aria-label={trip.status === 'coming_soon' ? `Switch ${trip.title} to fully Published` : `Mark ${trip.title} as Coming Soon`} className={`flex-shrink-0 p-2 rounded hover:bg-background transition-colors ${trip.status === 'coming_soon' ? 'text-amber-600' : 'text-dark-muted hover:text-primary'}`}>
                      <Hourglass size={16} aria-hidden="true" />
                    </button>
                    <button onClick={() => onTogglePublish(trip)} aria-label={trip.status === 'draft' ? `Publish ${trip.title}` : `Unpublish ${trip.title}`} className="flex-shrink-0 p-2 rounded hover:bg-background text-dark-muted hover:text-primary transition-colors">
                      {trip.status === 'draft' ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />}
                    </button>
                    <button
                      onClick={() => onDownloadPdf(trip)}
                      disabled={pdfDownloadingId === trip.id}
                      aria-label={`Download itinerary PDF for ${trip.title}`}
                      className="flex-shrink-0 p-2 rounded hover:bg-background text-dark-muted hover:text-primary transition-colors disabled:opacity-50"
                    >
                      <FileDown size={16} className={pdfDownloadingId === trip.id ? 'animate-pulse' : ''} aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => onToggleHidePdf(trip)}
                      aria-label={trip.hide_pdf_download ? `Show PDF download for ${trip.title}` : `Hide PDF download for ${trip.title}`}
                      className={`flex-shrink-0 p-2 rounded hover:bg-background transition-colors ${trip.hide_pdf_download ? 'text-red-600' : 'text-dark-muted hover:text-primary'}`}
                    >
                      <FileX size={16} aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => onToggleSpecialOfferPromo(trip)}
                      aria-label={trip.hide_special_offer_promo ? `Show special-offer popup & badge for ${trip.title}` : `Stop special-offer popup & badge for ${trip.title}`}
                      className={`flex-shrink-0 p-2 rounded hover:bg-background transition-colors ${trip.hide_special_offer_promo ? 'text-red-600' : 'text-dark-muted hover:text-primary'}`}
                    >
                      <Megaphone size={16} aria-hidden="true" />
                    </button>
                    <button onClick={() => onEdit(trip)} aria-label={`Edit ${trip.title}`} className="flex-shrink-0 p-2 rounded hover:bg-background text-dark-muted hover:text-primary transition-colors">
                      <Edit2 size={16} aria-hidden="true" />
                    </button>
                    <button onClick={() => onDelete(trip)} aria-label={`Delete ${trip.title}`} className="flex-shrink-0 p-2 rounded hover:bg-primary/5 text-dark-muted hover:text-primary transition-colors">
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Desktop (sm and up): the full table. */}
          <div className="hidden sm:block bg-white rounded-lg shadow-card overflow-hidden">
          <div className="overflow-x-auto scrollbar-hide">
            <table className="w-full text-sm">
              <caption className="sr-only">Trips</caption>
              <thead className="bg-background-warm text-dark font-medium">
                <tr>
                  <th className="px-2 py-4 text-center w-8"><span className="sr-only">Reorder</span></th>
                  <th className="px-4 py-4 text-left">Trip</th>
                  <th className="px-4 py-4 text-left hidden md:table-cell">Destination</th>
                  <th className="px-4 py-4 text-left hidden lg:table-cell">Date</th>
                  <th className="px-4 py-4 text-left hidden md:table-cell">Seats</th>
                  <th className="px-2 py-4 text-center whitespace-nowrap">Status</th>
                  <th className="px-3 py-4 text-right whitespace-nowrap w-[112px] sm:w-auto">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-background-warm">
                {trips.map((trip, index) => (
                  <motion.tr key={trip.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-background/50">
                    <td className="px-2 py-4">
                      <div className="flex flex-col items-center">
                        <button onClick={() => onMoveTrip(index, -1)} disabled={index === 0} aria-label={`Move ${trip.title} up`} title="Move up (homepage order)" className="p-0.5 rounded hover:bg-background disabled:opacity-30 text-dark-muted"><ChevronUp size={13} aria-hidden="true" /></button>
                        <button onClick={() => onMoveTrip(index, 1)} disabled={index === trips.length - 1} aria-label={`Move ${trip.title} down`} title="Move down (homepage order)" className="p-0.5 rounded hover:bg-background disabled:opacity-30 text-dark-muted"><ChevronDown size={13} aria-hidden="true" /></button>
                      </div>
                    </td>
                    <td className="px-4 py-4 font-medium text-dark truncate max-w-[150px] sm:max-w-none">
                      <button
                        onClick={() => onView(trip)}
                        className="text-left hover:text-primary hover:underline underline-offset-2 truncate"
                        title="View details"
                      >
                        {trip.title}
                      </button>
                    </td>
                    <td className="px-4 py-4 text-dark-muted hidden md:table-cell truncate">{trip.destination}</td>
                    <td className="px-4 py-4 text-dark-muted hidden lg:table-cell whitespace-nowrap">{formatDate(trip.start_date, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td className="px-4 py-4 text-dark-muted hidden md:table-cell whitespace-nowrap">
                      {trip.seats_booked}/{trip.total_seats}
                      <span className="text-xs text-dark-muted/70 ml-1">
                        ({Math.max(0, trip.total_seats - trip.seats_booked)} left)
                      </span>
                    </td>
                    <td className="px-2 py-4 text-center">
                      <span className={`inline-block text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap ${
                        trip.status === 'published' ? 'bg-green-100 text-green-700'
                        : trip.status === 'coming_soon' ? 'bg-amber-100 text-amber-700'
                        : 'bg-background-warm text-dark-muted'
                      }`}>
                        {trip.status === 'published' ? 'Published' : trip.status === 'coming_soon' ? 'Coming Soon' : 'Draft'}
                      </span>
                    </td>
                    <td className="pl-2 pr-2 sm:pl-4 sm:pr-3 py-4 whitespace-nowrap">
                      <div className="flex items-center justify-end gap-0.5 sm:gap-1.5">
                        <button onClick={() => onToggleComingSoon(trip)} aria-label={trip.status === 'coming_soon' ? `Switch ${trip.title} to fully Published` : `Mark ${trip.title} as Coming Soon`} className={`flex-shrink-0 p-2 sm:p-1.5 rounded hover:bg-background active:bg-background transition-colors ${trip.status === 'coming_soon' ? 'text-amber-600' : 'text-dark-muted hover:text-primary'}`} title={trip.status === 'coming_soon' ? 'Switch to fully Published (show full trip)' : 'Mark as Coming Soon (show only cover + title)'}>
                          <Hourglass size={15} aria-hidden="true" />
                        </button>
                        <button onClick={() => onTogglePublish(trip)} aria-label={trip.status === 'draft' ? `Publish ${trip.title}` : `Unpublish ${trip.title}`} className="flex-shrink-0 p-2 sm:p-1.5 rounded hover:bg-background active:bg-background text-dark-muted hover:text-primary transition-colors" title={trip.status === 'draft' ? 'Publish' : 'Unpublish (move to Draft)'}>
                          {trip.status === 'draft' ? <Eye size={15} aria-hidden="true" /> : <EyeOff size={15} aria-hidden="true" />}
                        </button>
                        <button
                          onClick={() => onDownloadPdf(trip)}
                          disabled={pdfDownloadingId === trip.id}
                          aria-label={`Download itinerary PDF for ${trip.title}`}
                          className="flex-shrink-0 p-2 sm:p-1.5 rounded hover:bg-background active:bg-background text-dark-muted hover:text-primary transition-colors disabled:opacity-50"
                          title="Download itinerary PDF"
                        >
                          <FileDown size={15} className={pdfDownloadingId === trip.id ? 'animate-pulse' : ''} aria-hidden="true" />
                        </button>
                        <button
                          onClick={() => onToggleHidePdf(trip)}
                          aria-label={trip.hide_pdf_download ? `Show PDF download for ${trip.title}` : `Hide PDF download for ${trip.title}`}
                          className={`flex-shrink-0 p-2 sm:p-1.5 rounded hover:bg-background active:bg-background transition-colors ${trip.hide_pdf_download ? 'text-red-600' : 'text-dark-muted hover:text-primary'}`}
                          title={trip.hide_pdf_download ? 'PDF download hidden from users on the trip page — click to show it again' : 'Hide the PDF download option from users on the trip page'}
                        >
                          <FileX size={15} aria-hidden="true" />
                        </button>
                        <button
                          onClick={() => onToggleSpecialOfferPromo(trip)}
                          aria-label={trip.hide_special_offer_promo ? `Show special-offer popup & badge for ${trip.title}` : `Stop special-offer popup & badge for ${trip.title}`}
                          className={`flex-shrink-0 p-2 sm:p-1.5 rounded hover:bg-background active:bg-background transition-colors ${trip.hide_special_offer_promo ? 'text-red-600' : 'text-dark-muted hover:text-primary'}`}
                          title={trip.hide_special_offer_promo ? 'Special-offer popup & badge stopped for this trip — click to show again' : 'Stop the special-offer popup & badge from showing for this trip'}
                        >
                          <Megaphone size={15} aria-hidden="true" />
                        </button>
                        <button onClick={() => onEdit(trip)} aria-label={`Edit ${trip.title}`} className="flex-shrink-0 p-2 sm:p-1.5 rounded hover:bg-background active:bg-background text-dark-muted hover:text-primary transition-colors" title="Edit">
                          <Edit2 size={15} aria-hidden="true" />
                        </button>
                        <button onClick={() => onDelete(trip)} aria-label={`Delete ${trip.title}`} className="flex-shrink-0 p-2 sm:p-1.5 rounded hover:bg-primary/5 active:bg-primary/5 text-dark-muted hover:text-primary transition-colors" title="Delete">
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        </>
      )}
    </div>
  );
}
