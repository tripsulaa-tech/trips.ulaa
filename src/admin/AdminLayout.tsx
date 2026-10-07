import type { ReactNode } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  House as Home,
  Briefcase,
  BookOpen,
  ChatCircle as MessageCircle,
  SignOut as LogOut,
  List as Menu,
  X,
  CaretDown as ChevronDown,
  ArrowSquareOut as ExternalLink,
  FileText,
  ListChecks,
  CaretDoubleLeft as ChevronsLeft,
  CaretDoubleRight as ChevronsRight,
  Users,
  AddressBook,
  DotsSixVertical as GripVertical,
  ChartBar as BarChart3,
  Images,
  Calculator,
  Receipt,
  Swatches,
  Compass,
  Globe,
  UsersThree,
  ChartLineUp,
  Coins,
  IdentificationCard,
} from '@phosphor-icons/react';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/useAuth';
import NotificationsPanel from './NotificationsPanel';
import PushNotificationToggle from './PushNotificationToggle';
import ScrollToTopButton from '../components/layout/ScrollToTopButton';
import { useScrollRestoration } from '../hooks/useScrollRestoration';
import { sweepAbandonedDraftUploads, discardAllDrafts, hasAnyDraft } from '../hooks/useSessionDraft';
import type { TripHighlightIconType } from '../constants/tripHighlightIcons';
import { useBranding } from '../hooks/useBranding';
import { useConfirm } from '../components/ui/useConfirm';

interface AdminNavItemDef {
  to: string;
  icon: TripHighlightIconType;
}

// Single source of truth for what each nav item links to / shows as an
// icon. Order and top-level-vs-grouped placement are handled separately
// below (NAV_ORDER_STORAGE_KEY) so the admin can drag any item — including
// "Dashboard" itself — anywhere they like.
const NAV_ITEM_DEFS: Record<string, AdminNavItemDef> = {
  Dashboard: { to: '/admin/dashboard', icon: Home },
  'Upcoming Trips': { to: '/admin/trips', icon: Briefcase },
  'Completed Trips': { to: '/admin/albums', icon: BookOpen },
  'Trip Finance': { to: '/admin/trip-finance', icon: Coins },
  'Home Page': { to: '/admin/home', icon: Images },
  'About Page': { to: '/admin/about', icon: FileText },
  'Trip Leaders': { to: '/admin/trip-leaders', icon: Users },
  'Travel Cards': { to: '/admin/travel-cards', icon: IdentificationCard },
  Enquiries: { to: '/admin/enquiries', icon: MessageCircle },
  Waitlist: { to: '/admin/waitlist', icon: ListChecks },
  Travellers: { to: '/admin/travellers', icon: AddressBook },
  Reports: { to: '/admin/reports', icon: BarChart3 },
  'Rate Calculator': { to: '/admin/creator-rate-calculator', icon: Calculator },
  'Invoice Generator': { to: '/admin/invoice-generator', icon: Receipt },
  'Logo Studio': { to: '/admin/logo-studio', icon: Swatches },
};

// Sidebar layout, grouped by default: "Dashboard" stays a standalone link at
// the top, and everything else lives in a collapsible section so the list
// stays short instead of one long scrolling column. The admin can still drag
// any item to reorder it, or into a different section — the groups themselves
// (names/icons/order) are fixed, only which items sit where is remembered.
interface NavGroupDef {
  id: string;
  label: string;
  icon: TripHighlightIconType;
  items: string[];
}

const DEFAULT_TOP_ITEMS = ['Dashboard'];

// Sections follow the day-to-day workflow: run the trips, look after the
// people booking them, handle the money, and finally the public website and
// its branding (touched least often, so it sits last).
const NAV_GROUPS: NavGroupDef[] = [
  { id: 'trips', label: 'Trips', icon: Compass, items: ['Upcoming Trips', 'Completed Trips', 'Trip Leaders', 'Travel Cards'] },
  { id: 'customers', label: 'Customers', icon: UsersThree, items: ['Enquiries', 'Waitlist', 'Travellers'] },
  { id: 'business', label: 'Business', icon: ChartLineUp, items: ['Trip Finance', 'Invoice Generator', 'Reports', 'Rate Calculator'] },
  { id: 'website', label: 'Website', icon: Globe, items: ['Home Page', 'About Page', 'Logo Studio'] },
];

interface NavOrder {
  top: string[];
  groups: Record<string, string[]>;
}

// Bumped (v3) on purpose whenever the default arrangement changes: a saved
// order from an older version would otherwise keep overriding the new layout
// for everyone who had ever opened the admin.
const NAV_ORDER_STORAGE_KEY = 'admin-sidebar-order-v3';

// Which sidebar sections the admin has expanded. Every admin page renders its
// own AdminLayout, so the sidebar remounts on each navigation; without this the
// open sections reset to just the current page's section. A section stays open
// until the admin closes it themselves.
const NAV_OPEN_GROUPS_KEY = 'admin-sidebar-open-groups';

function loadOpenGroups(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(NAV_OPEN_GROUPS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, boolean>;
  } catch {
    // Storage unavailable or corrupt — fall back to defaults.
  }
  return {};
}

function saveOpenGroups(open: Record<string, boolean>) {
  try {
    window.localStorage.setItem(NAV_OPEN_GROUPS_KEY, JSON.stringify(open));
  } catch {
    // Storage unavailable — sections still work for this page view.
  }
}

function defaultNavOrder(): NavOrder {
  return {
    top: [...DEFAULT_TOP_ITEMS],
    groups: Object.fromEntries(NAV_GROUPS.map(g => [g.id, [...g.items]])),
  };
}

// Reads the admin's saved arrangement, dropping any labels that no longer
// exist (e.g. a page was removed in a later update) and putting any new ones
// back into their default spot — so a stale saved order never hides a real
// nav item.
function loadNavOrder(): NavOrder {
  try {
    const raw = window.localStorage.getItem(NAV_ORDER_STORAGE_KEY);
    if (!raw) return defaultNavOrder();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.top) || typeof parsed?.groups !== 'object' || !parsed.groups) return defaultNavOrder();

    const known = new Set(Object.keys(NAV_ITEM_DEFS));
    const seen = new Set<string>();
    const dedupeKnown = (labels: unknown): string[] =>
      Array.isArray(labels)
        ? labels.filter((l): l is string => typeof l === 'string' && known.has(l) && !seen.has(l) && (seen.add(l), true))
        : [];

    const order: NavOrder = { top: dedupeKnown(parsed.top), groups: {} };
    for (const g of NAV_GROUPS) order.groups[g.id] = dedupeKnown(parsed.groups[g.id]);

    for (const label of known) {
      if (seen.has(label)) continue;
      const home = NAV_GROUPS.find(g => g.items.includes(label));
      (home ? order.groups[home.id] : order.top).push(label);
    }

    if (!order.top.includes(GROUP_FALLBACK_TOP) && !Object.values(order.groups).some(l => l.includes(GROUP_FALLBACK_TOP))) {
      order.top.unshift(GROUP_FALLBACK_TOP);
    }
    return order;
  } catch {
    return defaultNavOrder();
  }
}

// Dashboard must always be reachable somewhere; this is where it goes if a
// corrupted saved order somehow lost it.
const GROUP_FALLBACK_TOP = 'Dashboard';

function saveNavOrder(order: NavOrder) {
  try {
    window.localStorage.setItem(NAV_ORDER_STORAGE_KEY, JSON.stringify(order));
  } catch {
    // Storage unavailable (private browsing, etc.) — order still works for
    // this session, it just won't persist.
  }
}

interface AdminLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  // Page-level (non-modal) admin screens like About/Why Ulaa have no
  // save-on-close event to hook the way a modal does — the only signal
  // that something might be lost is the admin trying to navigate away.
  // If provided, this is checked before any sidebar/logo/"View Site" link
  // navigates; returning true blocks navigation until confirmed. This
  // covers in-app (SPA) navigation only — see the beforeunload handler
  // below for tab close/refresh/typed-URL navigation.
  hasUnsavedChanges?: () => boolean;
  // Locks the page to exactly the viewport height instead of
  // letting it grow with content (min-h-screen) — used by single-card
  // editor pages (About/Founder/Why Ulaa via ContentEditorShell) so their
  // own internal scroll area is the only thing that ever scrolls. A tiny
  // rounding mismatch between the card's own max-height and the real
  // header height was otherwise enough to make the whole page scroll by a
  // few px, dragging a sticky element inside the card out from under the
  // top nav. Left off (default) for every other admin page, which relies
  // on ordinary page-level scrolling for content taller than the screen.
  fixedHeight?: boolean;
  // Whether this page's content has finished loading, for the scroll
  // restoration below — pass the page's own `!loading` (or similar) if it
  // renders a shorter loading/skeleton state before its real content;
  // restoring against that shorter height would land short of the saved
  // position. Defaults to true for pages that render at full height
  // immediately (most editor/list pages with no async loading step).
  scrollRestorationReady?: boolean;
}

interface SidebarContentProps {
  userEmail?: string;
  initial: string;
  onNavigate: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  guardNavigate?: (e: React.MouseEvent, proceed?: () => void) => void;
}

interface DragTarget {
  /** 'top' for the ungrouped list, otherwise a NAV_GROUPS id. */
  list: string;
  label?: string;
}

function SidebarContent({ userEmail, initial, onNavigate, collapsed = false, onToggleCollapse, guardNavigate }: SidebarContentProps) {
  const location = useLocation();
  const { urls: brand } = useBranding();
  const [navOrder, setNavOrder] = useState<NavOrder>(loadNavOrder);

  const isItemActive = (label: string) => {
    const { to } = NAV_ITEM_DEFS[label];
    return location.pathname === to || location.pathname.startsWith(`${to}/`);
  };
  const groupHasActive = (groupId: string, order: NavOrder = navOrder) =>
    (order.groups[groupId] ?? []).some(isItemActive);

  // Sections the admin opened stay open (remembered across pages and visits)
  // until they close them; the section holding the current page is always open.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const saved = loadOpenGroups();
    return Object.fromEntries(NAV_GROUPS.map(g => [g.id, saved[g.id] === true || groupHasActive(g.id)]));
  });

  // Navigating (sidebar link, dashboard quick action, back button, ...) into
  // a page that lives in a collapsed section opens that section. Adjusted
  // during render rather than in an effect to avoid an extra render pass.
  const [prevPathname, setPrevPathname] = useState(location.pathname);
  if (location.pathname !== prevPathname) {
    setPrevPathname(location.pathname);
    const home = NAV_GROUPS.find(g => groupHasActive(g.id));
    if (home && !openGroups[home.id]) {
      const next = { ...openGroups, [home.id]: true };
      setOpenGroups(next);
      saveOpenGroups(next);
    }
  }

  const [draggedLabel, setDraggedLabel] = useState<string | null>(null);
  // Every row (item, plus each section's end-of-list drop slot) registers its
  // wrapper element + what dropping there means, keyed by a unique row id.
  // Hit-tested by Y position on every pointer move — this is what makes
  // dragging work with touch as well as a mouse, since native HTML5
  // drag-and-drop never fires from touch gestures on mobile browsers.
  const rowsRef = useRef<Map<string, { el: HTMLElement; target: DragTarget }>>(new Map());

  const toggleGroup = (id: string) => {
    const next = { ...openGroups, [id]: !openGroups[id] };
    setOpenGroups(next);
    saveOpenGroups(next);
  };

  const updateOrder = (updater: (order: NavOrder) => NavOrder) => {
    setNavOrder(prev => {
      const next = updater(prev);
      saveNavOrder(next);
      return next;
    });
  };

  const listOf = (order: NavOrder, list: string) => (list === 'top' ? order.top : order.groups[list] ?? []);
  const withList = (order: NavOrder, list: string, items: string[]): NavOrder =>
    list === 'top' ? { ...order, top: items } : { ...order, groups: { ...order.groups, [list]: items } };

  // Keyboard equivalent of the pointer-drag reordering below — moves `label`
  // one slot up/down within its own list and announces the result, since a
  // purely visual reorder wouldn't otherwise be perceivable to a screen
  // reader user driving this via the keyboard.
  const [moveAnnouncement, setMoveAnnouncement] = useState('');
  const moveItem = (label: string, list: string, direction: -1 | 1) => {
    updateOrder(prev => {
      const arr = [...listOf(prev, list)];
      const from = arr.indexOf(label);
      if (from === -1) return prev;
      const to = from + direction;
      if (to < 0 || to >= arr.length) {
        setMoveAnnouncement(`${label} is already ${direction < 0 ? 'first' : 'last'} in this list.`);
        return prev;
      }
      [arr[from], arr[to]] = [arr[to], arr[from]];
      setMoveAnnouncement(`${label} moved to position ${to + 1} of ${arr.length}.`);
      return withList(prev, list, arr);
    });
  };

  // Moves the item currently being dragged (read fresh via draggedLabelRef,
  // not the possibly-stale `draggedLabel` closure) to just before
  // `targetLabel` within `targetList`, or to the end of that list if
  // targetLabel is omitted. Called live as the pointer moves, so a drag
  // reorders in real time rather than only on release.
  const draggedLabelRef = useRef<string | null>(null);
  const moveDraggedTo = (targetList: string, targetLabel?: string) => {
    const dragged = draggedLabelRef.current;
    if (!dragged || dragged === targetLabel) return;

    updateOrder(prev => {
      const next: NavOrder = {
        top: prev.top.filter(l => l !== dragged),
        groups: Object.fromEntries(Object.entries(prev.groups).map(([id, items]) => [id, items.filter(l => l !== dragged)])),
      };
      const dest = [...listOf(next, targetList)];
      const insertAt = targetLabel ? dest.indexOf(targetLabel) : -1;
      dest.splice(insertAt === -1 ? dest.length : insertAt, 0, dragged);
      return withList(next, targetList, dest);
    });
  };

  useEffect(() => {
    if (!draggedLabel) return;
    draggedLabelRef.current = draggedLabel;

    const findNearestRow = (y: number) => {
      let nearestKey: string | null = null;
      let nearestDist = Infinity;
      rowsRef.current.forEach((entry, key) => {
        if (entry.target.label === draggedLabel) return; // skip the row being dragged
        const rect = entry.el.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        const dist = Math.abs(center - y);
        if (dist < nearestDist) { nearestDist = dist; nearestKey = key; }
      });
      return nearestKey ? rowsRef.current.get(nearestKey)! : null;
    };

    const handleMove = (e: PointerEvent) => {
      const nearest = findNearestRow(e.clientY);
      if (nearest) moveDraggedTo(nearest.target.list, nearest.target.label);
    };
    const endDrag = () => {
      draggedLabelRef.current = null;
      setDraggedLabel(null);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggedLabel]);

  const startDrag = (label: string) => (e: React.PointerEvent) => {
    if (collapsed) return;
    // Only the primary touch point / left mouse button should start a
    // drag — on iOS Safari a second, incidental pointer (e.g. a palm
    // resting on the screen) can otherwise hijack the gesture.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraggedLabel(label);
  };

  // Long-pressing a touch target on mobile normally triggers the browser's
  // own gesture handling before our JS ever sees a sustained pointermove:
  // iOS Safari pops up its text-selection "callout" menu, Android shows a
  // save/inspect context menu, and both browsers may kick off a native
  // element drag (ghost image). Any one of these swallows the touch and
  // makes the handle feel completely dead, so they're suppressed explicitly.
  const renderGrip = (label: string, list: string, size = 14) => (
    <span
      onPointerDown={startDrag(label)}
      onContextMenu={e => e.preventDefault()}
      draggable={false}
      onDragStart={e => e.preventDefault()}
      onKeyDown={e => {
        if (e.key === 'ArrowUp') { e.preventDefault(); moveItem(label, list, -1); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); moveItem(label, list, 1); }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Reorder ${label}. Use the up and down arrow keys to move it.`}
      className="shrink-0 flex items-center justify-center w-8 h-10 -ml-1 touch-none select-none cursor-grab active:cursor-grabbing text-dark-muted/50 hover:text-dark-muted rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      style={{
        WebkitTouchCallout: 'none',
        WebkitUserDrag: 'none',
        WebkitTapHighlightColor: 'transparent',
      } as React.CSSProperties}
    >
      <GripVertical size={size} aria-hidden="true" />
    </span>
  );

  // One nav link row. `nested` rows sit inside a section (slightly smaller);
  // the collapsed icon rail renders every row flat and icon-only.
  const renderRow = (label: string, list: string, nested: boolean) => {
    const { to, icon: Icon } = NAV_ITEM_DEFS[label];
    return (
      <div
        key={to}
        ref={el => { if (el) rowsRef.current.set(label, { el, target: { list, label } }); else rowsRef.current.delete(label); }}
        className={`flex items-center gap-1 rounded-md ${collapsed ? 'justify-center' : ''} ${draggedLabel === label ? 'opacity-40' : ''}`}
      >
        {!collapsed && renderGrip(label, list, nested ? 13 : 14)}
        <NavLink
          to={to}
          end={label === 'Dashboard'}
          onClick={e => { guardNavigate?.(e, onNavigate); if (!e.defaultPrevented) onNavigate(); }}
          title={collapsed ? label : undefined}
          aria-label={collapsed ? label : undefined}
          className={({ isActive }) => `
            flex-1 flex items-center rounded-md text-sm font-medium transition-all min-w-0
            ${nested ? 'gap-2.5 py-2.5 px-2' : 'gap-3 py-3 px-3'}
            ${collapsed ? '!justify-center !px-0 !gap-0 !py-3' : ''}
            ${isActive ? 'bg-primary text-white' : 'text-dark hover:bg-background-warm hover:text-primary'}
          `}
        >
          <Icon size={nested && !collapsed ? 16 : 18} className="shrink-0" aria-hidden="true" />
          {!collapsed && <span className="truncate">{label}</span>}
        </NavLink>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Announces keyboard-driven reorders, which otherwise only show up
          as a visual position change. */}
      <div aria-live="polite" className="sr-only">{moveAnnouncement}</div>
      <div className={`relative pt-6 pb-4 flex items-center ${collapsed ? 'flex-col gap-3 px-2' : 'justify-center px-6'}`}>
        <Link to="/" className="inline-block shrink-0" onClick={guardNavigate}>
          {collapsed ? (
            <img src={brand.admin_icon} alt="Ulaa" className="h-11 w-11 object-contain" />
          ) : (
            <img src={brand.admin_logo} alt="Ulaa" className="h-32 max-w-full object-contain" />
          )}
        </Link>
        {/* Collapse/expand toggle — desktop only; the mobile drawer always
            renders full-width so this callback is omitted there. */}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={`shrink-0 flex items-center justify-center w-8 h-8 rounded-lg border border-background-warm bg-background-warm/60 text-dark-muted hover:bg-background-warm hover:text-primary transition-colors ${
              collapsed ? '' : 'absolute right-4 top-6'
            }`}
          >
            {collapsed ? <ChevronsRight size={16} aria-hidden="true" /> : <ChevronsLeft size={16} aria-hidden="true" />}
          </button>
        )}
      </div>

      <div className={`mb-4 pb-4 flex items-center gap-3 border-b border-background-warm ${collapsed ? 'mx-2 justify-center' : 'mx-6'}`}>
        <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-display font-semibold flex-shrink-0">
          {initial}
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-xs text-dark-muted">Admin</p>
            <p className="text-sm font-semibold text-dark truncate">{userEmail}</p>
          </div>
        )}
      </div>

      <nav className={`flex-1 space-y-1 overflow-y-auto app-scroll ${collapsed ? 'px-2' : 'px-4'}`}>
        {/* Ungrouped items (Dashboard by default). */}
        {navOrder.top.map(label => renderRow(label, 'top', false))}

        {NAV_GROUPS.map(group => {
          const items = navOrder.groups[group.id] ?? [];

          // Collapsed icon rail has no room for section headers, so every
          // section's items are shown flat, with a thin divider between
          // sections to keep the grouping visible.
          if (collapsed) {
            if (items.length === 0) return null;
            return (
              <div key={group.id} className="pt-2 mt-2 border-t border-background-warm space-y-1">
                {items.map(label => renderRow(label, group.id, false))}
              </div>
            );
          }

          // While dragging, every section opens so an item can be dropped
          // into any of them, even one that was collapsed.
          const isOpen = !!draggedLabel || (openGroups[group.id] ?? false);
          const hasActive = items.some(isItemActive);
          const GroupIcon = group.icon;

          return (
            <div key={group.id} className="pt-1">
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                aria-expanded={isOpen}
                aria-controls={`admin-nav-group-${group.id}`}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-colors hover:bg-background-warm hover:text-primary ${
                  hasActive && !isOpen ? 'text-primary' : 'text-dark-muted'
                }`}
              >
                <GroupIcon size={16} className="shrink-0" aria-hidden="true" />
                <span className="flex-1 text-left truncate">{group.label}</span>
                <ChevronDown size={14} className={`shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>

              {isOpen && (
                <div id={`admin-nav-group-${group.id}`} className="mt-1 ml-4 pl-3 py-1 space-y-1 border-l border-background-warm">
                  {items.map(label => renderRow(label, group.id, true))}
                  {/* End-of-section drop slot — lets an item be dropped at
                      the bottom of (or into an empty) section. */}
                  {draggedLabel && (
                    <div
                      ref={el => { if (el) rowsRef.current.set(`__END_${group.id}__`, { el, target: { list: group.id } }); else rowsRef.current.delete(`__END_${group.id}__`); }}
                      className="h-8 rounded-md border-2 border-dashed border-primary/30"
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className={`p-4 border-t border-background-warm ${collapsed ? 'px-2' : ''}`}>
        <Link
          to="/"
          onClick={guardNavigate}
          title={collapsed ? 'View Site' : undefined}
          aria-label={collapsed ? 'View Site' : undefined}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-md border border-background-warm text-sm font-medium text-dark hover:bg-background-warm transition-colors ${collapsed ? 'px-0' : 'px-4'}`}
        >
          <ExternalLink size={16} className="shrink-0" aria-hidden="true" />
          {!collapsed && 'View Site'}
        </Link>
      </div>
    </div>
  );
}

const SIDEBAR_COLLAPSED_KEY = 'admin-sidebar-collapsed';

export default function AdminLayout({ children, title, subtitle, hasUnsavedChanges, fixedHeight = false, scrollRestorationReady = true }: AdminLayoutProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const location = useLocation();
  // Restores scroll position whenever the admin comes back to a page they'd
  // scrolled down on — e.g. drilling into a detail view/modal and going
  // back, switching sidebar tabs and returning, or a hard refresh —
  // instead of always landing back at the top. Centralized here (rather
  // than each page wiring it up individually) so every admin page gets it
  // automatically; a page with its own async loading step should pass
  // `scrollRestorationReady={!loading}` so this waits for the page's real
  // height before restoring, not a shorter loading skeleton's.
  useScrollRestoration(location.pathname, scrollRestorationReady);
  // Once per admin page load: delete images that belonged to drafts whose tab was closed without
  // saving or discarding them (see useSessionDraft).
  useEffect(() => {
    sweepAbandonedDraftUploads();
  }, []);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const mobileCloseBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (sidebarOpen) mobileCloseBtnRef.current?.focus();
  }, [sidebarOpen]);

  // Fixed-height editor pages (About/Founder/Why Ulaa) already have their
  // own internal "app-scroll" area for content, and size themselves to
  // exactly 100vh — but a sub-pixel rounding mismatch between that and the
  // real viewport height is sometimes enough to give the whole document a
  // 1px scroll range, which shows up as a stray native scrollbar running
  // the full height of the page alongside the card's own scrollbar. Since
  // these pages never intend for the body itself to scroll, force it off
  // for as long as one of them is mounted, and restore it on the way out
  // so ordinary (non-fixedHeight) admin pages keep scrolling normally.
  useEffect(() => {
    if (!fixedHeight) return;
    const html = document.documentElement;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    // Some browsers let <body>'s overflow propagate to the viewport
    // scroller, others treat <html> as the actual scrolling box — lock
    // down both so neither can pick up the sub-pixel overflow.
    html.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
    };
  }, [fixedHeight]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sidebarOpen]);
  const [profileOpen, setProfileOpen] = useState(false);
  // Desktop sidebar collapse — remembered across visits so the admin's
  // preferred layout sticks around after a refresh or new session.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // Storage unavailable (private browsing, etc.) — collapse still
        // works for this session, it just won't persist.
      }
      return next;
    });
  };

  // Tab close / refresh / typed-URL navigation away can't be intercepted
  // by React Router at all (there's no SPA navigation event to hook), so
  // this is the only way to warn for that case. Browsers ignore the
  // custom message text and show their own generic prompt, but attaching
  // the listener at all is what makes the prompt appear.
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  // In-app (SPA) navigation away — sidebar links don't trigger a page
  // reload, so beforeunload never fires for these; this is the
  // lightweight substitute for a React Router data-router useBlocker
  // (which isn't available under the plain BrowserRouter this app uses).
  const guardNavigate = (e: React.MouseEvent, proceed?: () => void) => {
    if (!hasUnsavedChanges || !hasUnsavedChanges()) return;
    // Ctrl/Cmd/Shift-click opens another tab or window, so this page (and its changes) stays put.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    // The themed dialog answers asynchronously, so stop the link now and follow it once confirmed.
    e.preventDefault();
    const href = (e.currentTarget as HTMLElement).closest('a')?.getAttribute('href');
    // Every page that reports unsaved changes also keeps them as a draft for this browser tab,
    // so leaving is safe; what the admin should know is that nothing is on the live site yet.
    void confirm({
      title: 'Leave this page?',
      message: 'You have unsaved changes. They stay in this browser tab so you can come back to them, but they are not on the live site until you save. Leave this page anyway?',
      confirmLabel: 'Leave page',
    }).then(ok => {
      if (!ok) return;
      proceed?.();
      if (href) navigate(href);
    });
  };

  const handleSignOut = async () => {
    if (hasUnsavedChanges?.() || hasAnyDraft()) {
      const ok = await confirm({
        title: 'Sign out?',
        message: 'You have unsaved changes. Signing out discards them. Sign out anyway?',
        confirmLabel: 'Sign out',
      });
      if (!ok) return;
    }
    // Nothing unsaved should outlive the session: drop every draft this tab holds, and the
    // images uploaded only for them.
    discardAllDrafts();
    await signOut();
    navigate('/admin');
  };

  const initial = 'A';

  return (
    <div className={`bg-background flex ${fixedHeight ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
      {/* Desktop sidebar — collapses to an icon-only rail via the toggle
          button inside SidebarContent. */}
      <aside
        className={`hidden lg:flex ${collapsed ? 'w-20' : 'w-64'} bg-white border-r border-background-warm flex-col fixed inset-y-0 z-30 transition-all duration-200`}
      >
        <SidebarContent
          userEmail={user?.email}
          initial={initial}
          onNavigate={() => setSidebarOpen(false)}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
          guardNavigate={guardNavigate}
        />
      </aside>

      {/* Mobile sidebar overlay — always renders full-width; collapsing is
          a desktop-only affordance since this is already dismissible. */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-dark/50" onClick={() => setSidebarOpen(false)} />
          <div role="dialog" aria-modal="true" aria-label="Admin navigation menu" className="relative w-72 bg-white flex flex-col z-50">
            <button
              ref={mobileCloseBtnRef}
              onClick={() => setSidebarOpen(false)}
              aria-label="Close navigation menu"
              className="absolute top-4 right-4 p-2 rounded-md text-dark-muted hover:bg-background"
            >
              <X size={20} aria-hidden="true" />
            </button>
            <SidebarContent userEmail={user?.email} initial={initial} onNavigate={() => setSidebarOpen(false)} guardNavigate={guardNavigate} />
          </div>
        </div>
      )}

      {/* Main */}
      <div className={`flex-1 min-w-0 ${fixedHeight ? 'h-screen overflow-hidden' : 'min-h-screen'} flex flex-col transition-all duration-200 ${collapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        {/* Top bar */}
        <header className="bg-white border-b border-background-warm px-4 sm:px-6 lg:px-8 py-4 sm:py-6 min-h-[76px] sm:min-h-[92px] flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 rounded-md text-dark hover:bg-background flex-shrink-0"
            >
              <Menu size={20} aria-hidden="true" />
            </button>
            <div className="min-w-0">
              <h1 className="font-display text-xl sm:text-2xl font-bold text-dark truncate">{title}</h1>
              {subtitle && (
                <p className="text-sm text-dark-muted mt-0.5 hidden sm:block truncate">{subtitle}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <PushNotificationToggle />
            <NotificationsPanel />

            <div className="relative">
              <button
                onClick={() => setProfileOpen(o => !o)}
                aria-haspopup="menu"
                aria-expanded={profileOpen}
                className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-background-warm transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center text-sm font-display font-semibold flex-shrink-0">
                  {initial}
                </div>
                <span className="text-sm font-medium text-dark hidden sm:inline">Admin</span>
                <ChevronDown size={16} className="text-dark-muted hidden sm:inline" aria-hidden="true" />
              </button>

              {profileOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setProfileOpen(false)} />
                  <div role="menu" aria-label="Admin account" className="absolute right-0 top-full mt-2 w-56 bg-white rounded-md shadow-card-hover border border-background-warm py-2 z-20">
                    <p className="px-4 py-2 text-xs text-dark-muted truncate border-b border-background-warm mb-1">{user?.email}</p>
                    <button
                      role="menuitem"
                      onClick={handleSignOut}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-dark hover:bg-primary/5 hover:text-primary w-full transition-colors"
                    >
                      <LogOut size={16} aria-hidden="true" />
                      Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className={`flex-1 min-w-0 p-4 sm:p-6 lg:p-6 ${fixedHeight ? 'overflow-hidden flex flex-col min-h-0' : ''}`}>
          {children}
        </main>
      </div>

      <ScrollToTopButton leftClass="left-6" />
    </div>
  );
}