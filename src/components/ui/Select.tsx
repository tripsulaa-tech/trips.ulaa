import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  CaretDown as ChevronDown,
  Check,
} from '@phosphor-icons/react';
import { useCloseOnOutsideClick } from '../../hooks/useCloseOnOutsideClick';
import { useDropdownPosition } from '../../hooks/useDropdownPosition';

interface SelectOption<T extends string | number = string> {
  value: T;
  label: string;
}

interface SelectProps<T extends string | number = string> {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  size?: 'sm' | 'md';
  className?: string;
  disabled?: boolean;
  inputId?: string;
}

export default function Select<T extends string | number = string>({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  size = 'md',
  className = '',
  disabled = false,
  inputId,
}: SelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const coords = useDropdownPosition(triggerRef, isOpen, 240);

  const selected = options.find(o => o.value === value);

  const sizeClasses = size === 'sm'
    ? 'px-3 py-1.5 text-xs'
    : 'px-3 py-2 text-sm';

  useCloseOnOutsideClick(isOpen, [triggerRef, listRef], () => setIsOpen(false), { escape: true });

  return (
    <>
      <button
        ref={triggerRef}
        id={inputId}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(o => !o)}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`w-full flex items-center justify-between gap-2 rounded-md border-2 border-background-warm bg-background font-body text-dark text-left outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isOpen ? 'border-primary' : 'hover:border-primary/50'} ${sizeClasses} ${className}`}
      >
        <span className={selected ? '' : 'text-dark-muted'}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={16} className={`shrink-0 text-dark-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {isOpen && createPortal(
        <ul
          ref={listRef}
          role="listbox"
          style={{
            position: 'fixed',
            top: coords.openUp ? undefined : coords.top + 4,
            bottom: coords.openUp ? window.innerHeight - coords.top + 4 : undefined,
            left: coords.left,
            width: coords.width,
            maxHeight: 240,
          }}
          className="z-[100] overflow-auto app-scroll rounded-md border-2 border-background-warm bg-white shadow-warm-lg py-1"
        >
          {options.map(opt => (
            <li key={String(opt.value)} role="option" aria-selected={opt.value === value}>
              <button
                type="button"
                onClick={() => { onChange(opt.value); setIsOpen(false); }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left font-body transition-colors hover:bg-background-warm ${opt.value === value ? 'text-primary font-semibold' : 'text-dark'}`}
              >
                {opt.label}
                {opt.value === value && <Check size={14} className="shrink-0" aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>,
        document.body
      )}
    </>
  );
}
