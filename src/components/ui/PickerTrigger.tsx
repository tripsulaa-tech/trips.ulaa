import type { ReactNode, RefObject } from 'react';
import { X } from '@phosphor-icons/react';

interface PickerTriggerProps {
  id?: string;
  disabled?: boolean;
  isOpen: boolean;
  onToggle: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  /** Formatted value shown when `hasValue` is true (ignored otherwise). */
  displayValue: string;
  hasValue: boolean;
  placeholder: string;
  onClear: () => void;
  clearLabel: string;
  /** Trailing icon — e.g. a Calendar or Clock glyph. */
  icon: ReactNode;
  sizeClasses: string;
  className: string;
}

/**
 * The clickable trigger shell shared by DatePicker and TimePicker: the
 * formatted-value/placeholder button, an optional clear button, and a
 * trailing icon, all wrapped in the bordered pill that opens each
 * picker's popover. Previously copy-pasted identically (same classNames)
 * between the two components; only the icon and clear-button label differ.
 */
export function PickerTrigger({
  id,
  disabled = false,
  isOpen,
  onToggle,
  triggerRef,
  displayValue,
  hasValue,
  placeholder,
  onClear,
  clearLabel,
  icon,
  sizeClasses,
  className,
}: PickerTriggerProps) {
  return (
    <span
      onClick={() => !disabled && onToggle()}
      className={`relative w-full flex items-center gap-2 rounded-lg border-2 bg-background text-dark cursor-pointer ${isOpen ? 'border-primary' : 'border-background-warm hover:border-primary/50'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${sizeClasses} ${className}`}
    >
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className={`flex-1 min-w-0 text-left outline-none disabled:cursor-not-allowed ${hasValue ? '' : 'text-dark-muted'}`}
      >
        {hasValue ? displayValue : placeholder}
      </button>
      <span className="flex items-center gap-1 shrink-0">
        {hasValue && !disabled && (
          <button
            type="button"
            aria-label={clearLabel}
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            className="rounded-full p-0.5 text-dark-muted hover:text-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
        {icon}
      </span>
    </span>
  );
}
