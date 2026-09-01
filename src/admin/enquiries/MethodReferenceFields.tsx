import type { ReactNode } from 'react';
import Select from '../../components/ui/Select';
import { refPlaceholder } from './AdminEnquiryCommon';

// The "method + UTR/reference" pair — a Select (payment or refund method)
// next to a text input that's disabled and cleared whenever "Cash" is
// picked, since cash has no reference number. Repeated, near character-for-
// character, across AdminPaymentModal (payment + refund), AdminEnquiry-
// PaymentModal (payment + refund), and AdminAddEnquiryModal (group + solo
// enquiry payment) — six copies in total. Extracted here; the "clear UTR
// when Cash is selected" behavior stays in each caller's onChange (it's a
// one-line addition to their existing functional state update), so this
// component only owns the shared rendering + the disabled/placeholder
// logic that's purely a function of the current method value.
export default function MethodReferenceFields({
  idPrefix,
  methodLabel,
  utrLabel = 'UTR / Reference',
  value,
  onChange,
  utrValue,
  onUtrChange,
  options,
  utrPlaceholderExample,
  inputClassName,
  selectSize,
  selectPlaceholder = 'Select method',
  methodError,
  utrError,
  errorClassName = 'text-red-500 text-xs mt-1',
}: {
  /** Ids become `${idPrefix}-method` / `${idPrefix}-utr`. */
  idPrefix: string;
  /** Label content for the method field — a plain string, or a string plus a muted suffix note (see AdminAddEnquiryModal's group form). */
  methodLabel: ReactNode;
  utrLabel?: string;
  value: string;
  onChange: (value: string) => void;
  utrValue: string;
  onUtrChange: (value: string) => void;
  options: { value: string; label: string }[];
  /** Sample reference number shown in the placeholder once a non-Cash method is picked, e.g. 'e.g. 426817XXXXXX'. */
  utrPlaceholderExample: string;
  /** Caller-supplied input styling, to preserve each modal's own visual output rather than assuming they match. */
  inputClassName: string;
  selectSize?: 'sm' | 'md';
  selectPlaceholder?: string;
  methodError?: string;
  utrError?: string;
  errorClassName?: string;
}) {
  const methodId = `${idPrefix}-method`;
  const utrId = `${idPrefix}-utr`;
  const isCash = value === 'Cash';

  return (
    <>
      <div>
        <label htmlFor={methodId} className="block text-sm font-medium text-dark mb-1">{methodLabel}</label>
        <Select
          inputId={methodId}
          value={value}
          onChange={onChange}
          options={options}
          placeholder={selectPlaceholder}
          size={selectSize}
        />
        {methodError && <p role="alert" className={errorClassName}>{methodError}</p>}
      </div>
      <div>
        <label htmlFor={utrId} className="block text-sm font-medium text-dark mb-1">{utrLabel}</label>
        <input
          id={utrId}
          type="text"
          value={utrValue}
          disabled={isCash}
          onChange={e => onUtrChange(e.target.value)}
          className={`${inputClassName} ${isCash ? 'opacity-60 cursor-not-allowed' : ''}`}
          placeholder={refPlaceholder(value, utrPlaceholderExample)}
        />
        {utrError && <p role="alert" className={errorClassName}>{utrError}</p>}
      </div>
    </>
  );
}
