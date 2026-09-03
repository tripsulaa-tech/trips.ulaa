// One kid's own Payment modal — deliberately a smaller sibling of
// AdminPaymentModal/AdminEnquiryPaymentModal: Total (read-only, sourced
// from the trip's own child_price), Amount Paid Now, Payment Type/Status,
// Method/UTR, Food Preference, and this kid's own ledger — with none of
// the package/discount/refund/extra-charge machinery those carry, since a
// kid doesn't get its own seat, package, or cancellation flow (v1 — see
// useKidPayment.ts). State/save logic live in useKidPayment, shared
// by both the Enquiries list table and the enquiry detail page's Kids
// card, so this component is purely presentational, same pattern as
// AdminEnquiryPaymentModal relative to useEnquiryPayment.
//
// The field set itself now lives in KidPaymentFormFields (split out so
// AdminKidDetail can render the exact same fields inline, no popup — see
// that file's header comment); this component is just the Modal chrome
// (title, dirty-check confirm-on-close, Save/Cancel) around it.
import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { useConfirm } from '../../components/ui/useConfirm';
import KidPaymentFormFields from './KidPaymentFormFields';
import type { Kid, Payment } from '../../types/types-index';
import { validateKidPaymentForm, availableKidPaymentTypeOptions } from './useKidPayment';
import type { KidPaymentForm } from './useKidPayment';

export default function AdminKidPaymentModal({
  kidPaymentTarget,
  fallbackLabel,
  onClose,
  kidPaymentForm,
  setKidPaymentForm,
  kidPaymentChildPrice,
  kidPaymentHistory,
  kidPaymentHistoryLoading,
  savingKidPayment,
  onSave,
}: {
  kidPaymentTarget: Kid | null;
  /** "Kid N" (or the kid's own name) — same fallback the Kids card/list rows use, so the modal title always matches what the admin just clicked. */
  fallbackLabel: string;
  onClose: () => void;
  kidPaymentForm: KidPaymentForm;
  setKidPaymentForm: Dispatch<SetStateAction<KidPaymentForm>>;
  /** The trip's live per-kid fee (upcoming_trips.child_price) — undefined when no trip's linked or the trip hasn't set one, in which case Total falls back to displaying whatever this kid's own record already holds. */
  kidPaymentChildPrice: number | undefined;
  kidPaymentHistory: Payment[];
  kidPaymentHistoryLoading: boolean;
  savingKidPayment: boolean;
  onSave: () => void;
}) {
  const confirm = useConfirm();

  const kidErrors = kidPaymentTarget
    ? validateKidPaymentForm(kidPaymentForm, kidPaymentTarget.amount_paid || 0)
    : {};
  const hasKidErrors = Object.keys(kidErrors).length > 0;
  const isDirty =
    kidPaymentForm.amount_paid !== '' ||
    kidPaymentForm.payment_method !== '' ||
    kidPaymentForm.payment_utr !== '' ||
    kidPaymentForm.payment_type !== 'advance' ||
    kidPaymentForm.status !== 'paid' ||
    (kidPaymentForm.food_preference || null) !== (kidPaymentTarget?.food_preference ?? null);

  // Same steer-away-from-'Balance' idea as AdminPaymentModal's own effect —
  // if the admin picked 'Balance' and then the numbers change so it no
  // longer clears what's owed, drop back to 'Installment' rather than
  // leaving 'Balance' selected but no longer true.
  useEffect(() => {
    if (!kidPaymentTarget) return;
    const stillClears = availableKidPaymentTypeOptions(kidPaymentForm, kidPaymentTarget.amount_paid || 0).some(o => o.value === 'balance');
    if (kidPaymentForm.payment_type === 'balance' && !stillClears) {
      setKidPaymentForm(f => ({ ...f, payment_type: 'installment' }));
    }
  }, [kidPaymentTarget, kidPaymentForm, setKidPaymentForm]);

  const requestClose = async () => {
    if (isDirty) {
      const ok = await confirm({
        title: 'Discard unsaved changes?',
        message: "You've entered payment details that haven't been saved yet.",
        confirmLabel: 'Discard',
        cancelLabel: 'Continue Editing',
        variant: 'danger',
      });
      if (!ok) return;
    }
    onClose();
  };

  return (
    <Modal isOpen={!!kidPaymentTarget} onClose={requestClose} title={`${fallbackLabel} — Payment`} size="sm">
      {kidPaymentTarget && (
        <div className="space-y-4">
          <div className="bg-background-warm rounded-md px-4 py-3">
            <p className="font-medium text-dark truncate">{fallbackLabel}</p>
            <p className="text-dark-muted text-xs truncate">Own payment record — independent of the rest of this booking.</p>
          </div>

          <KidPaymentFormFields
            kid={kidPaymentTarget}
            kidPaymentForm={kidPaymentForm}
            setKidPaymentForm={setKidPaymentForm}
            kidErrors={kidErrors}
            kidPaymentChildPrice={kidPaymentChildPrice}
            kidPaymentHistory={kidPaymentHistory}
            kidPaymentHistoryLoading={kidPaymentHistoryLoading}
            onNavigateAway={onClose}
          />

          <div className="flex gap-3 pt-2">
            <Button variant="outline" size="md" className="max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]" onClick={requestClose}>Cancel</Button>
            <Button
              variant="primary"
              size="md"
              className="max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]"
              onClick={onSave}
              loading={savingKidPayment}
              disabled={hasKidErrors}
              title={hasKidErrors ? 'Fix the highlighted fields before saving' : undefined}
            >
              Save Payment
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
