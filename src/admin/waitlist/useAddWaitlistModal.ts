import { useState } from 'react';
import { submitWaitlist } from '../../services/api';
import { useAlert } from '../../components/ui/useAlert';
import type { UpcomingTrip } from '../../types/types-index';
import { type WaitlistForm, emptyWaitlistForm } from './waitlistShared';

/** Owns the "Add to Waitlist" modal — logs a signup an admin took over the
 *  phone/WhatsApp directly, the same way Enquiries lets an admin log a
 *  manual enquiry: form state, field-touched tracking, validation, and the
 *  save call itself.
 *
 *  Extracted from AdminWaitlist.tsx (see that file's history for the
 *  original single-component version). */
export function useAddWaitlistModal(allTrips: UpcomingTrip[], load: () => void, showToast: (message: string) => void) {
  const alert = useAlert();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<WaitlistForm>(emptyWaitlistForm);
  const [saving, setSaving] = useState(false);
  // Which fields have been blurred yet — same reasoning as the Enquiries
  // page's Add Enquiry modal: name/phone/trip are required, but showing
  // that the instant the modal opens (before the admin has looked at the
  // field) would be premature since they all start blank.
  const [formTouched, setFormTouched] = useState<Set<string>>(new Set());

  const formErrors: { full_name?: string; phone?: string; trip_id?: string } = {};
  if (!form.full_name.trim()) formErrors.full_name = 'Full name is required.';
  if (!form.phone.trim()) formErrors.phone = 'Phone number is required.';
  if (!form.trip_id) formErrors.trip_id = "Pick which trip they're waiting for.";
  const hasFormErrors = !!(formErrors.full_name || formErrors.phone || formErrors.trip_id);

  const openAdd = () => {
    setForm(emptyWaitlistForm);
    setFormTouched(new Set());
    setModalOpen(true);
  };

  const handleSave = async () => {
    // Live in the modal already, plus this defense-in-depth gate in case
    // Save is reached some other way — same formErrors computed above, so
    // the two can never drift.
    if (formErrors.full_name || formErrors.phone) {
      alert('Name and phone are required.');
      return;
    }
    if (formErrors.trip_id) {
      alert(formErrors.trip_id);
      return;
    }
    const trip = allTrips.find(t => t.id === form.trip_id);
    try {
      setSaving(true);
      await submitWaitlist({
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || 'not-provided@ulaa.local',
        age: form.age === '' ? undefined : form.age,
        city: form.city.trim() || undefined,
        emergency_contact: form.emergency_contact.trim() || undefined,
        food_preference: form.food_preference || undefined,
        message: form.message.trim() || undefined,
        trip_id: form.trip_id,
        trip_title: trip?.title,
        group_size: form.group_size === '' ? undefined : form.group_size,
        kids_count: form.kids_count === '' ? undefined : form.kids_count,
      });
      setModalOpen(false);
      load();
      showToast(`Added ${form.full_name.trim()} to the waitlist.`);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : (err as { message?: string } | null)?.message;
      if (message === 'DUPLICATE_WAITLIST_ENTRY') {
        alert('This person is already on the waitlist for this trip.');
      } else if (message === 'AGE_NOT_ELIGIBLE') {
        alert('The age entered falls outside this trip\'s age range (set in Admin → Trips → Basic Info). Adjust the age or the trip\'s age range and try again.');
      } else {
        alert(message || 'Failed to add to the waitlist.');
      }
    } finally {
      setSaving(false);
    }
  };

  return {
    modalOpen, setModalOpen,
    form, setForm,
    formTouched, setFormTouched,
    formErrors, hasFormErrors,
    saving,
    openAdd,
    handleSave,
  };
}
