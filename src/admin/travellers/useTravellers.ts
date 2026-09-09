import { useEffect, useMemo, useState } from 'react';
import { getEnquiries, updateEnquiryDetails, deleteEnquiry } from '../../services/api';
import type { Enquiry } from '../../types/types-index';
import { buildTravellerContacts, contactMatchesQuery } from './travellerContacts';
import type { TravellerContact } from './travellerContacts';
import type { TravellerEditForm } from './AdminEditTravellerModal';
import { useAlert } from '../../components/ui/useAlert';
import { useConfirm } from '../../components/ui/useConfirm';
import { validateFullName, validatePhone, validateOptionalEmail, validateOptionalCity } from '../../utils/formValidation';
import { loadPersisted, savePersisted } from '../../utils/sessionState';

export const TRAVELLERS_PAGE_SIZE = 10;

// Persisted the same way as the Enquiries page's filters (see
// useEnquiryFilters.ts and utils/sessionState.ts) so switching admin tabs
// and coming back to the Contact Book keeps the same search/"repeat only"/
// page instead of resetting.
const FILTERS_STORAGE_KEY = 'ulaa:admin-travellers:filters';

type PersistedTravellersFilters = {
  searchQuery: string;
  repeatOnly: boolean;
  page: number;
};

/** Owns the Contact Book's data: loads every enquiry once (same source of
 *  truth as Admin Enquiries — see useEnquiryData.ts), collapses it into
 *  one contact per person via buildTravellerContacts() (anyone with a
 *  saved phone number, booked or not), and layers search + a "repeat
 *  travellers only" filter + pagination on top. A plain useState/useMemo
 *  hook (no realtime subscription) since this is a lookup/reference view,
 *  not somewhere admins actively work leads from minute to minute the way
 *  they do on Enquiries — a manual refresh on next visit is enough. */
export function useTravellers() {
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [persisted] = useState(() => loadPersisted<PersistedTravellersFilters>(FILTERS_STORAGE_KEY));
  const [searchQuery, setSearchQuery] = useState(persisted.searchQuery ?? '');
  const [repeatOnly, setRepeatOnly] = useState(persisted.repeatOnly ?? false);
  const [page, setPage] = useState(persisted.page ?? 1);
  const alert = useAlert();
  const confirm = useConfirm();

  // Edit Traveller modal — see AdminEditTravellerModal.tsx. A contact isn't
  // its own row, so saving fans the patch out across every one of
  // editTarget.rows.
  const [editTarget, setEditTarget] = useState<TravellerContact | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Tracks which contact's delete is in flight (by key) so only that
  // card's button shows a loading state, same pattern as
  // useEnquiryLifecycle's per-row `updating`.
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const load = () => {
    getEnquiries().then(setEnquiries).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const allContacts = useMemo(() => buildTravellerContacts(enquiries), [enquiries]);

  const contacts = useMemo(
    () => allContacts
      .filter(c => (repeatOnly ? c.tripCount > 1 : true))
      .filter(c => contactMatchesQuery(c, searchQuery)),
    [allContacts, repeatOnly, searchQuery]
  );

  // A new search/filter can easily leave `page` pointing past the end of
  // the now-shorter result set — land back on page 1 whenever either
  // changes. Done during render (comparing against the previous filter
  // signature), not in an effect — same convention as
  // useEnquiryFilters.ts's currentPage reset, see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
  const filterSignature = `${repeatOnly}|${searchQuery.trim().toLowerCase()}`;
  const [prevFilterSignature, setPrevFilterSignature] = useState(filterSignature);
  if (filterSignature !== prevFilterSignature) {
    setPrevFilterSignature(filterSignature);
    setPage(1);
  }

  // Persist search/"repeat only"/page as one JSON blob whenever any of
  // them change — see useEnquiryFilters.ts for the fuller version of this
  // same pattern.
  useEffect(() => {
    savePersisted<PersistedTravellersFilters>(FILTERS_STORAGE_KEY, { searchQuery, repeatOnly, page });
  }, [searchQuery, repeatOnly, page]);

  const kpis = useMemo(() => {
    // Distinct trips across every contact — a group booking or several
    // separate contacts enquiring about the same trip should count that
    // trip once, not once per contact. Falls back to trip_title (or the
    // enquiry id for a no-specific-trip entry) via the same tripKey shape
    // travellerContacts.ts groups trips by, so two different contacts on
    // the same trip collapse to one key here too.
    const distinctTripKeys = new Set<string>();
    for (const c of allContacts) {
      for (const t of c.trips) distinctTripKeys.add(t.key);
    }
    return {
      total: allContacts.length,
      repeat: allContacts.filter(c => c.tripCount > 1).length,
      tripsBooked: distinctTripKeys.size,
      cancelledTrips: allContacts.reduce((sum, c) => sum + c.trips.filter(t => t.allCancelled).length, 0),
    };
  }, [allContacts]);

  // Patches full_name/phone/email/city on every underlying row for this
  // contact via the same updateEnquiryDetails endpoint the Enquiries
  // Traveller & Trip card uses — a contact card is a view over those rows,
  // not a row of its own, so there's nothing else to update.
  const handleSaveEdit = async (form: TravellerEditForm) => {
    if (!editTarget) return;
    // Same shared validators the modal shows live, field-by-field — this
    // is just the defense-in-depth save-time gate, matching the pattern
    // used by the enquiry-side admin forms (useAddEnquiry/useEditEnquiry).
    if (!form.full_name.trim()) {
      await alert('Full name is required.');
      return;
    }
    if (!form.phone.trim()) {
      await alert('Phone number is required.');
      return;
    }
    const firstError = [
      validateFullName(form.full_name),
      validatePhone(form.phone),
      validateOptionalEmail(form.email),
      validateOptionalCity(form.city),
    ].find(r => r !== true);
    if (firstError) {
      await alert(firstError as string);
      return;
    }
    setSavingEdit(true);
    try {
      await Promise.all(editTarget.rows.map(row => updateEnquiryDetails(row.id, row, {
        full_name: form.full_name,
        phone: form.phone,
        email: form.email,
        city: form.city || null,
      })));
      setEditTarget(null);
      load();
    } catch (err) {
      console.error(err);
      await alert(
        err instanceof Error && err.message === 'DUPLICATE_ENQUIRY'
          ? 'Another enquiry already uses this phone number for one of this traveller\u2019s trips.'
          : 'Failed to save traveller details.'
      );
    } finally {
      setSavingEdit(false);
    }
  };

  // Permanently removes every enquiry row behind this contact — i.e. their
  // entire booking/payment history across every trip, not just one. Each
  // row's seat (if any) is released by deleteEnquiry itself, same as a
  // normal single-enquiry delete.
  const handleDelete = async (contact: TravellerContact) => {
    const ok = await confirm({
      title: 'Delete this traveller?',
      message: contact.tripCount > 1
        ? `This permanently removes ${contact.fullName} and their entire history across all ${contact.tripCount} trips, including payment records. This cannot be undone.`
        : `This permanently removes ${contact.fullName} and their booking/payment history. This cannot be undone.`,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    setDeletingKey(contact.key);
    try {
      await Promise.all(contact.rows.map(row => deleteEnquiry(row)));
      load();
    } catch (err) {
      console.error(err);
      await alert('Failed to delete traveller.');
    } finally {
      setDeletingKey(null);
    }
  };

  return {
    loading,
    contacts,
    editTarget, setEditTarget,
    savingEdit,
    handleSaveEdit,
    deletingKey,
    handleDelete,
    totalCount: allContacts.length,
    searchQuery, setSearchQuery,
    repeatOnly, setRepeatOnly,
    page, setPage,
    kpis,
  };
}
