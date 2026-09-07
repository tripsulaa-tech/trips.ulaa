import { useState } from 'react';
import { createManualEnquiry, getAllUpcomingTripsAdmin } from '../../services/api';
import type { CompletedTrip, Enquiry, UpcomingTrip } from '../../types/types-index';
import { useAlert } from '../../components/ui/useAlert';

// Sentinel trip_id value meaning "not one of the trips in the list below" —
// picked for a batch of people from a trip that's already wrapped up (or
// otherwise isn't in the active list), where the trip is instead named in
// otherTripTitle as free text. Never sent to the DB as-is; handleBulkSave
// swaps it out for trip_id: undefined + the typed title.
export const OTHER_TRIP_VALUE = '__other__';

export type BulkEnquiryForm = {
  trip_id: string;
  otherTripTitle: string;
  source: Enquiry['source'];
  namesText: string;
};

export const emptyBulkEnquiryForm: BulkEnquiryForm = {
  trip_id: '',
  otherTripTitle: '',
  source: 'whatsapp',
  namesText: '',
};

export type BulkEnquiryEntry = {
  name: string;
  phone: string;
  email: string;
};

// Parses the free-text "one person per line" textarea into clean entries
// for the batch — trims each line, strips a leading bullet/number (people
// often paste straight from a numbered Instagram-comments screenshot or a
// WhatsApp list: "1. Priya", "- Dhruv"), drops blank lines, and folds out
// exact repeats (same name + phone once trimmed/cased) so a duplicated
// paste doesn't try to insert the same person twice in one batch.
//
// A line can be just a name ("Priya Sharma") for a lead with no contact
// info yet, or "Name, Phone" / "Name, Phone, Email" (comma- or
// tab-separated — whichever a pasted spreadsheet/CSV row happens to use)
// so a phone number entered here lets the person show up in the Contact
// Book (Travellers page) immediately, instead of needing it filled in
// later from their individual enquiry row.
export function parseBulkEntries(text: string): BulkEnquiryEntry[] {
  const seen = new Set<string>();
  const entries: BulkEnquiryEntry[] = [];
  for (const rawLine of text.split('\n')) {
    const cleaned = rawLine.replace(/^[\s*•\-–—]+|^\d+[.)]\s*/, '').trim();
    if (!cleaned) continue;
    const [namePart, phonePart, emailPart] = cleaned.split(/\t|,/).map(p => p.trim());
    const name = namePart || '';
    if (!name) continue;
    const phone = phonePart || '';
    const email = emailPart || '';
    const key = `${name.toLowerCase()}|${phone}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ name, phone, email });
  }
  return entries;
}

export type BulkEnquiryResult = {
  created: number;
  duplicates: string[];
  failed: { name: string; message: string }[];
};

/** Owns the "Bulk Enquiry" modal — lets an admin log a whole batch of
 *  manually-sourced enquiries (e.g. everyone who commented "interested" on
 *  an Instagram post, a list of walk-ins from a physical sign-up sheet, or
 *  a backlog of old contacts/trips this app never had a record of) against
 *  one trip + one source in a single pass, instead of opening
 *  "+ Add Enquiry" once per person.
 *
 *  Each line becomes its own 'new'-status enquiry row. A phone number is
 *  optional per person (falls back to blank, same as before) but including
 *  one means that person immediately shows up in the Contact Book
 *  (Travellers page), since that page is just a view over every enquiry
 *  with a saved phone number — see travellerContacts.ts. Trip can be
 *  picked from the active list, or "Other / past trip" for a trip that's
 *  already wrapped up and isn't in that list, named as free text instead.
 *
 *  Inserts run one at a time (not Promise.all) rather than as one bulk
 *  insert, so a single bad or duplicate row partway through the list
 *  doesn't abort the rest of the batch, and so the closing summary can
 *  report exactly how many made it in vs. were skipped/failed.
 *
 *  A trip that already finished has a real row (and a real id) in
 *  completed_trips — enquiries.trip_id is polymorphic across
 *  upcoming_trips/completed_trips, same as everywhere else in the app
 *  (see AdminEnquiries.tsx's isCompletedTrip check). So a past trip that
 *  already has a completed-trips album is picked from `pastTrips` below
 *  and linked by its real id, exactly like an active trip — it groups,
 *  filters, and searches correctly on the Enquiries page.
 *  "Other / past trip" (OTHER_TRIP_VALUE) is reserved for the genuinely
 *  unrecorded case: a trip with no row anywhere in the app, named as
 *  free text instead, saved with trip_id left null. */
export function useBulkEnquiry(params: {
  trips: UpcomingTrip[];
  completedTrips: CompletedTrip[];
  setTrips: (trips: UpcomingTrip[]) => void;
  load: () => void;
  showToast: (message: string) => void;
}) {
  const { trips, completedTrips, setTrips, load, showToast } = params;
  const alert = useAlert();

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<BulkEnquiryForm>(emptyBulkEnquiryForm);
  const [saving, setSaving] = useState(false);

  // "Only active trips" — published (live + bookable) and coming_soon
  // (announced, not yet bookable but a real upcoming trip) are both fair
  // game to log manual leads against; draft trips aren't public yet, so
  // there's nothing for a WhatsApp/Instagram/walk-in enquiry to be about.
  const activeTrips = trips.filter(t => t.status === 'published' || t.status === 'coming_soon');

  // Every trip that's already wrapped and has a completed_trips album —
  // most recently finished first, so the trip an admin is most likely to
  // be logging a backlog against (something that just ended) is near the
  // top rather than buried under years-old albums.
  const pastTrips = [...completedTrips].sort(
    (a, b) => new Date(b.trip_date).getTime() - new Date(a.trip_date).getTime(),
  );

  // "Other / past trip" is added separately in the modal, not here — it's
  // a UI-only sentinel (OTHER_TRIP_VALUE), not a real trip.

  const openBulkAdd = () => {
    setForm(emptyBulkEnquiryForm);
    setModalOpen(true);
  };

  const closeBulkModal = () => {
    if (saving) return;
    setModalOpen(false);
  };

  const entries = parseBulkEntries(form.namesText);
  const isOtherTrip = form.trip_id === OTHER_TRIP_VALUE;

  const handleBulkSave = async () => {
    if (!form.trip_id) {
      alert('Pick a trip before saving.');
      return;
    }
    if (isOtherTrip && !form.otherTripTitle.trim()) {
      alert('Enter the past trip\u2019s name.');
      return;
    }
    if (entries.length === 0) {
      alert('Enter at least one person — one per line.');
      return;
    }

    const trip = isOtherTrip
      ? undefined
      : trips.find(t => t.id === form.trip_id) ?? completedTrips.find(t => t.id === form.trip_id);
    const tripId = isOtherTrip ? undefined : form.trip_id;
    const tripTitle = isOtherTrip ? form.otherTripTitle.trim() : trip?.title;
    setSaving(true);
    const result: BulkEnquiryResult = { created: 0, duplicates: [], failed: [] };
    try {
      for (const entry of entries) {
        try {
          // Sequential on purpose — see hook doc comment above.
          await createManualEnquiry({
            full_name: entry.name,
            phone: entry.phone,
            email: entry.email || 'not-provided@ulaa.local',
            trip_id: tripId,
            trip_title: tripTitle,
            source: form.source,
            status: 'new',
          });
          result.created++;
        } catch (err) {
          const message = err instanceof Error ? err.message : (err as { message?: string } | null)?.message;
          if (message === 'DUPLICATE_ENQUIRY') {
            result.duplicates.push(entry.name);
          } else {
            result.failed.push({ name: entry.name, message: message || 'Failed to save.' });
          }
        }
      }

      setModalOpen(false);
      const freshTrips = await getAllUpcomingTripsAdmin();
      setTrips(freshTrips);
      load();

      const summary = [`Added ${result.created} of ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}.`];
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
    pastTrips,
    entries,
    openBulkAdd, closeBulkModal,
    handleBulkSave,
  };
}
