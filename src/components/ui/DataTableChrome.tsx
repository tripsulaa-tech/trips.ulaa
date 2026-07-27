import { useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { Search, X, ChevronUp, ChevronDown, Phone, Mail, Download } from 'lucide-react';
import { getWhatsAppLink } from '../../utils/utils-index';

// Click-and-drag horizontal panning for the table's scroll container. Lets
// us hide the native scrollbar (scrollbar-hide) while still keeping the
// table reachable sideways — drag left/right with the mouse; vertical
// scrolling still works the normal way via the mouse wheel/trackpad.
export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const drag = useRef({ isDown: false, startX: 0, scrollLeft: 0, moved: false });
  const [isDragging, setIsDragging] = useState(false);

  const onMouseDown = (e: ReactMouseEvent) => {
    const el = ref.current;
    if (!el) return;
    drag.current = { isDown: true, startX: e.pageX - el.offsetLeft, scrollLeft: el.scrollLeft, moved: false };
  };
  const stop = () => {
    if (drag.current.isDown) {
      drag.current.isDown = false;
      setIsDragging(false);
    }
  };
  const onMouseMove = (e: ReactMouseEvent) => {
    const el = ref.current;
    if (!el || !drag.current.isDown) return;
    const x = e.pageX - el.offsetLeft;
    const walk = x - drag.current.startX;
    if (!drag.current.moved && Math.abs(walk) > 4) {
      drag.current.moved = true;
      setIsDragging(true);
    }
    if (drag.current.moved) {
      e.preventDefault();
      el.scrollLeft = drag.current.scrollLeft - walk;
    }
  };

  return {
    ref,
    isDragging,
    handlers: { onMouseDown, onMouseMove, onMouseUp: stop, onMouseLeave: stop },
  };
}


// Shared "table card" header — title + live "Showing X–Y of N" subtitle on
// the left, search bar aligned to the right in the same row. Used by both
// AdminEnquiries and AdminWaitlist so their table cards look and behave
// identically (title row lives *inside* the card, above the table itself,
// with the search box that used to live in the filter bar now living here
// instead).
interface TableHeaderBarProps {
  title: string;
  rangeStart: number;
  rangeEnd: number;
  total: number;
  itemLabel: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  // Optional — pages that support CSV export pass a handler here and get an
  // "Export CSV" button next to the search box for free. Omitted entirely
  // (not just disabled) on pages that don't wire it up.
  onExport?: () => void;
  exportLabel?: string;
}

export function TableHeaderBar({
  title,
  rangeStart,
  rangeEnd,
  total,
  itemLabel,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  onExport,
  exportLabel = 'Export CSV',
}: TableHeaderBarProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-5 pt-4 sm:pt-5 pb-4">
      <div className="flex items-baseline flex-wrap gap-x-2 gap-y-0.5 min-w-0">
        <h2 className="font-button font-bold text-dark text-base truncate">{title}</h2>
        <p className="text-dark-muted text-xs whitespace-nowrap">
          {total === 0 ? `No ${itemLabel.toLowerCase()} found` : `Showing ${rangeStart}\u2013${rangeEnd} of ${total} ${itemLabel}`}
        </p>
      </div>
      <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
        <div className="relative flex-1 sm:w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-muted pointer-events-none" />
          <input
            type="text"
            value={searchValue}
            onChange={ev => onSearchChange(ev.target.value)}
            placeholder={searchPlaceholder}
            className="w-full pl-9 pr-8 py-1.5 rounded-xl border-2 border-background-warm bg-background font-body text-dark text-sm focus:border-primary outline-none transition-colors"
          />
          {searchValue && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-dark-muted hover:text-dark"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
        {onExport && (
          <button
            onClick={onExport}
            disabled={total === 0}
            title={total === 0 ? 'Nothing to export' : `${exportLabel} — exports exactly what's currently filtered`}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 border-background-warm text-dark text-sm font-button font-semibold hover:border-primary/40 hover:text-primary disabled:opacity-40 disabled:hover:border-background-warm disabled:hover:text-dark transition-colors"
          >
            <Download size={14} />
            <span className="hidden sm:inline">{exportLabel}</span>
          </button>
        )}
      </div>
    </div>
  );
}

// Builds the compact "1 … 4 5 [6] 7 8 … 20" page-number window shown between
// Prev/Next — always keeps first, last, current, and current's immediate
// neighbours, collapsing everything else behind an ellipsis.
function getPageWindow(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set<number>([1, total, current]);
  if (current - 1 >= 1) pages.add(current - 1);
  if (current + 1 <= total) pages.add(current + 1);
  const sorted = Array.from(pages).sort((a, b) => a - b);
  const result: (number | 'ellipsis')[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) result.push('ellipsis');
    result.push(p);
  });
  return result;
}

interface TablePaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function TablePagination({ currentPage, totalPages, onPageChange }: TablePaginationProps) {
  if (totalPages <= 1) return null;
  const pages = getPageWindow(currentPage, totalPages);
  return (
    <div className="flex items-center justify-end flex-wrap gap-1.5 px-4 sm:px-5 py-3.5 border-t border-background-warm">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="inline-flex items-center gap-1 text-xs font-button font-semibold px-3 h-9 rounded-lg border-2 border-background-warm text-dark hover:border-primary/30 disabled:text-dark-muted/40 disabled:hover:border-background-warm disabled:cursor-default transition-colors"
      >
        &lsaquo; Prev
      </button>
      {pages.map((p, i) =>
        p === 'ellipsis' ? (
          <span key={`ellipsis-${i}`} className="px-1.5 text-dark-muted text-xs select-none">
            &hellip;
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            aria-current={p === currentPage ? 'page' : undefined}
            className={`min-w-[36px] h-9 px-2 inline-flex items-center justify-center text-xs font-button font-semibold rounded-lg border-2 transition-colors ${
              p === currentPage
                ? 'bg-primary border-primary text-white'
                : 'border-background-warm text-dark hover:border-primary/30'
            }`}
          >
            {p}
          </button>
        )
      )}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="inline-flex items-center gap-1 text-xs font-button font-semibold px-3 h-9 rounded-lg border-2 border-background-warm text-dark hover:border-primary/30 disabled:text-dark-muted/40 disabled:hover:border-background-warm disabled:cursor-default transition-colors"
      >
        Next &rsaquo;
      </button>
    </div>
  );
}

// Small helper so both pages compute the same "Showing X–Y of N" + sliced
// page of rows from one filtered array, given the current page and a fixed
// page size.
export function paginate<T>(items: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = items.length === 0 ? 0 : (safePage - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);
  return {
    pageItems,
    totalPages,
    safePage,
    rangeStart: items.length === 0 ? 0 : start + 1,
    rangeEnd: Math.min(start + pageSize, items.length),
  };
}

export type SortDirection = 'asc' | 'desc';

// Clickable column header with an up/down indicator — the up arrow lights
// up when that column is the active ascending sort, the down arrow when
// it's the active descending sort, so the current state is visible at a
// glance rather than just on hover.
interface SortableThProps<K extends string> {
  label: string;
  sortKey: K;
  activeKey: K | null;
  direction: SortDirection;
  onSort: (key: K) => void;
  className?: string;
}

export function SortableTh<K extends string>({ label, sortKey, activeKey, direction, onSort, className = '' }: SortableThProps<K>) {
  const isActive = activeKey === sortKey;
  return (
    <th className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 hover:text-primary transition-colors"
      >
        <span>{label}</span>
        <span className="flex flex-col justify-center leading-none">
          <ChevronUp size={10} className={`-mb-0.5 ${isActive && direction === 'asc' ? 'text-primary' : 'text-dark-muted/30'}`} />
          <ChevronDown size={10} className={isActive && direction === 'desc' ? 'text-primary' : 'text-dark-muted/30'} />
        </span>
      </button>
    </th>
  );
}

// Reach-out shortcuts shown next to a lead/waitlist row's phone and email —
// tel:, mailto:, and a WhatsApp deep-link prefilled with a short templated
// message. Shared by AdminEnquiries and AdminWaitlist so both tables get
// identical behavior instead of each hand-rolling its own contact markup.
// Stops propagation on click so this can sit inside a clickable row without
// also triggering the row's own click handler (e.g. "open details").
interface ContactQuickLinksProps {
  phone?: string | null;
  email?: string | null;
  // First-name only is plenty for a WhatsApp opener and keeps the
  // prefilled text from reading like a form letter.
  name?: string | null;
  tripTitle?: string | null;
  size?: 'sm' | 'md';
}

export function ContactQuickLinks({ phone, email, name, tripTitle, size = 'sm' }: ContactQuickLinksProps) {
  const hasPhone = !!phone && phone.trim().length > 0;
  const hasEmail = !!email && email.trim().length > 0;
  if (!hasPhone && !hasEmail) return null;

  const dim = size === 'sm' ? 'w-6 h-6' : 'w-7 h-7';
  const iconSize = size === 'sm' ? 12 : 13;
  const firstName = name?.trim().split(/\s+/)[0];
  const greeting = firstName ? `Hi ${firstName}` : 'Hi';
  const whatsappMessage = tripTitle
    ? `${greeting}, following up on your ${tripTitle} enquiry with ULAA — `
    : `${greeting}, following up on your enquiry with ULAA — `;

  const btnClass = `shrink-0 inline-flex items-center justify-center ${dim} rounded-lg border border-background-warm text-dark-muted hover:border-primary/40 hover:text-primary transition-colors`;

  return (
    <span className="inline-flex items-center gap-1" onClick={e => e.stopPropagation()}>
      {hasPhone && (
        <a
          href={getWhatsAppLink(phone!, whatsappMessage)}
          target="_blank"
          rel="noopener noreferrer"
          title="Message on WhatsApp"
          aria-label="Message on WhatsApp"
          className={btnClass}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width={iconSize} height={iconSize}>
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
        </a>
      )}
      {hasPhone && (
        <a href={`tel:${phone}`} title="Call" aria-label="Call" className={btnClass}>
          <Phone size={iconSize} />
        </a>
      )}
      {hasEmail && (
        <a href={`mailto:${email}`} title="Email" aria-label="Email" className={btnClass}>
          <Mail size={iconSize} />
        </a>
      )}
    </span>
  );
}
