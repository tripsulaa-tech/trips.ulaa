import { Search, X } from 'lucide-react';

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
}: TableHeaderBarProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-5 pt-4 sm:pt-5 pb-4">
      <div className="flex items-baseline flex-wrap gap-x-2 gap-y-0.5 min-w-0">
        <h2 className="font-button font-bold text-dark text-base truncate">{title}</h2>
        <p className="text-dark-muted text-xs whitespace-nowrap">
          {total === 0 ? `No ${itemLabel.toLowerCase()} found` : `Showing ${rangeStart}\u2013${rangeEnd} of ${total} ${itemLabel}`}
        </p>
      </div>
      <div className="relative w-full sm:w-72 shrink-0">
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
