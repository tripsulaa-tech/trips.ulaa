import Modal from '../../components/ui/Modal';
import BookingForm from '../../components/ui/BookingForm';
import { useConfirm } from '../../components/ui/useConfirm';
import { isBookingDraftDirty } from '../../utils/bookingDraft';
import type { UpcomingTrip, ButtonLabelsConfig, BookingFormDraft } from '../../types/types-index';

interface TripBookingModalProps {
  trip: UpcomingTrip;
  buttonLabels: ButtonLabelsConfig;
  isFull: boolean;
  remaining: number;
  isOpen: boolean;
  onClose: () => void;
  bookingDraft: BookingFormDraft | null;
  onDraftChange: (draft: BookingFormDraft | null) => void;
}

// Routes to an enquiry or the waitlist depending on whether what's
// requested (solo seat, or N for a group) actually fits in what's left;
// see BookingForm.
export default function TripBookingModal({
  trip,
  buttonLabels,
  isFull,
  remaining,
  isOpen,
  onClose,
  bookingDraft,
  onDraftChange,
}: TripBookingModalProps) {
  const confirm = useConfirm();

  const handleClose = async () => {
    // Closing (backdrop click, Escape, or the X button all funnel through
    // this same handler) with unsaved details entered would otherwise
    // silently discard them with no warning — most often an accidental
    // backdrop click. Confirm first when there's actually something to
    // lose. The draft itself is kept either way (see bookingDraft/
    // onDraftChange below), so even a deliberate close doesn't lose what
    // was typed — reopening the form brings it right back.
    if (isBookingDraftDirty(bookingDraft)) {
      const ok = await confirm({
        title: 'Close without submitting?',
        message: "You've entered some details for this booking. If you close now they won't be submitted — but we'll keep them ready for you if you come back to this form.",
        confirmLabel: 'Close',
        cancelLabel: 'Keep editing',
        variant: 'default',
      });
      if (!ok) return;
    }
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={isFull ? buttonLabels.waitlistCta : buttonLabels.primaryCta}
      size="lg"
    >
      <BookingForm
        tripId={trip.id}
        tripTitle={trip.title}
        terms={trip.terms_and_conditions}
        remainingSeats={remaining}
        minAge={trip.min_age}
        maxAge={trip.max_age}
        initialDraft={bookingDraft}
        onDraftChange={onDraftChange}
        onSuccess={() => setTimeout(onClose, 3000)}
      />
    </Modal>
  );
}
