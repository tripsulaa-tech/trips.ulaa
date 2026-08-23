import { useState } from 'react';
import { deleteUpcomingTripCascade, getTripDeletionImpact, updateUpcomingTrip } from '../../services/api';
import type { UpcomingTrip } from '../../types/types-index';
import { useConfirm } from '../../components/ui/useConfirm';

/** Row-level quick actions for the Trips table: delete (with a linked-data
 *  impact warning), publish/unpublish, coming-soon toggle, hide-PDF toggle,
 *  and itinerary PDF download. Each mutating action re-runs `load()` to
 *  refresh the table afterwards. */
export function useTripActions(load: () => void) {
  const confirm = useConfirm();
  const [pdfDownloadingId, setPdfDownloadingId] = useState<string | null>(null);

  const handleDelete = async (trip: UpcomingTrip) => {
    // Look up what's actually attached to this trip first, so the warning
    // is specific ("12 enquiries, 3 waitlist entries, 8 photos") instead of
    // a generic "this cannot be undone" that's easy to click through
    // without registering what's really at stake. Falls back to a plain
    // warning if the lookup itself fails, rather than blocking deletion.
    const impact = await getTripDeletionImpact(trip.id).catch(() => null);
    const parts: string[] = [];
    if (impact) {
      if (impact.enquiries > 0) parts.push(`${impact.enquiries} ${impact.enquiries === 1 ? 'enquiry' : 'enquiries'}`);
      if (impact.waitlist > 0) parts.push(`${impact.waitlist} waitlist ${impact.waitlist === 1 ? 'entry' : 'entries'}`);
      if (impact.photos > 0) parts.push(`${impact.photos} ${impact.photos === 1 ? 'photo' : 'photos'}`);
    }
    const message = parts.length
      ? `Deleting "${trip.title}" also permanently removes ${parts.join(', ')} linked to it. This cannot be undone.`
      : `This will permanently delete "${trip.title}". This cannot be undone.`;
    const ok = await confirm({
      title: 'Delete this trip?',
      message,
      confirmLabel: 'Delete everything',
    });
    if (!ok) return;
    await deleteUpcomingTripCascade(trip);
    load();
  };

  // Eye/EyeOff quick action: draft -> published (full listing, bypassing the
  // coming_soon teaser state); published or coming_soon -> draft (take fully
  // offline). Mirrors the old is_published toggle's behavior.
  const togglePublish = async (trip: UpcomingTrip) => {
    const status = trip.status === 'draft' ? 'published' : 'draft';
    await updateUpcomingTrip(trip.id, { status });
    load();
  };

  // Hourglass quick action: flips between the two "live" sub-states
  // (coming_soon <-> published). Clicking it on a draft trip puts it live
  // straight into coming_soon (teaser) — the common "put it up early while
  // still filling in content" workflow.
  const toggleComingSoon = async (trip: UpcomingTrip) => {
    const status = trip.status === 'coming_soon' ? 'published' : 'coming_soon';
    await updateUpcomingTrip(trip.id, { status });
    load();
  };

  // Toggles whether the public Trip Detail page's "Download itinerary PDF"
  // option is shown for this trip. Purely a visibility flag for the public
  // site — doesn't touch this admin table's own download button above.
  const toggleHidePdfDownload = async (trip: UpcomingTrip) => {
    await updateUpcomingTrip(trip.id, { hide_pdf_download: !trip.hide_pdf_download });
    load();
  };

  const handleDownloadTripPdf = async (trip: UpcomingTrip) => {
    if (pdfDownloadingId) return;
    setPdfDownloadingId(trip.id);
    try {
      // Same lazy import used on the public Trip Detail page — keeps
      // jsPDF/html2canvas out of the main admin bundle until actually used.
      const { downloadTripItineraryPdf } = await import('../../utils/tripItineraryPdf');
      await downloadTripItineraryPdf(trip);
    } catch (err) {
      console.error('Failed to generate itinerary PDF', err);
    } finally {
      setPdfDownloadingId(null);
    }
  };

  return {
    pdfDownloadingId,
    handleDelete,
    togglePublish,
    toggleComingSoon,
    toggleHidePdfDownload,
    handleDownloadTripPdf,
  };
}
