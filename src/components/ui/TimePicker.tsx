import { useRef, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Clock, X } from '@phosphor-icons/react';
import { useCloseOnOutsideClick } from '../../hooks/useCloseOnOutsideClick';
import { useDropdownPosition } from '../../hooks/useDropdownPosition';

interface TimePickerProps {
  value: string; // 'HH:MM' 24-hour, or ''
  onChange: (value: string) => void;
  placeholder?: string;
  size?: 'sm' | 'md';
  className?: string;
  disabled?: boolean;
  id?: string;
}

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // 0,5,...,55

function parseValue(value: string): { hour12: number; minute: number; period: 'AM' | 'PM' } | null {
  if (!value) return null;
  const [hStr, mStr] = value.split(':');
  const h24 = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h24) || Number.isNaN(m)) return null;
  const period: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM';
  const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { hour12, minute: m, period };
}

function toValue(hour12: number, minute: number, period: 'AM' | 'PM'): string {
  let h24 = hour12 % 12;
  if (period === 'PM') h24 += 12;
  return `${String(h24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function formatDisplay(value: string): string {
  const parsed = parseValue(value);
  if (!parsed) return '';
  return `${parsed.hour12}:${String(parsed.minute).padStart(2, '0')} ${parsed.period}`;
}

// Themed replacement for the browser's native <input type="time"> — same
// trigger/portal/panel structure as DatePicker (shared positioning/outside-
// click hooks) so the two look and behave like one family instead of a
// custom date field next to raw OS chrome for time. 5-minute increments,
// same as most booking-flow time pickers, to keep the minute column short
// rather than listing all 60.
export default function TimePicker({
  value,
  onChange,
  placeholder = 'Select time',
  size = 'md',
  className = '',
  disabled = false,
  id,
}: TimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const parsed = parseValue(value);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hourListRef = useRef<HTMLDivElement>(null);
  const minuteListRef = useRef<HTMLDivElement>(null);

  const sizeClasses = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-3 py-2 text-sm';
  const coords = useDropdownPosition(triggerRef, isOpen, 240);

  useCloseOnOutsideClick(isOpen, [triggerRef, panelRef], () => setIsOpen(false), { escape: true });

  // Scroll the currently-selected hour/minute into view each time the
  // panel opens, same as a native picker would — otherwise a time like
  // 9:40 PM opens scrolled to the top of each column.
  useLayoutEffect(() => {
    if (!isOpen) return;
    const hour12 = parsed?.hour12 ?? 12;
    const minute = parsed?.minute ?? 0;
    const hourEl = hourListRef.current?.querySelector<HTMLElement>(`[data-hour="${hour12}"]`);
    hourEl?.scrollIntoView({ block: 'center' });
    const minuteEl = minuteListRef.current?.querySelector<HTMLElement>(`[data-minute="${minute}"]`);
    minuteEl?.scrollIntoView({ block: 'center' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const setHour = (hour12: number) => onChange(toValue(hour12, parsed?.minute ?? 0, parsed?.period ?? 'AM'));
  const setMinute = (minute: number) => onChange(toValue(parsed?.hour12 ?? 12, minute, parsed?.period ?? 'AM'));
  const setPeriod = (period: 'AM' | 'PM') => onChange(toValue(parsed?.hour12 ?? 12, parsed?.minute ?? 0, period));
  const setNow = () => {
    const now = new Date();
    const h24 = now.getHours();
    const period: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM';
    const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
    onChange(toValue(hour12, now.getMinutes() - (now.getMinutes() % 5), period));
    setIsOpen(false);
  };

  return (
    <>
      <span
        onClick={() => !disabled && setIsOpen(o => !o)}
        className={`relative w-full flex items-center gap-2 rounded-lg border-2 bg-background text-dark cursor-pointer ${isOpen ? 'border-primary' : 'border-background-warm hover:border-primary/50'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${sizeClasses} ${className}`}
      >
        <button
          ref={triggerRef}
          id={id}
          type="button"
          disabled={disabled}
          onClick={(e) => { e.stopPropagation(); setIsOpen(o => !o); }}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          className={`flex-1 min-w-0 text-left outline-none disabled:cursor-not-allowed ${value ? '' : 'text-dark-muted'}`}
        >
          {value ? formatDisplay(value) : placeholder}
        </button>
        <span className="flex items-center gap-1 shrink-0">
          {value && !disabled && (
            <button
              type="button"
              aria-label="Clear time"
              onClick={(e) => { e.stopPropagation(); onChange(''); }}
              className="rounded-full p-0.5 text-dark-muted hover:text-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
          <Clock size={15} className="text-dark-muted" aria-hidden="true" />
        </span>
      </span>

      {isOpen && createPortal(
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            top: coords.openUp ? undefined : coords.top + 4,
            bottom: coords.openUp ? window.innerHeight - coords.top + 4 : undefined,
            left: coords.left,
          }}
          className="z-[100] w-48 rounded-lg border-2 border-background-warm bg-white shadow-warm-lg p-2"
        >
          <div className="grid grid-cols-3 gap-1">
            <div ref={hourListRef} className="h-40 overflow-y-auto pr-0.5 scroll-smooth">
              {HOURS_12.map(h => {
                const active = parsed?.hour12 === h;
                return (
                  <button
                    key={h}
                    type="button"
                    data-hour={h}
                    onClick={() => setHour(h)}
                    className={`w-full h-8 rounded-md text-xs font-body transition-colors flex items-center justify-center
                      ${active ? 'bg-primary text-white font-semibold' : 'text-dark hover:bg-background-warm'}`}
                  >
                    {String(h).padStart(2, '0')}
                  </button>
                );
              })}
            </div>
            <div ref={minuteListRef} className="h-40 overflow-y-auto pr-0.5 scroll-smooth">
              {MINUTES.map(m => {
                const active = parsed?.minute === m;
                return (
                  <button
                    key={m}
                    type="button"
                    data-minute={m}
                    onClick={() => setMinute(m)}
                    className={`w-full h-8 rounded-md text-xs font-body transition-colors flex items-center justify-center
                      ${active ? 'bg-primary text-white font-semibold' : 'text-dark hover:bg-background-warm'}`}
                  >
                    {String(m).padStart(2, '0')}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-col gap-1">
              {(['AM', 'PM'] as const).map(p => {
                const active = (parsed?.period ?? 'AM') === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriod(p)}
                    className={`w-full h-8 rounded-md text-xs font-body font-semibold transition-colors flex items-center justify-center
                      ${active ? 'bg-primary text-white' : 'text-dark hover:bg-background-warm'}`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex mt-2 pt-2 border-t border-background-warm">
            <button
              type="button"
              onClick={setNow}
              className="text-[11px] font-body px-2 py-1 rounded-md bg-background-warm/60 text-dark-muted hover:text-dark hover:bg-background-warm transition-colors"
            >
              Now
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
