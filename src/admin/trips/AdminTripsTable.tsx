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
} from '@phosphor-icons/react';
import Button from '../../components/ui/Button';
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
  onTogglePublish, onToggleComingSoon, onToggleHidePdf, onDownloadPdf,
}: AdminTripsTableProps) {
  const publishedCount = trips.filter(t => t.status === 'published').length;
  const comingSoonCount = trips.filter(t => t.status === 'coming_soon').length;
  const draftCount = trips.filter(t => t.status === 'draft').length;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex justify-end">
          <Button variant="primary" size="sm" onClick={onAddTrip}>
            <Plus size={16} aria-hidden="true" /> Add Trip
          </Button>
        </div>
        <div className="flex items-center">
          <p className="flex items-center gap-2 text-dark-muted text-sm">
            <ClipboardList size={20} className="text-primary flex-shrink-0" aria-hidden="true" />
            <span className="font-semibold text-green-700">{publishedCount}</span> Published
            <span className="text-dark-muted/50">•</span>
            <span className="font-semibold text-amber-700">{comingSoonCount}</span> Coming Soon
            <span className="text-dark-muted/50">•</span>
            <span className="font-semibold text-dark">{draftCount}</span> Draft
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={onImportInputChange}
          />
          <button onClick={() => importInputRef.current?.click()} aria-label="Import Template" className="p-2 rounded-md border-2 border-primary/30 text-primary hover:bg-primary/5 transition-colors" title="Import Template">
            <Upload size={16} aria-hidden="true" />
          </button>
          <button onClick={onExportTemplate} aria-label="Export Template" className="p-2 rounded-md border-2 border-primary/30 text-primary hover:bg-primary/5 transition-colors" title="Export Template">
            <Download size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-dark-muted">Loading...</div>
      ) : trips.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg shadow-card">
          <p className="font-display text-xl text-dark-muted mb-4">No trips yet.</p>
          <Button variant="primary" size="md" className="max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]" onClick={onAddTrip}><Plus size={16} aria-hidden="true" /> Add Your First Trip</Button>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-card overflow-hidden">
          <div className="overflow-x-auto scrollbar-hide">
            <table className="w-full text-sm">
              <caption className="sr-only">Trips</caption>
              <thead className="bg-background-warm text-dark font-medium">
                <tr>
                  <th className="px-4 py-4 text-left">Trip</th>
                  <th className="px-4 py-4 text-left hidden md:table-cell">Destination</th>
                  <th className="px-4 py-4 text-left hidden lg:table-cell">Date</th>
                  <th className="px-4 py-4 text-left hidden md:table-cell">Seats</th>
                  <th className="px-2 py-4 text-center whitespace-nowrap">Status</th>
                  <th className="px-3 py-4 text-right whitespace-nowrap w-[112px] sm:w-auto">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-background-warm">
                {trips.map(trip => (
                  <motion.tr key={trip.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-background/50">
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
      )}
    </div>
  );
}
