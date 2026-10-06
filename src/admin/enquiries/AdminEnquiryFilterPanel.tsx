import { useState, useEffect, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowsClockwise as RefreshCw,
  CaretDown as ChevronDown,
  ChatCircle as MessageCircle,
  CalendarDot as CalendarClock,
  SlidersHorizontal,
  X,
} from '@phosphor-icons/react';
import FilterDropdown from './AdminFilterDropdown';

// Filter panel for the admin Enquiries page, with two layouts:
//
//  - Desktop / tablet (sm and up): the original single row of labelled
//    dropdowns (Trip, Lead Status, Booking Journey, Payment, Booking, Group,
//    Food, Package, Source) plus the General Enquiries / Follow-ups Due
//    toggles and Clear All.
//  - Phone (below sm): Trip + a "Filters" button, a scrolling row of quick
//    chips (Booked, Not booked, Unpaid, Partial, Follow-ups due), removable
//    chips for whatever is applied, and a bottom sheet holding every filter
//    with a sticky footer: Clear + "Show N results". Changes apply live so the
//    count on that button is always accurate.

type Option<T extends string> = { key: T; label: string; count: number; icon?: ReactNode };

type ActiveChip = { id: string; label: string; clear: () => void };

type FilterSet<T extends string> = {
  value: T;
  onChange: (v: T) => void;
  options: Option<T>[];
};

export interface AdminEnquiryFilterPanelProps {
  trip: {
    selectedKey: string | null;
    selectedLabel: string | null;
    onSelect: (key: string | null) => void;
    options: { key: string; label: string; count: number; section?: string }[];
    generalKey: string;
    generalCount: number;
  };
  booking: FilterSet<string>;
  payment: FilterSet<string>;
  followUp: { active: boolean; count: number; onToggle: () => void };
  leadStatus: FilterSet<string>;
  journey: FilterSet<string>;
  group: FilterSet<string>;
  food: FilterSet<string>;
  pkg: FilterSet<string>;
  source: FilterSet<string>;
  searchQuery: string;
  onClearSearch: () => void;
  activeCount: number;
  onClearAll: () => void;
  shownCount: number;
  totalCount: number;
}

function Chip({
  selected, onClick, count, children, dim = false, className = '', tall = false,
}: {
  selected: boolean;
  onClick: () => void;
  count?: number;
  children: ReactNode;
  dim?: boolean;
  className?: string;
  /** 40px tall on desktop, to line up with the Trip select and More filters button. */
  tall?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`inline-flex shrink-0 items-center gap-1.5 h-9 ${tall ? 'sm:h-10' : 'sm:h-8'} px-3 rounded-lg border-2 text-xs font-button font-semibold whitespace-nowrap transition-colors ${
        selected
          ? 'bg-primary text-white border-primary'
          : `bg-white border-background-warm hover:border-primary/40 ${className || 'text-dark'} ${dim ? 'opacity-50' : ''}`
      }`}
    >
      {children}
      {count !== undefined && (
        <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-2xs ${
          selected ? 'bg-white/25' : 'bg-background-warm text-dark-muted'
        }`}>
          {count}
        </span>
      )}
    </button>
  );
}

function Group({
  label, set, scroll = false, wide = false,
}: {
  label: string;
  set: FilterSet<string>;
  /** Long option lists scroll sideways on phones instead of wrapping to many rows. */
  scroll?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={`min-w-0 ${wide ? 'sm:basis-full' : ''}`}>
      <p className="text-2xs font-button font-bold text-dark-muted uppercase tracking-wide mb-1.5">{label}</p>
      <div
        role="group"
        aria-label={label}
        className={`flex gap-1.5 ${
          scroll
            ? 'overflow-x-auto sm:overflow-visible sm:flex-wrap -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 [scrollbar-width:none]'
            : 'flex-wrap'
        }`}
      >
        {set.options.map(opt => {
          const selected = set.value === opt.key;
          return (
            <Chip
              key={opt.key}
              selected={selected}
              count={opt.count}
              dim={opt.count === 0 && opt.key !== 'all'}
              className={opt.key === 'veg' ? 'text-green-700' : opt.key === 'non_veg' ? 'text-red-700' : undefined}
              // Tapping the active chip again resets that filter to "All".
              onClick={() => set.onChange(selected && opt.key !== 'all' ? 'all' : opt.key)}
            >
              {opt.icon}
              {opt.label}
            </Chip>
          );
        })}
      </div>
    </div>
  );
}

/** Desktop filter box in the original style: label on top, a button showing the
 *  current value, and a dropdown list of options with counts underneath. */
function DeskField({
  id, label, value, display, options, onSelect, open, onToggle, className = '', align = 'left',
}: {
  id: string;
  label: string;
  value: string;
  display: string;
  options: { key: string; label: string; count: number; section?: string }[];
  onSelect: (key: string) => void;
  open: boolean;
  onToggle: () => void;
  className?: string;
  align?: 'left' | 'right';
}) {
  return (
    <div className={`relative w-auto ${className}`}>
      <label htmlFor={id} className="block text-2xs font-button font-bold text-dark-muted uppercase tracking-wide mb-1">{label}</label>
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={onToggle}
        className={`w-full flex items-center justify-between gap-2 rounded border-2 px-3 py-2 bg-white transition-colors ${
          open ? 'border-primary/50' : 'border-background-warm hover:border-primary/30'
        }`}
      >
        <span className="text-sm font-button font-medium text-primary truncate">{display}</span>
        <ChevronDown size={14} className={`text-dark-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && <FilterDropdown align={align} value={value} onSelect={onSelect} options={options} />}
    </div>
  );
}

function labelOf(set: FilterSet<string>): string {
  return set.options.find(o => o.key === set.value)?.label ?? set.value;
}

export default function AdminEnquiryFilterPanel(p: AdminEnquiryFilterPanelProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tripOpen, setTripOpen] = useState(false);

  const secondaryActiveCount =
    (p.leadStatus.value !== 'all' ? 1 : 0) + (p.journey.value !== 'all' ? 1 : 0) +
    (p.group.value !== 'all' ? 1 : 0) + (p.food.value !== 'all' ? 1 : 0) +
    (p.pkg.value !== 'all' ? 1 : 0) + (p.source.value !== 'all' ? 1 : 0);
  // Filters that live inside the phone sheet (everything except Trip and search,
  // which stay on the page).
  const sheetActiveCount =
    secondaryActiveCount + (p.booking.value !== 'all' ? 1 : 0) + (p.payment.value !== 'all' ? 1 : 0) + (p.followUp.active ? 1 : 0);
  // Desktop: which single filter dropdown is open (only one at a time).
  const [openDesk, setOpenDesk] = useState<string | null>(null);

  // Phone sheet: lock page scroll behind it and close on Escape.
  useEffect(() => {
    if (!sheetOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setSheetOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [sheetOpen]);

  const clearSheetFilters = () => {
    p.booking.onChange('all');
    p.payment.onChange('all');
    if (p.followUp.active) p.followUp.onToggle();
    p.leadStatus.onChange('all');
    p.journey.onChange('all');
    p.group.onChange('all');
    p.food.onChange('all');
    p.pkg.onChange('all');
    p.source.onChange('all');
  };

  const countOf = (set: FilterSet<string>, key: string) => set.options.find(o => o.key === key)?.count ?? 0;

  const trimmedSearch = p.searchQuery.trim();
  const candidates: (ActiveChip | false)[] = [
    p.trip.selectedKey !== null && {
      id: 'trip', label: p.trip.selectedLabel ?? 'Trip', clear: () => p.trip.onSelect(null),
    },
    p.booking.value !== 'all' && { id: 'booking', label: labelOf(p.booking), clear: () => p.booking.onChange('all') },
    p.payment.value !== 'all' && { id: 'payment', label: labelOf(p.payment), clear: () => p.payment.onChange('all') },
    p.followUp.active && { id: 'followup', label: 'Follow-ups due', clear: p.followUp.onToggle },
    p.leadStatus.value !== 'all' && { id: 'lead', label: `Lead: ${labelOf(p.leadStatus)}`, clear: () => p.leadStatus.onChange('all') },
    p.journey.value !== 'all' && { id: 'journey', label: labelOf(p.journey), clear: () => p.journey.onChange('all') },
    p.group.value !== 'all' && { id: 'group', label: labelOf(p.group), clear: () => p.group.onChange('all') },
    p.food.value !== 'all' && { id: 'food', label: labelOf(p.food), clear: () => p.food.onChange('all') },
    p.pkg.value !== 'all' && { id: 'pkg', label: labelOf(p.pkg), clear: () => p.pkg.onChange('all') },
    p.source.value !== 'all' && { id: 'source', label: `Source: ${labelOf(p.source)}`, clear: () => p.source.onChange('all') },
    trimmedSearch !== '' && { id: 'search', label: `Search: “${trimmedSearch}”`, clear: p.onClearSearch },
  ];
  const activeChips = candidates.filter((c): c is ActiveChip => c !== false);

  const tripDropdown = (id: string, open: boolean, setOpen: (v: boolean | ((o: boolean) => boolean)) => void, widthClass: string) => (
    <div className={`relative w-full ${widthClass}`}>
      <label htmlFor={id} className="block text-2xs font-button font-bold text-dark-muted uppercase tracking-wide mb-1.5">Trip</label>
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between gap-2 rounded-lg border-2 px-3 h-10 bg-white transition-colors ${
          open ? 'border-primary/50' : 'border-background-warm hover:border-primary/30'
        }`}
      >
        <span className="text-sm font-button font-medium text-primary truncate">{p.trip.selectedLabel ?? 'All trips'}</span>
        <ChevronDown size={14} className={`text-dark-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <FilterDropdown
          value={p.trip.selectedKey ?? 'all'}
          onSelect={key => { p.trip.onSelect(key === 'all' ? null : key); setOpen(false); }}
          options={p.trip.options}
        />
      )}
    </div>
  );

  const generalChip = p.trip.generalCount > 0 && (
    <Chip
      selected={p.trip.selectedKey === p.trip.generalKey}
      count={p.trip.generalCount}
      onClick={() => p.trip.onSelect(p.trip.selectedKey === p.trip.generalKey ? null : p.trip.generalKey)}
      className="text-dark"
      tall
    >
      <MessageCircle size={13} className="shrink-0" aria-hidden="true" />
      General Enquiries
    </Chip>
  );

  const followUpChip = (p.followUp.count > 0 || p.followUp.active) && (
    <Chip selected={p.followUp.active} count={p.followUp.count} onClick={p.followUp.onToggle} className="text-dark" tall>
      <CalendarClock size={13} className="shrink-0" aria-hidden="true" />
      Due today / overdue
    </Chip>
  );

  // One quick chip that toggles a single value of a filter on/off.
  const quick = (set: FilterSet<string>, key: string, label: string) => {
    const selected = set.value === key;
    return (
      <Chip key={`${label}`} selected={selected} count={countOf(set, key)} dim={countOf(set, key) === 0} onClick={() => set.onChange(selected ? 'all' : key)}>
        {label}
      </Chip>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-card p-4">
      {/* ───────────────────────── Phone ───────────────────────── */}
      <div className="sm:hidden space-y-3">
        {(tripOpen) && <div className="fixed inset-0 z-20" onClick={() => setTripOpen(false)} />}
        <div className="flex items-end gap-2">
          {tripDropdown('enq-filter-trip-m', tripOpen, setTripOpen, 'flex-1 min-w-0')}
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-haspopup="dialog"
            className={`shrink-0 inline-flex items-center gap-1.5 h-10 px-3.5 rounded-lg border-2 text-sm font-button font-bold transition-colors ${
              sheetActiveCount > 0 ? 'border-primary text-primary bg-primary/5' : 'border-background-warm text-dark'
            }`}
          >
            <SlidersHorizontal size={16} aria-hidden="true" />
            Filters
            {sheetActiveCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-primary text-white text-2xs">
                {sheetActiveCount}
              </span>
            )}
          </button>
        </div>

        {/* Quick chips — the filters used most, one tap, scroll sideways */}
        <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-1 [scrollbar-width:none]" role="group" aria-label="Quick filters">
          {generalChip}
          {quick(p.booking, 'booked', 'Booked')}
          {quick(p.booking, 'not_booked', 'Not booked')}
          {quick(p.payment, 'unpaid', 'Unpaid')}
          {quick(p.payment, 'partial', 'Partial')}
          {followUpChip}
        </div>

        {/* Applied filters + result count */}
        {p.activeCount > 0 && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {activeChips.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={c.clear}
                  aria-label={`Remove filter ${c.label}`}
                  className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1.5 rounded-full bg-primary/10 text-primary text-xs font-button font-semibold max-w-full"
                >
                  <span className="truncate">{c.label}</span>
                  <X size={12} weight="bold" className="shrink-0" aria-hidden="true" />
                </button>
              ))}
              <button
                type="button"
                onClick={p.onClearAll}
                className="inline-flex items-center gap-1 h-7 px-2 text-xs font-button font-semibold text-dark-muted hover:text-dark"
              >
                <RefreshCw size={12} aria-hidden="true" /> Clear all
              </button>
            </div>
            <p className="text-xs text-dark-muted" aria-live="polite">
              Showing <span className="font-semibold text-dark">{p.shownCount}</span> of {p.totalCount} enquiries
            </p>
          </div>
        )}
      </div>

      {/* Bottom sheet — every filter, phone only */}
      <AnimatePresence>
        {sheetOpen && (
          <div className="sm:hidden fixed inset-0 z-[60] flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="Filters">
            <motion.div
              className="absolute inset-0 bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSheetOpen(false)}
            />
            <motion.div
              className="relative bg-white rounded-t-2xl shadow-warm-lg flex flex-col max-h-[88%]"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'tween', duration: 0.22 }}
            >
              <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-background-warm">
                <SlidersHorizontal size={16} className="text-dark shrink-0" aria-hidden="true" />
                <h2 className="font-button font-bold text-dark text-base flex-1">Filters</h2>
                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  aria-label="Close filters"
                  className="p-1.5 -mr-1.5 rounded-md text-dark-muted hover:bg-background-warm"
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-5">
                <Group label="Booking" set={p.booking} />
                <Group label="Payment" set={p.payment} />
                {followUpChip && (
                  <div>
                    <p className="text-2xs font-button font-bold text-dark-muted uppercase tracking-wide mb-1.5">Follow-up</p>
                    {followUpChip}
                  </div>
                )}
                <Group label="Lead Status" set={p.leadStatus} />
                <Group label="Group / Solo" set={p.group} />
                <Group label="Food" set={p.food} />
                <Group label="Package" set={p.pkg} />
                <Group label="Booking Journey" set={p.journey} />
                <Group label="Source" set={p.source} />
              </div>

              <div className="flex items-center gap-2 px-4 pt-3 border-t border-background-warm pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <button
                  type="button"
                  onClick={clearSheetFilters}
                  disabled={sheetActiveCount === 0}
                  className={`shrink-0 h-11 px-4 rounded-lg border-2 text-sm font-button font-semibold transition-colors ${
                    sheetActiveCount === 0 ? 'border-background-warm text-dark-muted/40' : 'border-background-warm text-dark hover:border-primary/30'
                  }`}
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  className="flex-1 h-11 rounded-lg bg-primary text-white text-sm font-button font-bold hover:opacity-90 transition-opacity"
                  aria-live="polite"
                >
                  {p.shownCount === 0 ? 'No results' : `Show ${p.shownCount} result${p.shownCount === 1 ? '' : 's'}`}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ───────────────────── Desktop / tablet (original layout) ───────────────────── */}
      <div className="hidden sm:block">
        {openDesk && <div className="fixed inset-0 z-20" onClick={() => setOpenDesk(null)} />}

        <div className="flex items-center gap-2">
          <SlidersHorizontal size={16} className="text-dark shrink-0" aria-hidden="true" />
          <span className="font-button font-bold text-dark text-base whitespace-nowrap flex-1 text-left">Filters</span>
          {p.activeCount > 0 && (
            <span className="shrink-0 inline-flex items-center justify-center px-2 h-[22px] rounded-md bg-primary/10 text-primary text-2xs font-button font-semibold">
              {p.activeCount} active
            </span>
          )}
        </div>

        <div className="flex flex-row items-end gap-3 mt-4">
          <div className="flex flex-wrap items-end gap-2 flex-1 min-w-0">
            <DeskField
              id="enq-filter-trip" label="Trip" className="min-w-[150px]"
              value={p.trip.selectedKey ?? 'all'}
              display={p.trip.selectedLabel ?? 'All'}
              options={p.trip.options}
              onSelect={key => { p.trip.onSelect(key === 'all' ? null : key); setOpenDesk(null); }}
              open={openDesk === 'trip'}
              onToggle={() => setOpenDesk(o => (o === 'trip' ? null : 'trip'))}
            />

            {p.trip.generalCount > 0 && (
              <button
                type="button"
                onClick={() => p.trip.onSelect(p.trip.selectedKey === p.trip.generalKey ? null : p.trip.generalKey)}
                title="Enquiries not linked to any trip — Contact Us messages and manual entries logged without picking a trip"
                className={`shrink-0 inline-flex items-center gap-1.5 text-xs font-button font-semibold rounded-md border-2 px-3 h-[38px] transition-colors whitespace-nowrap ${
                  p.trip.selectedKey === p.trip.generalKey
                    ? 'bg-primary text-white border-primary'
                    : 'border-background-warm text-dark hover:border-primary/30'
                }`}
              >
                <MessageCircle size={13} className="shrink-0" aria-hidden="true" />
                General Enquiries
                <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-md text-2xs ${
                  p.trip.selectedKey === p.trip.generalKey ? 'bg-white/20' : 'bg-background-warm'
                }`}>
                  {p.trip.generalCount}
                </span>
              </button>
            )}

            {([
              ['query', 'Lead Status', p.leadStatus, 'min-w-[140px]'],
              ['journey', 'Booking Journey', p.journey, 'min-w-[160px]'],
              ['pay', 'Payment', p.payment, 'min-w-[140px]'],
              ['booked', 'Booking', p.booking, 'min-w-[140px]'],
            ] as const).map(([key, label, set, minW]) => (
              <DeskField
                key={key} id={`enq-filter-${key}`} label={label} className={minW}
                value={set.value} display={labelOf(set)} options={set.options}
                onSelect={k => { set.onChange(k); setOpenDesk(null); }}
                open={openDesk === key}
                onToggle={() => setOpenDesk(o => (o === key ? null : key))}
              />
            ))}

            {p.followUp.count > 0 && (
              <button
                type="button"
                onClick={p.followUp.onToggle}
                title="Contacted leads with a follow-up reminder due today or overdue"
                className={`shrink-0 inline-flex items-center gap-1.5 text-xs font-button font-semibold rounded-md border-2 px-3 h-[38px] transition-colors whitespace-nowrap self-end ${
                  p.followUp.active
                    ? 'bg-primary text-white border-primary'
                    : 'border-background-warm text-dark hover:border-primary/30'
                }`}
              >
                <CalendarClock size={13} className="shrink-0" aria-hidden="true" />
                Follow-ups Due
                <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-md text-2xs ${
                  p.followUp.active ? 'bg-white/20' : 'bg-background-warm'
                }`}>
                  {p.followUp.count}
                </span>
              </button>
            )}

            {([
              ['group', 'Group / Solo', p.group],
              ['food', 'Food', p.food],
              ['package', 'Package', p.pkg],
            ] as const).map(([key, label, set]) => (
              <DeskField
                key={key} id={`enq-filter-${key}`} label={label} className="min-w-[140px]"
                value={set.value} display={labelOf(set)} options={set.options}
                onSelect={k => { set.onChange(k); setOpenDesk(null); }}
                open={openDesk === key}
                onToggle={() => setOpenDesk(o => (o === key ? null : key))}
              />
            ))}

            <DeskField
              id="enq-filter-more" label="Source" className="min-w-[140px]" align="right"
              value={p.source.value} display={labelOf(p.source)}
              options={p.source.options.map(o => (o.key === 'all' ? { ...o, label: 'All sources' } : o))}
              onSelect={k => { p.source.onChange(k); setOpenDesk(null); }}
              open={openDesk === 'more'}
              onToggle={() => setOpenDesk(o => (o === 'more' ? null : 'more'))}
            />
          </div>

          <button
            type="button"
            onClick={p.onClearAll}
            disabled={p.activeCount === 0}
            className={`shrink-0 inline-flex items-center justify-center gap-1.5 text-xs font-button font-semibold rounded-md border-2 px-3 py-2 transition-colors whitespace-nowrap ${
              p.activeCount === 0
                ? 'border-background-warm text-dark-muted/40 cursor-default'
                : 'border-background-warm text-dark hover:border-primary/30'
            }`}
          >
            <RefreshCw size={13} aria-hidden="true" /> Clear All
          </button>
        </div>
      </div>
    </div>
  );
}
