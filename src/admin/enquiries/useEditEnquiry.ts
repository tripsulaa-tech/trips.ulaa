import { useState } from 'react';
import { updateEnquiryDetails } from '../../services/api';
import type { Enquiry, UpcomingTrip } from '../../types/types-index';
import { emptyEditDetailsForm, type EditDetailsForm } from './AdminEditDetailsModal';
import { computeDiscountedTotal } from './AdminEnquiryCommon';
import { useAlert } from '../../components/ui/useAlert';

/** Owns the Edit Details modal — same fields/behaviour as the one on the
 *  single-enquiry detail page, reached from this row's kebab menu instead.
 *  Target/form/touched state, opening with the enquiry's current values
 *  prefilled, and saving.
 *
 *  `trips` is passed in (not fetched here) purely to resolve the new
 *  trip_title when the admin reassigns an enquiry to a different trip —
 *  same read-only lookup usage as getTripPrice elsewhere, so no new
 *  dependency between hooks is needed.
 *
 *  `getTripPrice` is the same lookup, used specifically so that a Package
 *  change here (Traveller & Trip's own field, editable pre-booking only —
 *  see AdminEnquiryTravellerCard) also refreshes total_amount to match the
 *  newly-picked package's list price, instead of leaving the enquiry row
 *  with a package_type/total_amount pair that no longer agree until Track
 *  Payment is opened.
 *
 *  Extracted from AdminEnquiries.tsx (see that file's history for the
 *  original single-component version). */
export function useEditEnquiry(params: {
  trips: UpcomingTrip[];
  load: () => void;
  getTripPrice: (tripId: string | undefined, packageType: Enquiry['package_type']) => number | undefined;
}) {
  const { trips, load, getTripPrice } = params;
  const alert = useAlert();

  const [editTarget, setEditTarget] = useState<Enquiry | null>(null);
  const [editForm, setEditForm] = useState<EditDetailsForm>(emptyEditDetailsForm);
  const [editTouched, setEditTouched] = useState<Set<string>>(new Set());
  const [savingEdit, setSavingEdit] = useState(false);

  const openEdit = (enquiry: Enquiry) => {
    setEditForm({
      full_name: enquiry.full_name || '',
      email: enquiry.email || '',
      phone: enquiry.phone || '',
      city: enquiry.city || '',
      age: enquiry.age ?? '',
      trip_id: enquiry.trip_id || '',
      food_preference: enquiry.food_preference === 'veg' || enquiry.food_preference === 'non_veg' ? enquiry.food_preference : '',
      source: enquiry.source,
      package_type: enquiry.package_type === 'early_bird' ? 'early_bird' : 'normal',
    });
    setEditTouched(new Set());
    setEditTarget(enquiry);
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    if (!editForm.full_name.trim() || !editForm.phone.trim()) {
      alert(!editForm.full_name.trim() ? 'Full name is required.' : 'Phone number is required.');
      return;
    }
    try {
      setSavingEdit(true);
      const newTrip = editForm.trip_id ? trips.find(t => t.id === editForm.trip_id) : undefined;
      // Package is only ever editable here before a booking exists (see
      // AdminEnquiryTravellerCard) — once it changes, refresh total_amount
      // to that package's list price so the two fields can't drift apart.
      // Any existing discount is preserved by re-applying it to the new
      // list price, same as Track Payment does when its own Package field
      // changes. Bookings (which lock this field entirely) never hit this
      // branch, so an already-collected/confirmed total is never touched.
      const packageChanged = editForm.package_type !== editTarget.package_type;
      const tripIdForPricing = editForm.trip_id || editTarget.trip_id || undefined;
      const newListPrice = packageChanged && !editTarget.booking_id
        ? getTripPrice(tripIdForPricing, editForm.package_type)
        : undefined;
      const newTotalAmount = newListPrice != null
        ? computeDiscountedTotal(newListPrice, editTarget.discount_amount || '')
        : undefined;
      await updateEnquiryDetails(editTarget.id, editTarget, {
        full_name: editForm.full_name,
        email: editForm.email,
        phone: editForm.phone,
        city: editForm.city || null,
        age: editForm.age === '' ? null : Number(editForm.age),
        trip_id: editForm.trip_id || null,
        trip_title: editForm.trip_id ? (newTrip?.title ?? null) : null,
        food_preference: editForm.food_preference || null,
        source: editForm.source,
        package_type: editForm.package_type,
        ...(newTotalAmount !== undefined ? { total_amount: newTotalAmount } : {}),
      });
      setEditTarget(null);
      load();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to save details.');
    } finally {
      setSavingEdit(false);
    }
  };

  return {
    editTarget, setEditTarget,
    editForm, setEditForm,
    editTouched, setEditTouched,
    savingEdit,
    openEdit,
    handleSaveEdit,
  };
}
