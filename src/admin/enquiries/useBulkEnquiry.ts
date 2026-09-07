import { useState } from 'react';
import { createManualEnquiry, getAllUpcomingTripsAdmin } from '../../services/api';
import type { Enquiry, UpcomingTrip } from '../../types/types-index';
import { useAlert } from '../../components/ui/useAlert';

export type BulkEnquiryForm = {
  trip_id: string;
  source: Enquiry['source'];
  namesText: string;
};

export const emptyBulkEnquiryForm: BulkEnquiryForm = {
  trip_id: '',
  source: 'whatsapp',
  namesText: '',
};

// Parses the free-text "one name per line" textarea into a clean list of
// full names for the batch — trims each line, strips a leading bullet/
// number (people often paste straight from a numbered Instagram-comments
// screenshot or a WhatsApp list: "1. Priya", "- Dhruv"), drops blank
// lines, and folds out exact repeats (same name once trimmed/cased) so a
// duplicated paste doesn't try to insert the same person twice in one
// batch — that would just hit the DB's own duplicate guard on the second
// one anyway, since it's keyed on (trip, name, phone, email) and every row
// in a bulk batch shares the same trip/blank-phone/sentinel-email.
export function parseBulkNames(text: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const rawLine of text.split('\n')) {
    const name = rawLine.replace(/^[\s*•\-–—]+|^\d+[.)]\s*/, '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

export type BulkEnquiryResult = {
  created: number;
  duplicates: string[];
  failed: { name: string; message: string }[];
};

/** Owns the "Bulk Enquiry" modal — lets an admin log a whole batch of
 *  manually-sourced enquiries (e.g. everyone who commented "interested" on
 *  an Instagram post, or a list of walk-ins from a physical sign-up sheet)
 *  against one trip + one source in a single pass, instead of opening
 *  "+ Add Enquiry" once per person.
 *
 *  Deliberately minimal: each name becomes its own 'new'-status enquiry row
 *  with a blank phone and the app's existing "not provided" email sentinel
 *  (the same values createManualEnquiry already accepts fine for a manual
 *  entry elsewhere — see useAddEnquiry.ts) — nothing else is captured here
 *  beyond trip + source, matching what this flow collects up front for the
 *  whole batch. Anyone who needs phone/pricing/etc filled in can still be
 *  edited afterwards from the enquiry row itself.
 *
 *  Inserts run one at a time (not Promise.all) rather than as one bulk
 *  insert, so a single bad or duplicate row partway through the list
 *  doesn't abort the rest of the batch, and so the closing summary can
 *  report exactly how many made it in vs. were skipped/failed. */
export function useBulkEnquiry(params: {
  trips: UpcomingTrip[];
  setTrips: (trips: UpcomingTrip[]) => void;
  load: () => void;
  showToast: (message: string) => void;
}) {
  const { trips, setTrips, load, showToast } = params;
  const alert = useAlert();

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<BulkEnquiryForm>(emptyBulkEnquiryForm);
  const [saving, setSaving] = useState(false);

  // "Only active trips" — published (live + bookable) and coming_soon
  // (announced, not yet bookable but a real upcoming trip) are both fair
  // game to log manual leads against; draft trips aren't public yet, so
  // there's nothing for a WhatsApp/Instagram/walk-in enquiry to be about.
  const activeTrips = trips.filter(t => t.status === 'published' || t.status === 'coming_soon');

  const openBulkAdd = () => {
    setForm(emptyBulkEnquiryForm);
    setModalOpen(true);
  };

  const closeBulkModal = () => {
    if (saving) return;
    setModalOpen(false);
  };

  const names = parseBulkNames(form.namesText);

  const handleBulkSave = async () => {
    if (!form.trip_id) {
      alert('Pick a trip before saving.');
      return;
    }
    if (names.length === 0) {
      alert('Enter at least one name — one per line.');
      return;
    }

    const trip = trips.find(t => t.id === form.trip_id);
    setSaving(true);
    const result: BulkEnquiryResult = { created: 0, duplicates: [], failed: [] };
    try {
      for (const name of names) {
        try {
          // Sequential on purpose — see hook doc comment above.
          await createManualEnquiry({
            full_name: name,
            phone: '',
            email: 'not-provided@ulaa.local',
            trip_id: form.trip_id,
            trip_title: trip?.title,
            source: form.source,
            status: 'new',
          });
          result.created++;
        } catch (err) {
          const message = err instanceof Error ? err.message : (err as { message?: string } | null)?.message;
          if (message === 'DUPLICATE_ENQUIRY') {
            result.duplicates.push(name);
          } else {
            result.failed.push({ name, message: message || 'Failed to save.' });
          }
        }
      }

      setModalOpen(false);
      const freshTrips = await getAllUpcomingTripsAdmin();
      setTrips(freshTrips);
      load();

      const summary = [`Added ${result.created} of ${names.length} enquir${names.length === 1 ? 'y' : 'ies'}.`];
      if (result.duplicates.length > 0) {
        summary.push(`${result.duplicates.length} already existed for this trip and ${result.duplicates.length === 1 ? 'was' : 'were'} skipped.`);
      }
      if (result.failed.length > 0) {
        summary.push(`${result.failed.length} failed.`);
        console.error('Bulk enquiry failures:', result.failed);
      }
      showToast(summary.join(' '));
    } finally {
      setSaving(false);
    }
  };

  return {
    modalOpen,
    form, setForm,
    saving,
    activeTrips,
    names,
    openBulkAdd, closeBulkModal,
    handleBulkSave,
  };
}
