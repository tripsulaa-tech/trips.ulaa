import { useEffect, useMemo, useRef, useState } from 'react';
import { buildCalendarGrid, formatDateStr, formatDisplay, isSameDay, parseDateStr } from './dateGrid';
import { useClickOutsideAndEscape } from '@/lib/useClickOutsideAndEscape';

const DAY_HEADERS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTH_LABEL_FMT = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });
const MONTH_SHORT_FMT = new Intl.DateTimeFormat('en-GB', { month: 'short' });
const YEARS_PER_PAGE = 12;

type PickerView = 'days' | 'months' | 'years';

interface DatePickerProps {
  /** 'YYYY-MM-DD', or '' for no date selected. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  /** Shows a "Clear" action in the calendar footer. Default true. */
  clearable?: boolean;
  /** Inclusive bounds, both 'YYYY-MM-DD'. Days outside are shown dimmed and disabled. */
  min?: string;
  max?: string;
  id?: string;
  name?: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
  /** Extra classes merged onto the trigger button (widths, margins, etc — same convention as Dropdown). */
  className?: string;
  style?: React.CSSProperties;
}

/**
 * App-wide themed date picker. Renders a trigger button styled to match
 * Dropdown/SearchableSelect (bg-bg-input / border-border-mid /
 * focus:border-ibm-blue-50) plus an absolutely-positioned calendar panel,
 * instead of the browser's native `<input type="date">`, whose popup
 * calendar can't be restyled and looks inconsistent with the rest of the
 * app (and renders completely differently per-browser/OS). Single source
 * of truth: every date field in the app should use this rather than a raw
 * native date input.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = 'Select date',
  disabled = false,
  required,
  clearable = true,
  min,
  max,
  id,
  name,
  ariaLabel,
  ariaDescribedBy,
  ariaInvalid,
  className = '',
  style,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => parseDateStr(value), [value]);
  const minDate = useMemo(() => parseDateStr(min), [min]);
  const maxDate = useMemo(() => parseDateStr(max), [max]);

  const [viewYear, setViewYear] = useState(() => (selected ?? new Date()).getFullYear());
  const [viewMonth, setViewMonth] = useState(() => (selected ?? new Date()).getMonth());
  const [view, setView] = useState<PickerView>('days');

  // Re-sync the visible month whenever the panel is (re)opened, so it
  // always starts on the selected date (or today, if none) rather than
  // wherever the user last navigated to.
  useEffect(() => {
    if (!open) return;
    const base = selected ?? new Date();
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth());
    setView('days');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useClickOutsideAndEscape(rootRef, open, () => setOpen(false));

  const grid = useMemo(() => buildCalendarGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const today = new Date();

  function isDisabled(d: Date) {
    if (minDate && d < minDate) return true;
    if (maxDate && d > maxDate) return true;
    return false;
  }

  function pick(d: Date) {
    if (isDisabled(d)) return;
    onChange(formatDateStr(d));
    setOpen(false);
  }

  function goMonth(delta: number) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  function goYear(delta: number) {
    setViewYear((y) => y + delta);
  }

  function goYearsPage(delta: number) {
    setViewYear((y) => y + delta * YEARS_PER_PAGE);
  }

  // A month is disabled once every day in it falls outside [min, max] —
  // matches how a whole month renders as unusable in the days grid.
  function isMonthDisabled(y: number, m: number) {
    if (minDate && new Date(y, m + 1, 0) < minDate) return true;
    if (maxDate && new Date(y, m, 1) > maxDate) return true;
    return false;
  }

  function isYearDisabled(y: number) {
    if (minDate && y < minDate.getFullYear()) return true;
    if (maxDate && y > maxDate.getFullYear()) return true;
    return false;
  }

  const yearsPageStart = viewYear - (viewYear % YEARS_PER_PAGE);
  const yearsInPage = Array.from({ length: YEARS_PER_PAGE }, (_, i) => yearsPageStart + i);

  return (
    <div ref={rootRef} className={`relative inline-block ${className}`} style={style}>
      <button
        type="button"
        id={id}
        name={name}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid || undefined}
        aria-required={required || undefined}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-full items-center justify-between gap-1.5 rounded-sm border border-border-mid bg-bg-input px-2 text-left text-xs text-text-primary outline-none focus:border-ibm-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className={`truncate ${!selected ? 'text-text-tertiary' : ''}`}>{selected ? formatDisplay(selected) : placeholder}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="pointer-events-none shrink-0 text-text-tertiary">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div role="dialog" aria-label="Choose date" className="absolute left-0 top-full z-50 mt-1 w-[240px] rounded-sm border border-border-mid bg-bg-ui p-2.5 shadow-lg">
          {view === 'days' && (
            <>
              <div className="mb-1.5 flex items-center justify-between">
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() => goMonth(-1)}
                  className="flex h-6 w-6 items-center justify-center rounded-sm text-text-tertiary hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ibm-blue-50"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="15 18 9 12 15 6" /></svg>
                </button>
                {/* Opens the month grid — the fast path to jump more than a
                    click or two away, instead of stepping one month at a time. */}
                <button
                  type="button"
                  onClick={() => setView('months')}
                  className="rounded-sm px-1.5 py-0.5 text-xs font-semibold text-text-primary hover:bg-bg-hover"
                >
                  {MONTH_LABEL_FMT.format(new Date(viewYear, viewMonth, 1))}
                </button>
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() => goMonth(1)}
                  className="flex h-6 w-6 items-center justify-center rounded-sm text-text-tertiary hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ibm-blue-50"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="9 18 15 12 9 6" /></svg>
                </button>
              </div>

              <div className="grid grid-cols-7 gap-y-0.5 text-center">
                {DAY_HEADERS.map((h) => (
                  <span key={h} className="py-1 text-[10px] font-medium text-text-tertiary">{h}</span>
                ))}
                {grid.map(({ date, inCurrentMonth }) => {
                  const disabledDay = isDisabled(date);
                  const isSelected = selected ? isSameDay(date, selected) : false;
                  const isToday = isSameDay(date, today);
                  return (
                    <button
                      key={date.toISOString()}
                      type="button"
                      disabled={disabledDay}
                      onClick={() => pick(date)}
                      aria-current={isToday ? 'date' : undefined}
                      aria-label={formatDisplay(date)}
                      className={[
                        'mx-auto flex h-7 w-7 items-center justify-center rounded-sm text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ibm-blue-50',
                        disabledDay ? 'cursor-not-allowed text-text-disabled' : 'hover:bg-bg-hover',
                        !disabledDay && !inCurrentMonth ? 'text-text-tertiary' : '',
                        !disabledDay && inCurrentMonth && !isSelected ? 'text-text-primary' : '',
                        isSelected ? 'bg-ibm-blue-50 font-semibold text-text-on-color hover:bg-ibm-blue-50' : '',
                        isToday && !isSelected ? 'font-semibold text-ibm-blue-50 ring-1 ring-inset ring-ibm-blue-50/40' : '',
                      ].join(' ')}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>

              <div className="mt-2 flex items-center justify-between border-t border-border-subtle pt-2">
                <button
                  type="button"
                  onClick={() => pick(today)}
                  disabled={isDisabled(today)}
                  className="text-[11px] font-medium text-ibm-blue-50 hover:opacity-70 disabled:cursor-not-allowed disabled:text-text-disabled disabled:opacity-100"
                >
                  Today
                </button>
                {clearable && (
                  <button
                    type="button"
                    onClick={() => {
                      onChange('');
                      setOpen(false);
                    }}
                    disabled={!selected}
                    className="text-[11px] text-text-tertiary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Clear
                  </button>
                )}
              </div>
            </>
          )}

          {view === 'months' && (
            <>
              <div className="mb-1.5 flex items-center justify-between">
                <button
                  type="button"
                  aria-label="Previous year"
                  onClick={() => goYear(-1)}
                  className="flex h-6 w-6 items-center justify-center rounded-sm text-text-tertiary hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ibm-blue-50"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="15 18 9 12 15 6" /></svg>
                </button>
                {/* Opens the year grid for jumps of more than a year or two. */}
                <button
                  type="button"
                  onClick={() => setView('years')}
                  className="rounded-sm px-1.5 py-0.5 text-xs font-semibold text-text-primary hover:bg-bg-hover"
                >
                  {viewYear}
                </button>
                <button
                  type="button"
                  aria-label="Next year"
                  onClick={() => goYear(1)}
                  className="flex h-6 w-6 items-center justify-center rounded-sm text-text-tertiary hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ibm-blue-50"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="9 18 15 12 9 6" /></svg>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-1">
                {Array.from({ length: 12 }, (_, m) => {
                  const disabledMonth = isMonthDisabled(viewYear, m);
                  const isCurrentSelection = selected ? selected.getFullYear() === viewYear && selected.getMonth() === m : false;
                  const isThisMonth = today.getFullYear() === viewYear && today.getMonth() === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      disabled={disabledMonth}
                      onClick={() => {
                        setViewMonth(m);
                        setView('days');
                      }}
                      className={[
                        'rounded-sm px-2 py-1.5 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ibm-blue-50',
                        disabledMonth ? 'cursor-not-allowed text-text-disabled' : 'hover:bg-bg-hover text-text-primary',
                        isCurrentSelection ? 'bg-ibm-blue-50 font-semibold text-text-on-color hover:bg-ibm-blue-50' : '',
                        isThisMonth && !isCurrentSelection ? 'font-semibold text-ibm-blue-50 ring-1 ring-inset ring-ibm-blue-50/40' : '',
                      ].join(' ')}
                    >
                      {MONTH_SHORT_FMT.format(new Date(viewYear, m, 1))}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {view === 'years' && (
            <>
              <div className="mb-1.5 flex items-center justify-between">
                <button
                  type="button"
                  aria-label="Previous years"
                  onClick={() => goYearsPage(-1)}
                  className="flex h-6 w-6 items-center justify-center rounded-sm text-text-tertiary hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ibm-blue-50"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="15 18 9 12 15 6" /></svg>
                </button>
                <span className="text-xs font-semibold text-text-primary">
                  {yearsInPage[0]} – {yearsInPage[yearsInPage.length - 1]}
                </span>
                <button
                  type="button"
                  aria-label="Next years"
                  onClick={() => goYearsPage(1)}
                  className="flex h-6 w-6 items-center justify-center rounded-sm text-text-tertiary hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ibm-blue-50"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="9 18 15 12 9 6" /></svg>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-1">
                {yearsInPage.map((y) => {
                  const disabledYear = isYearDisabled(y);
                  const isCurrentSelection = selected ? selected.getFullYear() === y : false;
                  const isThisYear = today.getFullYear() === y;
                  return (
                    <button
                      key={y}
                      type="button"
                      disabled={disabledYear}
                      onClick={() => {
                        setViewYear(y);
                        setView('months');
                      }}
                      className={[
                        'rounded-sm px-2 py-1.5 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ibm-blue-50',
                        disabledYear ? 'cursor-not-allowed text-text-disabled' : 'hover:bg-bg-hover text-text-primary',
                        isCurrentSelection ? 'bg-ibm-blue-50 font-semibold text-text-on-color hover:bg-ibm-blue-50' : '',
                        isThisYear && !isCurrentSelection ? 'font-semibold text-ibm-blue-50 ring-1 ring-inset ring-ibm-blue-50/40' : '',
                      ].join(' ')}
                    >
                      {y}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
