import { useState } from 'react';
import { deleteUpcomingTripCascade, getTripDeletionImpact, updateUpcomingTrip } from '../../services/api';
import type { UpcomingTrip } from '../../types/types-index';
import { useConfirm } from '../../components/ui/useConfirm';
import { useToast } from '../../components/ui/useToast';

/** Row-level quick actions for the Trips table: delete (with a linked-data
 *  impact warning), publish/unpublish, coming-soon toggle, hide-PDF toggle,
 *  hide-special-offer-promo toggle, reorder, and itinerary PDF download.
 *  Each mutating action re-runs `load()` to refresh the table afterwards. */
export function useTripActions(trips: UpcomingTrip[], load: () => void) {
  const confirm = useConfirm();
  const toast = useToast();
  const [pdfDownloadingId, setPdfDownloadingId] = useState<string | null>(null);

  // Runs a save, then refreshes the table. If the save fails, says so instead of
  // leaving the row looking unchanged with no explanation.
  const saveThenReload = async (save: () => Promise<unknown>, failMessage: string) => {
    try {
      await save();
    } catch (err) {
      console.error(err);
      toast.error(failMessage);
    }
    load();
  };

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
    await saveThenReload(() => deleteUpcomingTripCascade(trip), `Couldn't delete "${trip.title}". Please try again.`);
  };

  // Eye/EyeOff quick action: draft -> published (full listing, bypassing the
  // coming_soon teaser state); published or coming_soon -> draft (take fully
  // offline). Mirrors the old is_published toggle's behavior.
  const togglePublish = async (trip: UpcomingTrip) => {
    const status = trip.status === 'draft' ? 'published' : 'draft';
    await saveThenReload(() => updateUpcomingTrip(trip.id, { status }), "Couldn't change the publish status. Please try again.");
  };

  // Hourglass quick action: flips between the two "live" sub-states
  // (coming_soon <-> published). Clicking it on a draft trip puts it live
  // straight into coming_soon (teaser) — the common "put it up early while
  // still filling in content" workflow.
  const toggleComingSoon = async (trip: UpcomingTrip) => {
    const status = trip.status === 'coming_soon' ? 'published' : 'coming_soon';
    await saveThenReload(() => updateUpcomingTrip(trip.id, { status }), "Couldn't change the coming-soon status. Please try again.");
  };

  // Toggles whether the public Trip Detail page's "Download itinerary PDF"
  // option is shown for this trip. Purely a visibility flag for the public
  // site — doesn't touch this admin table's own download button above.
  const toggleHidePdfDownload = async (trip: UpcomingTrip) => {
    await saveThenReload(() => updateUpcomingTrip(trip.id, { hide_pdf_download: !trip.hide_pdf_download }), "Couldn't change the PDF setting. Please try again.");
  };

  // Toggles whether the Trip Detail hero draws the trip title over the
  // banner. Turn it on when the banner artwork already contains the title.
  // See add_trip_banner_has_text.sql.
  const toggleBannerHasText = async (trip: UpcomingTrip) => {
    await saveThenReload(() => updateUpcomingTrip(trip.id, { banner_has_text: !trip.banner_has_text }), "Couldn't change the banner setting. Please try again.");
  };

  // Toggles whether this trip's special-offer *promotion* (homepage
  // SpecialOfferPopup + TripCard gradient border/badge) is shown. Doesn't
  // touch special_offer_price/date — the offer, if still within its date
  // window, keeps applying, it just stops being advertised. See
  // add_trip_hide_special_offer_promo.sql.
  const toggleHideSpecialOfferPromo = async (trip: UpcomingTrip) => {
    await saveThenReload(() => updateUpcomingTrip(trip.id, { hide_special_offer_promo: !trip.hide_special_offer_promo }), "Couldn't change the special-offer setting. Please try again.");
  };

  // ↑/↓ quick action: swaps this trip's sort_order with its neighbour in
  // the table (which is itself ordered by sort_order — see
  // getAllUpcomingTripsAdmin), moving its card earlier/later on the public
  // homepage preview and the full /trips listing. See add_trip_sort_order.sql.
  const moveTrip = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= trips.length) return;
    const a = trips[index];
    const b = trips[target];
    const aOrder = a.sort_order ?? index;
    const bOrder = b.sort_order ?? target;
    try {
      await Promise.all([
        updateUpcomingTrip(a.id, { sort_order: bOrder }),
        updateUpcomingTrip(b.id, { sort_order: aOrder }),
      ]);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't change the trip order. Please try again.");
    }
    // Reload either way so the table shows what is actually saved.
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
      toast.error(`Couldn't create the itinerary PDF for "${trip.title}". Please try again.`);
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
    toggleBannerHasText,
    toggleHideSpecialOfferPromo,
    moveTrip,
    handleDownloadTripPdf,
  };
}
