import type { ReactNode } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Home, Briefcase, BookOpen, Image, MessageCircle,
  LogOut, Menu, X, ChevronDown, ExternalLink, FileText, Star, Sparkles, ListChecks,
  ChevronsLeft, ChevronsRight, UserCircle, PanelBottom, GripVertical
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/useAuth';
import NotificationsPanel from './NotificationsPanel';
import PushNotificationToggle from './PushNotificationToggle';
import ScrollToTopButton from '../components/layout/ScrollToTopButton';

interface AdminNavItemDef {
  to: string;
  icon: LucideIcon;
}

// Single source of truth for what each nav item links to / shows as an
// icon. Order and top-level-vs-grouped placement are handled separately
// below (NAV_ORDER_STORAGE_KEY) so the admin can drag any item — including
// "Dashboard" itself — anywhere they like.
const NAV_ITEM_DEFS: Record<string, AdminNavItemDef> = {
  Dashboard: { to: '/admin', icon: Home },
  'Upcoming Trips': { to: '/admin/trips', icon: Briefcase },
  'Completed Trips': { to: '/admin/albums', icon: BookOpen },
  'Instagram Moments': { to: '/admin/instagram-moments', icon: Image },
  Testimonials: { to: '/admin/testimonials', icon: Star },
  'About Page': { to: '/admin/about', icon: FileText },
  Founder: { to: '/admin/founder', icon: UserCircle },
  'Why ULAA': { to: '/admin/why-us', icon: Sparkles },
  'Bottom Nav Bar': { to: '/admin/bottom-nav', icon: PanelBottom },
  Enquiries: { to: '/admin/enquiries', icon: MessageCircle },
  Waitlist: { to: '/admin/waitlist', icon: ListChecks },
};

const DEFAULT_TOP_LEVEL_ORDER = ['Dashboard', 'Upcoming Trips', 'Completed Trips', 'About Page', 'Enquiries', 'Waitlist'];
const DEFAULT_GROUP_CHILDREN_ORDER = ['Instagram Moments', 'Testimonials', 'Bottom Nav Bar', 'Founder', 'Why ULAA'];

// "Dashboard" is the one item that renders as an expandable group (it's the
// only item other tabs can be dropped into) — everything else is a plain
// link, wherever the admin has dragged it to.
const GROUP_LABEL = 'Dashboard';

interface NavOrder {
  topLevel: string[];
  groupChildren: string[];
}

const NAV_ORDER_STORAGE_KEY = 'admin-sidebar-order';

function defaultNavOrder(): NavOrder {
  return { topLevel: [...DEFAULT_TOP_LEVEL_ORDER], groupChildren: [...DEFAULT_GROUP_CHILDREN_ORDER] };
}

// Reads the admin's saved drag-and-drop order, dropping any labels that no
// longer exist (e.g. a page was removed in a later update) and appending
// any new ones (e.g. a page was added) into their default spot — so a
// stale saved order never hides a real nav item.
function loadNavOrder(): NavOrder {
  try {
    const raw = window.localStorage.getItem(NAV_ORDER_STORAGE_KEY);
    if (!raw) return defaultNavOrder();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.topLevel) || !Array.isArray(parsed?.groupChildren)) return defaultNavOrder();

    const known = new Set(Object.keys(NAV_ITEM_DEFS));
    const seen = new Set<string>();
    const dedupeKnown = (labels: unknown[]) =>
      labels.filter((l): l is string => typeof l === 'string' && known.has(l) && !seen.has(l) && (seen.add(l), true));

    const topLevel = dedupeKnown(parsed.topLevel);
    const groupChildren = dedupeKnown(parsed.groupChildren);

    for (const label of known) {
      if (seen.has(label)) continue;
      (DEFAULT_GROUP_CHILDREN_ORDER.includes(label) ? groupChildren : topLevel).push(label);
    }

    if (!topLevel.includes(GROUP_LABEL)) topLevel.unshift(GROUP_LABEL);
    return { topLevel, groupChildren };
  } catch {
    return defaultNavOrder();
  }
}

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
  // Page-level (non-modal) admin screens like About/Why ULAA have no
  // save-on-close event to hook the way a modal does — the only signal
  // that something might be lost is the admin trying to navigate away.
  // If provided, this is checked before any sidebar/logo/"View Site" link
  // navigates; returning true blocks navigation until confirmed. This
  // covers in-app (SPA) navigation only — see the beforeunload handler
  // below for tab close/refresh/typed-URL navigation.
  hasUnsavedChanges?: () => boolean;
}

interface SidebarContentProps {
  userEmail?: string;
  initial: string;
  onNavigate: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  guardNavigate?: (e: React.MouseEvent) => void;
}

interface DragTarget {
  list: 'top' | 'child';
  label?: string;
}

function SidebarContent({ userEmail, initial, onNavigate, collapsed = false, onToggleCollapse, guardNavigate }: SidebarContentProps) {
  const location = useLocation();
  const [navOrder, setNavOrder] = useState<NavOrder>(loadNavOrder);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => ({
    [GROUP_LABEL]: navOrder.groupChildren.some(
      label => location.pathname === NAV_ITEM_DEFS[label].to || location.pathname.startsWith(`${NAV_ITEM_DEFS[label].to}/`)
    ),
  }));
  const [draggedLabel, setDraggedLabel] = useState<string | null>(null);
  // Every row (top-level item, group header, group child, plus the two
  // drop-only zones below) registers its wrapper element + what dropping
  // there means, keyed by a unique row id. Hit-tested by Y position on
  // every pointer move — this is what makes dragging work with touch as
  // well as a mouse, since native HTML5 drag-and-drop (draggable /
  // ondragstart) never fires from touch gestures on mobile browsers.
  const rowsRef = useRef<Map<string, { el: HTMLElement; target: DragTarget }>>(new Map());

  const toggleGroup = (label: string) => setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }));

  const updateOrder = (updater: (order: NavOrder) => NavOrder) => {
    setNavOrder(prev => {
      const next = updater(prev);
      saveNavOrder(next);
      return next;
    });
  };

  // Moves the item currently being dragged (read fresh via draggedLabelRef,
  // not the possibly-stale `draggedLabel` closure) to just before
  // `targetLabel` within `targetList`, or to the end of that list if
  // targetLabel is omitted. Called live as the pointer moves, so a drag
  // reorders in real time rather than only on release.
  const draggedLabelRef = useRef<string | null>(null);
  const moveDraggedTo = (targetList: 'top' | 'child', targetLabel?: string) => {
    const dragged = draggedLabelRef.current;
    if (!dragged || dragged === targetLabel) return;
    if (dragged === GROUP_LABEL && targetList === 'child') return; // can't nest the group inside itself

    updateOrder(prev => {
      const topLevel = prev.topLevel.filter(l => l !== dragged);
      const groupChildren = prev.groupChildren.filter(l => l !== dragged);
      const dest = targetList === 'top' ? topLevel : groupChildren;
      const insertAt = targetLabel ? dest.indexOf(targetLabel) : -1;
      dest.splice(insertAt === -1 ? dest.length : insertAt, 0, dragged);
      return { topLevel, groupChildren };
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
  // makes the handle feel completely dead — matching "long pressed and
  // tried to move but nothing happens". touch-action / select-none alone
  // don't stop these, so they're suppressed explicitly below.
  const GripHandle = ({ label, size = 14 }: { label: string; size?: number }) => (
    <span
      onPointerDown={startDrag(label)}
      onContextMenu={e => e.preventDefault()}
      draggable={false}
      onDragStart={e => e.preventDefault()}
      role="button"
      tabIndex={-1}
      aria-label={`Drag to reorder ${label}`}
      className="shrink-0 flex items-center justify-center w-8 h-10 -ml-1 touch-none select-none cursor-grab active:cursor-grabbing text-dark-muted/50 hover:text-dark-muted"
      style={{
        WebkitTouchCallout: 'none',
        WebkitUserDrag: 'none',
        WebkitTapHighlightColor: 'transparent',
      } as React.CSSProperties}
    >
      <GripVertical size={size} />
    </span>
  );

  return (
    <div className="flex flex-col h-full">
      <div className={`relative pt-6 pb-4 flex items-center ${collapsed ? 'flex-col gap-3 px-2' : 'justify-center px-6'}`}>
        <Link to="/" className="inline-block shrink-0" onClick={guardNavigate}>
          {collapsed ? (
            <img src="/favicon.svg" alt="ULAA" className="h-11 w-11" />
          ) : (
            <img src="/ULAA.svg" alt="ULAA" className="h-32" />
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
            {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
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
        {navOrder.topLevel.map(label => {
          const { to, icon: Icon } = NAV_ITEM_DEFS[label];

          if (label !== GROUP_LABEL) {
            return (
              <div
                key={to}
                ref={el => { if (el) rowsRef.current.set(label, { el, target: { list: 'top', label } }); else rowsRef.current.delete(label); }}
                className={`flex items-center gap-1 rounded-md ${collapsed ? 'justify-center' : ''} ${draggedLabel === label ? 'opacity-40' : ''}`}
              >
                {!collapsed && <GripHandle label={label} />}
                <NavLink
                  to={to}
                  end={to === '/admin'}
                  onClick={e => { guardNavigate?.(e); if (!e.defaultPrevented) onNavigate(); }}
                  title={collapsed ? label : undefined}
                  className={({ isActive }) => `
                    flex-1 flex items-center gap-3 py-3 rounded-md text-sm font-medium transition-all min-w-0
                    ${collapsed ? 'justify-center px-0' : 'px-3'}
                    ${isActive ? 'bg-primary text-white' : 'text-dark hover:bg-background-warm hover:text-primary'}
                  `}
                >
                  <Icon size={18} className="shrink-0" />
                  {!collapsed && <span className="truncate">{label}</span>}
                </NavLink>
              </div>
            );
          }

          // "Dashboard" — the one item that renders as an expandable group.
          // Collapsed rail has no room for a nested list, so it falls back
          // to a plain link there; only the expanded sidebar shows the
          // expand/collapse and accepts drops into/out of the group.
          const isOpen = !collapsed && (openGroups[GROUP_LABEL] ?? false);

          return (
            <div key={to}>
              <div
                ref={el => { if (el) rowsRef.current.set(label, { el, target: { list: 'top', label } }); else rowsRef.current.delete(label); }}
                className={`flex items-center gap-1 rounded-md ${collapsed ? 'justify-center' : ''} ${draggedLabel === label ? 'opacity-40' : ''}`}
              >
                {!collapsed && <GripHandle label={label} />}
                <NavLink
                  to={to}
                  end
                  onClick={e => { guardNavigate?.(e); if (!e.defaultPrevented) onNavigate(); }}
                  title={collapsed ? label : undefined}
                  className={({ isActive }) => `
                    flex-1 flex items-center gap-3 py-3 rounded-md text-sm font-medium transition-all min-w-0
                    ${collapsed ? 'justify-center px-0' : 'px-2'}
                    ${isActive ? 'bg-primary text-white' : 'text-dark hover:bg-background-warm hover:text-primary'}
                  `}
                >
                  <Icon size={18} className="shrink-0" />
                  {!collapsed && <span className="truncate">{label}</span>}
                </NavLink>
                {!collapsed && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(GROUP_LABEL)}
                    aria-label={isOpen ? `Collapse ${label}` : `Expand ${label}`}
                    aria-expanded={isOpen}
                    className="shrink-0 p-2.5 mr-1 rounded-md text-dark-muted hover:bg-background-warm hover:text-primary transition-colors"
                  >
                    <ChevronDown size={16} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                )}
              </div>

              {isOpen && (
                <div
                  ref={el => { if (el) rowsRef.current.set('__GROUP_END__', { el, target: { list: 'child' } }); else rowsRef.current.delete('__GROUP_END__'); }}
                  className="mt-1 ml-4 pl-3 py-1 space-y-1 border-l border-background-warm min-h-[8px]"
                >
                  {navOrder.groupChildren.map(childLabel => {
                    const child = NAV_ITEM_DEFS[childLabel];
                    return (
                      <div
                        key={child.to}
                        ref={el => { if (el) rowsRef.current.set(childLabel, { el, target: { list: 'child', label: childLabel } }); else rowsRef.current.delete(childLabel); }}
                        className={`flex items-center gap-1 rounded-md ${draggedLabel === childLabel ? 'opacity-40' : ''}`}
                      >
                        <GripHandle label={childLabel} size={13} />
                        <NavLink
                          to={child.to}
                          onClick={e => { guardNavigate?.(e); if (!e.defaultPrevented) onNavigate(); }}
                          className={({ isActive }) => `
                            flex-1 flex items-center gap-2.5 py-2.5 px-2 rounded-md text-sm font-medium transition-all min-w-0
                            ${isActive ? 'bg-primary text-white' : 'text-dark hover:bg-background-warm hover:text-primary'}
                          `}
                        >
                          <child.icon size={16} className="shrink-0" />
                          <span className="truncate">{childLabel}</span>
                        </NavLink>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Trailing drop zone — lets a dragged group child be un-nested
            back to the top level by dragging it below the last item. */}
        {!collapsed && draggedLabel && (
          <div
            ref={el => { if (el) rowsRef.current.set('__TOP_END__', { el, target: { list: 'top' } }); else rowsRef.current.delete('__TOP_END__'); }}
            className="h-10 rounded-md border-2 border-dashed border-primary/30"
          />
        )}
      </nav>

      <div className={`p-4 border-t border-background-warm ${collapsed ? 'px-2' : ''}`}>
        <Link
          to="/"
          onClick={guardNavigate}
          title={collapsed ? 'View Site' : undefined}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-md border border-background-warm text-sm font-medium text-dark hover:bg-background-warm transition-colors ${collapsed ? 'px-0' : 'px-4'}`}
        >
          <ExternalLink size={16} className="shrink-0" />
          {!collapsed && 'View Site'}
        </Link>
      </div>
    </div>
  );
}

const SIDEBAR_COLLAPSED_KEY = 'admin-sidebar-collapsed';

export default function AdminLayout({ children, title, subtitle, hasUnsavedChanges }: AdminLayoutProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
  const guardNavigate = (e: React.MouseEvent) => {
    if (!hasUnsavedChanges || !hasUnsavedChanges()) return;
    if (!window.confirm('You have unsaved changes that will be lost. Leave this page anyway?')) {
      e.preventDefault();
    }
  };

  const handleSignOut = async () => {
    if (hasUnsavedChanges?.() && !window.confirm('You have unsaved changes that will be lost. Sign out anyway?')) {
      return;
    }
    await signOut();
    navigate('/admin');
  };

  const initial = 'A';

  return (
    <div className="min-h-screen bg-background flex">
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
          <div className="relative w-72 bg-white flex flex-col z-50">
            <button onClick={() => setSidebarOpen(false)} className="absolute top-4 right-4 p-2 rounded-md text-dark-muted hover:bg-background">
              <X size={20} />
            </button>
            <SidebarContent userEmail={user?.email} initial={initial} onNavigate={() => setSidebarOpen(false)} guardNavigate={guardNavigate} />
          </div>
        </div>
      )}

      {/* Main */}
      <div className={`flex-1 min-w-0 min-h-screen flex flex-col transition-all duration-200 ${collapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        {/* Top bar */}
        <header className="bg-white border-b border-background-warm px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-md text-dark hover:bg-background flex-shrink-0"
            >
              <Menu size={20} />
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
                className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-background-warm transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center text-sm font-display font-semibold flex-shrink-0">
                  {initial}
                </div>
                <span className="text-sm font-medium text-dark hidden sm:inline">Admin</span>
                <ChevronDown size={16} className="text-dark-muted hidden sm:inline" />
              </button>

              {profileOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setProfileOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-md shadow-card-hover border border-background-warm py-2 z-20">
                    <p className="px-4 py-2 text-xs text-dark-muted truncate border-b border-background-warm mb-1">{user?.email}</p>
                    <button
                      onClick={handleSignOut}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-dark hover:bg-red-50 hover:text-red-600 w-full transition-colors"
                    >
                      <LogOut size={16} />
                      Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-6">
          {children}
        </main>
      </div>

      <ScrollToTopButton leftClass={collapsed ? 'left-6 lg:left-[6.5rem]' : 'left-6 lg:left-[17.5rem]'} />
    </div>
  );
}