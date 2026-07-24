import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption<T extends string | number = string> {
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
}

export default function Select<T extends string | number = string>({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  size = 'md',
  className = '',
  disabled = false,
}: SelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, openUp: false });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find(o => o.value === value);

  const sizeClasses = size === 'sm'
    ? 'px-3 py-1.5 text-xs'
    : 'px-3 py-2 text-sm';

  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const maxListHeight = 240;
    const openUp = spaceBelow < maxListHeight && spaceAbove > spaceBelow;
    setCoords({
      top: openUp ? rect.top : rect.bottom,
      left: rect.left,
      width: rect.width,
      openUp,
    });
  };

  useLayoutEffect(() => {
    if (isOpen) updatePosition();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleScrollResize = () => updatePosition();
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('scroll', handleScrollResize, true);
    window.addEventListener('resize', handleScrollResize);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('scroll', handleScrollResize, true);
      window.removeEventListener('resize', handleScrollResize);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(o => !o)}
        className={`w-full flex items-center justify-between gap-2 rounded-xl border-2 border-background-warm bg-background font-body text-dark text-left outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isOpen ? 'border-primary' : 'hover:border-primary/50'} ${sizeClasses} ${className}`}
      >
        <span className={selected ? '' : 'text-dark-muted'}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={16} className={`shrink-0 text-dark-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && createPortal(
        <ul
          ref={listRef}
          style={{
            position: 'fixed',
            top: coords.openUp ? undefined : coords.top + 4,
            bottom: coords.openUp ? window.innerHeight - coords.top + 4 : undefined,
            left: coords.left,
            width: coords.width,
            maxHeight: 240,
          }}
          className="z-[100] overflow-auto app-scroll rounded-xl border-2 border-background-warm bg-white shadow-warm-lg py-1"
        >
          {options.map(opt => (
            <li key={String(opt.value)}>
              <button
                type="button"
                onClick={() => { onChange(opt.value); setIsOpen(false); }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left font-body transition-colors hover:bg-background-warm ${opt.value === value ? 'text-primary font-semibold' : 'text-dark'}`}
              >
                {opt.label}
                {opt.value === value && <Check size={14} className="shrink-0" />}
              </button>
            </li>
          ))}
        </ul>,
        document.body
      )}
    </>
  );
}
