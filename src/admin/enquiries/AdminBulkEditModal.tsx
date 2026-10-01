import type { Dispatch, SetStateAction } from 'react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Select from '../../components/ui/Select';
import type { Enquiry } from '../../types/types-index';
import {
  BULK_NO_CHANGE, BULK_FOOD_OPTIONS, BULK_PACKAGE_OPTIONS, BULK_STATUS_OPTIONS,
  inputClass, validateBulkEditForm,
} from './AdminEnquiriesShared';
import type { BulkEditForm } from './AdminEnquiriesShared';
import { parseNonNegative, computeDiscountedTotal } from './AdminEnquiryCommon';
import { formatPrice } from '../../utils/utils-index';

export default function BulkEditModal({
  isOpen,
  onClose,
  selectedCount,
  selectedTripName,
  targets,
  bulkForm,
  setBulkForm,
  activeGroupTripId,
  getTripPrice,
  onSave,
  bulkSaving,
}: {
  isOpen: boolean;
  onClose: () => void;
  selectedCount: number;
  selectedTripName: string | null;
  // The actual selected rows, only needed to check each one's total_amount
  // fallback for the "amount paid can't exceed total" rule live — see
  // validateBulkEditForm.
  targets: Enquiry[];
  bulkForm: BulkEditForm;
  setBulkForm: Dispatch<SetStateAction<BulkEditForm>>;
  activeGroupTripId: string | undefined;
  getTripPrice: (tripId: string | undefined, packageType: Enquiry['package_type']) => number | undefined;
  onSave: () => void;
  bulkSaving: boolean;
}) {
  const errorClass = 'text-red-500 text-xs mt-1';
  // Live version of handleBulkSave's two save-time checks — recomputed on
  // every render so "nothing changed yet" / "this would overpay someone"
  // show up as the admin fills the form, instead of only behind an
  // alert() after Bulk Save.
  const { hasChanges, overpaid } = validateBulkEditForm(bulkForm, targets);
  const hasBulkErrors = !hasChanges || !!overpaid;
  // Only well-defined once the whole selection is being set to one specific
  // package on one trip — that's the one case where every selected row
  // shares the same list price to discount from.
  const listPrice = activeGroupTripId && bulkForm.package_type !== BULK_NO_CHANGE
    ? getTripPrice(activeGroupTripId, bulkForm.package_type)
    : undefined;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Bulk Edit — ${selectedCount} selected`} size="sm">
      <div className="space-y-4">
        {selectedTripName && (
          <p className="text-xs font-medium text-primary bg-primary/10 rounded-md px-3 py-2">
            Trip: {selectedTripName}
          </p>
        )}
        <p className="text-xs text-dark-muted bg-background-warm rounded-md px-3 py-2">
          Only changed fields are applied. Fields left on "No change" stay as they are.
        </p>

        <div>
          <label htmlFor="bulk-food" className="block text-sm font-medium text-dark mb-1">Food Preference</label>
          <Select
            inputId="bulk-food"
            value={bulkForm.food_preference}
            onChange={val => setBulkForm(f => ({ ...f, food_preference: val as BulkEditForm['food_preference'] }))}
            options={BULK_FOOD_OPTIONS}
          />
        </div>

        <div>
          <label htmlFor="bulk-package" className="block text-sm font-medium text-dark mb-1">Package</label>
          <Select
            inputId="bulk-package"
            value={bulkForm.package_type}
            onChange={val => {
              const packageType = val as BulkEditForm['package_type'];
              // Mirrors the single-row Track Payment modal: picking a
              // package pulls in that package's configured trip price as
              // the suggested Total Amount, so picking "Normal Price"
              // actually sets a price instead of just relabeling the row.
              const suggested = packageType !== BULK_NO_CHANGE && activeGroupTripId
                ? getTripPrice(activeGroupTripId, packageType)
                : undefined;
              setBulkForm(f => ({
                ...f,
                package_type: packageType,
                total_amount: suggested != null ? (computeDiscountedTotal(suggested, f.discount_amount) ?? suggested) : f.total_amount,
              }));
            }}
            options={BULK_PACKAGE_OPTIONS}
          />
          {bulkForm.package_type !== BULK_NO_CHANGE && !activeGroupTripId && (
            <p className="text-amber-600 text-2xs mt-1">
              These enquiries have no linked trip, so no price is available. Enter the amount manually.
            </p>
          )}
          {bulkForm.package_type !== BULK_NO_CHANGE && activeGroupTripId && getTripPrice(activeGroupTripId, bulkForm.package_type) == null && (
            <p className="text-amber-600 text-2xs mt-1">
              No price is set for this package. Enter the amount manually, or add it under Upcoming Trips.
            </p>
          )}
        </div>

        {listPrice != null ? (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-dark mb-1">List Price (₹)</label>
              <div className={`${inputClass} bg-background-warm text-dark-muted`}>{formatPrice(listPrice)}</div>
            </div>
            <div>
              <label htmlFor="bulk-discount-amount" className="block text-sm font-medium text-dark mb-1">Discount (₹)</label>
              <input
                id="bulk-discount-amount"
                type="number"
                min={0}
                value={bulkForm.discount_amount}
                onChange={ev => {
                  const discount = parseNonNegative(ev.target.value);
                  setBulkForm(f => ({ ...f, discount_amount: discount, total_amount: computeDiscountedTotal(listPrice, discount) ?? f.total_amount }));
                }}
                className={inputClass}
                placeholder="Leave blank to leave unchanged"
              />
            </div>
            <div className="col-span-2">
              <label htmlFor="bulk-discount-reason" className="block text-sm font-medium text-dark mb-1">Discount Reason (optional)</label>
              <input
                id="bulk-discount-reason"
                type="text"
                value={bulkForm.discount_reason}
                onChange={ev => setBulkForm(f => ({ ...f, discount_reason: ev.target.value }))}
                className={inputClass}
                placeholder="e.g. repeat customer, referral"
              />
            </div>
            <div className="col-span-2">
              <p className="text-sm text-dark-muted">
                Total Amount: <span className="font-semibold text-dark">{bulkForm.total_amount === '' ? 'Unchanged' : formatPrice(Number(bulkForm.total_amount))}</span>
              </p>
            </div>
          </div>
        ) : (
          <div>
            <label htmlFor="bulk-total-amount" className="block text-sm font-medium text-dark mb-1">Enter Money — Total Amount (₹)</label>
            <input
              id="bulk-total-amount"
              type="number"
              min={0}
              value={bulkForm.total_amount}
              onChange={ev => setBulkForm(f => ({ ...f, total_amount: parseNonNegative(ev.target.value) }))}
              className={inputClass}
              placeholder="Leave blank to leave unchanged"
            />
          </div>
        )}

        <div>
          <label htmlFor="bulk-amount-paid" className="block text-sm font-medium text-dark mb-1">Amount Paid (₹)</label>
          <input
            id="bulk-amount-paid"
            type="number"
            min={0}
            value={bulkForm.amount_paid}
            onChange={ev => setBulkForm(f => ({ ...f, amount_paid: parseNonNegative(ev.target.value) }))}
            aria-invalid={!!overpaid}
            aria-describedby={overpaid ? 'bulk-amount-paid-error' : 'bulk-amount-paid-hint'}
            className={inputClass}
            placeholder="Leave blank to leave unchanged"
          />
          <p id="bulk-amount-paid-hint" className="text-2xs text-dark-muted mt-1">
            Sets the new total collected for every selected enquiry. It replaces the current amount; it is not added to it. Leave blank to keep each as is.
          </p>
          {overpaid && (
            <p id="bulk-amount-paid-error" role="alert" className={errorClass}>
              Amount paid can't exceed the total amount — this would overpay {overpaid.full_name}. Adjust the amount or set a matching total amount for the selection.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="bulk-status" className="block text-sm font-medium text-dark mb-1">Status</label>
          <Select
            inputId="bulk-status"
            value={bulkForm.status}
            onChange={val => setBulkForm(f => ({ ...f, status: val as BulkEditForm['status'] }))}
            options={BULK_STATUS_OPTIONS}
          />
          {bulkForm.status === 'contacted' && (
            <p className="text-2xs text-dark-muted mt-1">
              The Payment popup does not open for bulk updates.
            </p>
          )}
        </div>

        {!hasChanges && (
          <p role="alert" className={errorClass}>Pick at least one field to change before saving — everything is still set to "No change".</p>
        )}

        <div className="flex gap-3 pt-2">
          <Button variant="outline" size="md" className="flex-1 max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            size="md"
            className="flex-1 max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]"
            onClick={onSave}
            loading={bulkSaving}
            disabled={hasBulkErrors}
            title={hasBulkErrors ? 'Fix the highlighted fields before saving' : undefined}
          >
            Bulk Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
