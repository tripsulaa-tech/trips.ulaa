import { useState } from 'react';
import { updateEnquiryDetails } from '../../services/api';
import type { Enquiry, UpcomingTrip } from '../../types/types-index';
import { emptyEditDetailsForm, type EditDetailsForm } from './AdminEditDetailsModal';
import { computeDiscountedTotal } from './AdminEnquiryCommon';
import { packageListPrice, packageOptionIds } from '../../utils/tripOptions';
import { useAlert } from '../../components/ui/useAlert';
import {
  validateFullName, validatePhone, validateOptionalEmail, validateOptionalCity, validateOptionalAge,
} from '../../utils/formValidation';

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
  const { trips, load } = params;
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
      trip_package_id: enquiry.package_id || '',
    });
    setEditTouched(new Set());
    setEditTarget(enquiry);
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    // Same shared validators as the modal shows live, field-by-field — this
    // is just the defense-in-depth save-time gate, matching how
    // AdminAddEnquiryModal/useAddEnquiry.ts gate their own save.
    if (!editForm.full_name.trim()) {
      alert('Full name is required.');
      return;
    }
    if (!editForm.phone.trim()) {
      alert('Phone number is required.');
      return;
    }
    const newTrip = editForm.trip_id ? trips.find(t => t.id === editForm.trip_id) : undefined;
    const firstError = [
      validateFullName(editForm.full_name),
      validatePhone(editForm.phone),
      validateOptionalEmail(editForm.email),
      validateOptionalCity(editForm.city),
      validateOptionalAge(editForm.age, newTrip?.min_age, newTrip?.max_age),
    ].find(r => r !== true);
    if (firstError) {
      alert(firstError as string);
      return;
    }
    try {
      setSavingEdit(true);
      // Package is only ever editable here before a booking exists (see
      // AdminEnquiryTravellerCard) — once it changes, refresh total_amount
      // to that package's list price so the two fields can't drift apart.
      // Any existing discount is preserved by re-applying it to the new
      // list price, same as Track Payment does when its own Package field
      // changes. Bookings (which lock this field entirely) never hit this
      // branch, so an already-collected/confirmed total is never touched.
      const tripIdForPricing = editForm.trip_id || editTarget.trip_id || undefined;
      const pricingTrip = newTrip ?? trips.find(t => t.id === tripIdForPricing);
      const cfg = pricingTrip?.trip_options ?? null;

      // Trip package (Basic / Premium / ...): swapping it changes which
      // options this traveler took (which drives the per-option headcounts
      // in Trip Finance) AND which price tier applies, because early-bird
      // pricing is per package (e.g. only Premium gets it).
      const pkgChanged = editForm.trip_package_id !== (editTarget.package_id || '');
      const pkg = cfg?.packages.find(p => p.id === editForm.trip_package_id);
      let packagePatch: { package_id: string | null; package_name: string | null; selected_option_ids: string[] } | undefined;
      const newOptionIds = pkgChanged
        ? (pkg && cfg ? packageOptionIds(pkg, cfg) : [])
        : (editTarget.selected_option_ids || []);
      if (pkgChanged) {
        packagePatch = { package_id: pkg?.id ?? null, package_name: pkg?.name ?? null, selected_option_ids: newOptionIds };
      }

      // Price tier. If the admin didn't pick a tier by hand, follow the
      // package: a package without early-bird is always Normal; an
      // early-bird package moves to Early Bird when the trip's window is
      // still open (or the traveler already was early-bird).
      let finalPackageType = editForm.package_type;
      const typeEditedByHand = editForm.package_type !== editTarget.package_type;
      if (pkgChanged && !typeEditedByHand && cfg && cfg.packages.length > 0) {
        if (!pkg || !pkg.early_bird) {
          finalPackageType = 'normal';
        } else {
          const windowOpen = !!pricingTrip?.early_bird_deadline
            && new Date() <= new Date(`${pricingTrip.early_bird_deadline}T23:59:59.999`);
          finalPackageType = editTarget.package_type === 'early_bird' || windowOpen ? 'early_bird' : 'normal';
        }
      }
      const tierChanged = finalPackageType !== editTarget.package_type;

      // Amount. Before a booking exists the total follows the package and
      // tier: the package's own price (or trip price + its options when it
      // has none) for that tier, with any existing discount re-applied.
      // Once a booking exists the amount is left alone — the traveler has
      // already been invoiced/paid against it, so any difference goes
      // through Track Payment / an Add-on.
      let totalAfterPackage: number | undefined;
      if (!editTarget.booking_id && (pkgChanged || tierChanged) && pricingTrip) {
        const listPrice = packageListPrice(pkg, cfg, pricingTrip, finalPackageType);
        if (listPrice != null) {
          totalAfterPackage = computeDiscountedTotal(listPrice, editTarget.discount_amount || '') ?? listPrice;
        }
      }
      await updateEnquiryDetails(editTarget.id, editTarget, {
        full_name: editForm.full_name,
        email: editForm.email,
        phone: editForm.phone,
        city: editForm.city || null,
        age: editForm.age === '' ? null : Number(editForm.age),
        trip_id: editForm.trip_id || null,
        // `trips` only holds UPCOMING trips, so for an enquiry whose trip has
        // since been completed `newTrip` is undefined — writing
        // `newTrip?.title ?? null` here used to blank the saved trip name
        // (while trip_id stayed set) every time such an enquiry was edited.
        // Only touch trip_title when the admin actually picked a different trip.
        ...(editForm.trip_id !== (editTarget.trip_id || '')
          ? { trip_title: newTrip?.title ?? null }
          : {}),
        food_preference: editForm.food_preference || null,
        source: editForm.source,
        package_type: finalPackageType,
        ...(totalAfterPackage !== undefined ? { total_amount: totalAfterPackage } : {}),
        ...(packagePatch ?? {}),
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
