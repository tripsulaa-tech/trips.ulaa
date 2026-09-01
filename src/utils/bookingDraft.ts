import type { BookingFormDraft } from '../types/types-index';

// Group bookings top out at this many seats in one submission — beyond
// that it's a phone/WhatsApp conversation, not a self-serve form. Shared
// between BookingForm and isBookingDraftDirty below (living here, rather
// than only inside BookingForm.tsx, keeps that file's exports limited to
// the component itself — needed for Fast Refresh).
export const MIN_GROUP_SIZE = 2;
export const MAX_GROUP_SIZE = 15;

// Whether a draft actually has anything in it worth warning the user
// about losing — i.e. whether it differs from a completely untouched
// form. Used by the page hosting the booking modal (TripDetailPage) to
// decide whether closing it (backdrop click, Escape, the X button) needs
// a confirmation step first.
export function isBookingDraftDirty(draft?: BookingFormDraft | null): boolean {
  if (!draft) return false;
  return (
    draft.full_name.trim() !== '' ||
    draft.age.trim() !== '' ||
    draft.phone.trim() !== '' ||
    draft.email.trim() !== '' ||
    draft.city.trim() !== '' ||
    draft.emergency_contact.trim() !== '' ||
    draft.message.trim() !== '' ||
    draft.terms_accepted ||
    draft.foodPreference !== null ||
    draft.bookingMode !== 'solo' ||
    draft.groupSize !== MIN_GROUP_SIZE ||
    draft.kidsCount.trim() !== ''
  );
}
