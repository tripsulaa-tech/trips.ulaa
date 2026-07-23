import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';

interface DatePickerProps {
  value: string; // 'YYYY-MM-DD' or ''
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  size?: 'sm' | 'md';
  className?: string;
  disabled?: boolean;
}

function toDateOnly(iso: string): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function toISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDisplay(iso: string): string {
  const date = toDateOnly(iso);
  if (!date) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export default function DatePicker({
  value,
  onChange,
  min,
  max,
  placeholder = 'Select date',
  size = 'md',
  className = '',
  disabled = false,
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, openUp: false });
  const selectedDate = toDateOnly(value);
  const [viewDate, setViewDate] = useState(() => selectedDate || new Date());
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const minDate = min ? toDateOnly(min) : null;
  const maxDate = max ? toDateOnly(max) : null;

  const sizeClasses = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-3 py-2 text-sm';

  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const panelHeight = 320;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUp = spaceBelow < panelHeight && spaceAbove > spaceBelow;
    setCoords({ top: openUp ? rect.top : rect.bottom, left: rect.left, openUp });
  };

  useLayoutEffect(() => {
    if (isOpen) {
      setViewDate(selectedDate || new Date());
      updatePosition();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleScrollResize = () => updatePosition();
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
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

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const isDisabled = (date: Date) => {
    if (minDate && date < minDate) return true;
    if (maxDate && date > maxDate) return true;
    return false;
  };

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(o => !o)}
        className={`w-full flex items-center justify-between gap-2 rounded-xl border-2 border-background-warm bg-background font-body text-dark text-left outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isOpen ? 'border-primary' : 'hover:border-primary/50'} ${sizeClasses} ${className}`}
      >
        <span className={value ? '' : 'text-dark-muted'}>
          {value ? formatDisplay(value) : placeholder}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {value && (
            <X
              size={14}
              className="text-dark-muted hover:text-dark"
              onClick={(e) => { e.stopPropagation(); onChange(''); }}
            />
          )}
          <Calendar size={15} className="text-dark-muted" />
        </span>
      </button>

      {isOpen && createPortal(
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            top: coords.openUp ? undefined : coords.top + 4,
            bottom: coords.openUp ? window.innerHeight - coords.top + 4 : undefined,
            left: coords.left,
          }}
          className="z-[100] w-64 rounded-xl border-2 border-background-warm bg-white shadow-warm-lg p-3"
        >
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setViewDate(new Date(year, month - 1, 1))}
              className="p-1.5 rounded-lg hover:bg-background-warm text-dark-muted hover:text-dark transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="font-body text-sm font-semibold text-dark">
              {viewDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
            </span>
            <button
              type="button"
              onClick={() => setViewDate(new Date(year, month + 1, 1))}
              className="p-1.5 rounded-lg hover:bg-background-warm text-dark-muted hover:text-dark transition-colors"
              aria-label="Next month"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map(w => (
              <div key={w} className="text-center text-[11px] font-semibold text-dark-muted py-1">
                {w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((date, i) => {
              if (!date) return <div key={`empty-${i}`} />;
              const disabledDay = isDisabled(date);
              const active = selectedDate ? isSameDay(date, selectedDate) : false;
              const today = isSameDay(date, new Date());
              return (
                <button
                  key={date.toISOString()}
                  type="button"
                  disabled={disabledDay}
                  onClick={() => { onChange(toISO(date)); setIsOpen(false); }}
                  className={`h-8 w-8 rounded-lg text-xs font-body transition-colors flex items-center justify-center
                    ${active ? 'bg-primary text-white font-semibold' : 'text-dark hover:bg-background-warm'}
                    ${disabledDay ? 'opacity-30 cursor-not-allowed hover:bg-transparent' : ''}
                    ${!active && today ? 'ring-1 ring-primary/50' : ''}`}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
