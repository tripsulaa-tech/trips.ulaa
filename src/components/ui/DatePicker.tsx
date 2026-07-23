import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X } from 'lucide-react';

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

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function clampToRange(date: Date, minDate: Date | null, maxDate: Date | null): Date {
  if (minDate && date < minDate) return minDate;
  if (maxDate && date > maxDate) return maxDate;
  return date;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = Array.from({ length: 12 }, (_, i) =>
  new Date(2000, i, 1).toLocaleDateString('en-IN', { month: 'short' })
);

type ViewMode = 'days' | 'months' | 'years';

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
  const [viewMode, setViewMode] = useState<ViewMode>('days');
  const [yearRangeStart, setYearRangeStart] = useState(() => Math.floor(new Date().getFullYear() / 12) * 12);
  const selectedDate = toDateOnly(value);
  const [viewDate, setViewDate] = useState(() => selectedDate || new Date());
  const [focusedDate, setFocusedDate] = useState(() => selectedDate || new Date());
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const minDate = min ? toDateOnly(min) : null;
  const maxDate = max ? toDateOnly(max) : null;

  const sizeClasses = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-3 py-2 text-sm';

  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const panelHeight = 380;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUp = spaceBelow < panelHeight && spaceAbove > spaceBelow;
    setCoords({ top: openUp ? rect.top : rect.bottom, left: rect.left, openUp });
  };

  useLayoutEffect(() => {
    if (isOpen) {
      const base = selectedDate || new Date();
      setViewDate(base);
      setFocusedDate(base);
      setViewMode('days');
      setYearRangeStart(Math.floor(base.getFullYear() / 12) * 12);
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

  const selectDate = (date: Date) => {
    if (isDisabled(date)) return;
    onChange(toISO(date));
    setIsOpen(false);
  };

  const goToMonth = (date: Date) => {
    setViewDate(date);
    setFocusedDate(prev => new Date(date.getFullYear(), date.getMonth(), Math.min(prev.getDate(), new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate())));
  };

  // Keyboard navigation across the day grid
  const handleGridKeyDown = (e: React.KeyboardEvent) => {
    if (viewMode !== 'days') return;
    let next: Date | null = null;
    switch (e.key) {
      case 'ArrowLeft': next = addDays(focusedDate, -1); break;
      case 'ArrowRight': next = addDays(focusedDate, 1); break;
      case 'ArrowUp': next = addDays(focusedDate, -7); break;
      case 'ArrowDown': next = addDays(focusedDate, 7); break;
      case 'PageUp': next = new Date(focusedDate.getFullYear(), focusedDate.getMonth() - 1, focusedDate.getDate()); break;
      case 'PageDown': next = new Date(focusedDate.getFullYear(), focusedDate.getMonth() + 1, focusedDate.getDate()); break;
      case 'Home': next = new Date(focusedDate.getFullYear(), focusedDate.getMonth(), 1); break;
      case 'End': next = new Date(focusedDate.getFullYear(), focusedDate.getMonth() + 1, 0); break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        selectDate(focusedDate);
        return;
      default:
        return;
    }
    e.preventDefault();
    const clamped = clampToRange(next, minDate, maxDate);
    setFocusedDate(clamped);
    if (clamped.getMonth() !== viewDate.getMonth() || clamped.getFullYear() !== viewDate.getFullYear()) {
      setViewDate(new Date(clamped.getFullYear(), clamped.getMonth(), 1));
    }
  };

  useEffect(() => {
    if (isOpen && viewMode === 'days') {
      gridRef.current?.focus();
    }
  }, [isOpen, viewMode, viewDate]);

  // Quick presets, relative to today, clamped to allowed range
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const presets: { label: string; date: Date }[] = [
    { label: 'Today', date: today },
    { label: 'Tomorrow', date: addDays(today, 1) },
    { label: '+1 Week', date: addDays(today, 7) },
    { label: '+1 Month', date: new Date(today.getFullYear(), today.getMonth() + 1, today.getDate()) },
  ];
  const isPresetDisabled = (date: Date) => isDisabled(date);

  const yearsInRange = Array.from({ length: 12 }, (_, i) => yearRangeStart + i);

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
          {viewMode === 'days' && (
            <>
              <div className="flex items-center justify-between mb-2">
                <button
                  type="button"
                  onClick={() => goToMonth(new Date(year - 1, month, 1))}
                  className="p-1.5 rounded-lg hover:bg-background-warm text-dark-muted hover:text-dark transition-colors"
                  aria-label="Previous year"
                >
                  <ChevronsLeft size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => goToMonth(new Date(year, month - 1, 1))}
                  className="p-1.5 rounded-lg hover:bg-background-warm text-dark-muted hover:text-dark transition-colors"
                  aria-label="Previous month"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('months')}
                  className="font-body text-sm font-semibold text-dark px-2 py-0.5 rounded-lg hover:bg-background-warm transition-colors"
                >
                  {viewDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                </button>
                <button
                  type="button"
                  onClick={() => goToMonth(new Date(year, month + 1, 1))}
                  className="p-1.5 rounded-lg hover:bg-background-warm text-dark-muted hover:text-dark transition-colors"
                  aria-label="Next month"
                >
                  <ChevronRight size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => goToMonth(new Date(year + 1, month, 1))}
                  className="p-1.5 rounded-lg hover:bg-background-warm text-dark-muted hover:text-dark transition-colors"
                  aria-label="Next year"
                >
                  <ChevronsRight size={14} />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 mb-1">
                {WEEKDAYS.map(w => (
                  <div key={w} className="text-center text-[11px] font-semibold text-dark-muted py-1">
                    {w}
                  </div>
                ))}
              </div>

              <div
                ref={gridRef}
                tabIndex={0}
                onKeyDown={handleGridKeyDown}
                className="grid grid-cols-7 gap-1 outline-none"
              >
                {cells.map((date, i) => {
                  if (!date) return <div key={`empty-${i}`} />;
                  const disabledDay = isDisabled(date);
                  const active = selectedDate ? isSameDay(date, selectedDate) : false;
                  const isToday = isSameDay(date, today);
                  const isFocused = isSameDay(date, focusedDate);
                  return (
                    <button
                      key={date.toISOString()}
                      type="button"
                      disabled={disabledDay}
                      onClick={() => selectDate(date)}
                      onFocus={() => setFocusedDate(date)}
                      className={`h-8 w-8 rounded-lg text-xs font-body transition-colors flex items-center justify-center
                        ${active ? 'bg-primary text-white font-semibold' : 'text-dark hover:bg-background-warm'}
                        ${disabledDay ? 'opacity-30 cursor-not-allowed hover:bg-transparent' : ''}
                        ${!active && isToday ? 'ring-1 ring-primary/50' : ''}
                        ${!active && isFocused ? 'ring-2 ring-primary' : ''}`}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-background-warm">
                {presets.map(p => (
                  <button
                    key={p.label}
                    type="button"
                    disabled={isPresetDisabled(p.date)}
                    onClick={() => selectDate(p.date)}
                    className="text-[11px] font-body px-2 py-1 rounded-lg bg-background-warm/60 text-dark-muted hover:text-dark hover:bg-background-warm transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {viewMode === 'months' && (
            <>
              <div className="flex items-center justify-between mb-2">
                <button
                  type="button"
                  onClick={() => setViewDate(new Date(year - 1, month, 1))}
                  className="p-1.5 rounded-lg hover:bg-background-warm text-dark-muted hover:text-dark transition-colors"
                  aria-label="Previous year"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('years')}
                  className="font-body text-sm font-semibold text-dark px-2 py-0.5 rounded-lg hover:bg-background-warm transition-colors"
                >
                  {year}
                </button>
                <button
                  type="button"
                  onClick={() => setViewDate(new Date(year + 1, month, 1))}
                  className="p-1.5 rounded-lg hover:bg-background-warm text-dark-muted hover:text-dark transition-colors"
                  aria-label="Next year"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {MONTH_NAMES.map((name, i) => {
                  const monthDisabled =
                    (minDate && new Date(year, i + 1, 0) < minDate) ||
                    (maxDate && new Date(year, i, 1) > maxDate);
                  const isCurrent = i === month;
                  return (
                    <button
                      key={name}
                      type="button"
                      disabled={!!monthDisabled}
                      onClick={() => { goToMonth(new Date(year, i, 1)); setViewMode('days'); }}
                      className={`py-2 rounded-lg text-xs font-body transition-colors
                        ${isCurrent ? 'bg-primary text-white font-semibold' : 'text-dark hover:bg-background-warm'}
                        ${monthDisabled ? 'opacity-30 cursor-not-allowed hover:bg-transparent' : ''}`}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {viewMode === 'years' && (
            <>
              <div className="flex items-center justify-between mb-2">
                <button
                  type="button"
                  onClick={() => setYearRangeStart(y => y - 12)}
                  className="p-1.5 rounded-lg hover:bg-background-warm text-dark-muted hover:text-dark transition-colors"
                  aria-label="Previous years"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="font-body text-sm font-semibold text-dark">
                  {yearRangeStart} – {yearRangeStart + 11}
                </span>
                <button
                  type="button"
                  onClick={() => setYearRangeStart(y => y + 12)}
                  className="p-1.5 rounded-lg hover:bg-background-warm text-dark-muted hover:text-dark transition-colors"
                  aria-label="Next years"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {yearsInRange.map(y => {
                  const yearDisabled =
                    (minDate && y < minDate.getFullYear()) ||
                    (maxDate && y > maxDate.getFullYear());
                  const isCurrent = y === year;
                  return (
                    <button
                      key={y}
                      type="button"
                      disabled={!!yearDisabled}
                      onClick={() => { setViewDate(new Date(y, month, 1)); setViewMode('months'); }}
                      className={`py-2 rounded-lg text-xs font-body transition-colors
                        ${isCurrent ? 'bg-primary text-white font-semibold' : 'text-dark hover:bg-background-warm'}
                        ${yearDisabled ? 'opacity-30 cursor-not-allowed hover:bg-transparent' : ''}`}
                    >
                      {y}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
