import { useContext, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { NAV_GROUPS, ADMIN_NAV_ITEM, type NavItem } from '@/config/navigation';
import { Tooltip } from '@/components/ui/Tooltip';
import { casesApi, ApiError } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { DataSyncContext } from '@/lib/dataSync';
import { parseCsv } from '@/lib/csv';
import { extractCaseNumbers } from '@/pages/Admin/csvValidation';
import { SidebarSearch } from './SidebarSearch';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  appTitle?: string;
  teamName?: string;
}

/**
 * Sidebar — ported from <aside class="sidebar"> in index.html + the
 * .sidebar / .nav-item / .nav-children rules in css/features/atlassian.css
 * and css/core/components.css (nav-parent/children consolidation block).
 */
export function Sidebar({ collapsed, onToggleCollapsed, appTitle = 'IBM Cases', teamName = 'BD/TOA-ETS5' }: SidebarProps) {
  return (
    <aside
      data-sidebar
      className={[
        'relative z-[200] flex h-screen flex-col overflow-hidden bg-sidebar-bg transition-[width,min-width] duration-[280ms] ease-iip',
        collapsed ? 'w-14 min-w-14' : 'w-sidebar-width min-w-sidebar-width',
      ].join(' ')}
    >
      <SidebarBrand
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
        appTitle={appTitle}
        teamName={teamName}
      />

      {!collapsed && <SidebarSearch />}

      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2" aria-label="Main navigation">
        {NAV_GROUPS.map((group, i) => (
          <div key={i} className="mb-1">
            {group.label && !collapsed && (
              <div className="px-4 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-wide-iip text-white/[0.28]">
                {group.label}
              </div>
            )}
            {group.items.map((item) =>
              item.children ? (
                <NavParent key={item.tab} item={item} collapsed={collapsed} />
              ) : (
                <NavLeaf key={item.tab} item={item} collapsed={collapsed} />
              ),
            )}
          </div>
        ))}
      </nav>

      <SidebarFooter collapsed={collapsed} />
    </aside>
  );
}

function SidebarBrand({ collapsed, onToggleCollapsed, appTitle, teamName }: Pick<SidebarProps, 'collapsed' | 'onToggleCollapsed' | 'appTitle' | 'teamName'>) {
  return (
    <div
      className={[
        'flex min-h-[56px] flex-shrink-0 items-center gap-2.5 border-b border-white/[0.08] px-3.5 pb-3 pt-4',
        collapsed ? 'flex-col justify-center gap-2 px-0 pb-2.5 pt-3.5' : '',
      ].join(' ')}
    >
      <span className="block flex-shrink-0 rounded-sm bg-ibm-blue-50 px-2 py-[5px] text-[11px] font-bold tracking-wide-iip text-text-on-color">
        ALM
      </span>

      {!collapsed && (
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-bold text-bg-layer">{appTitle}</div>
          <div className="whitespace-nowrap font-mono text-[10px] tracking-[0.04em] text-white/35">{teamName}</div>
        </div>
      )}

      {!collapsed && (
        <Tooltip content="Collapse sidebar">
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label="Collapse sidebar"
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-sm bg-white/[0.07] text-white/45 transition-all hover:bg-white/[0.14] hover:text-text-on-color"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path d="M11 17l-5-5 5-5" />
              <path d="M18 17l-5-5 5-5" />
            </svg>
          </button>
        </Tooltip>
      )}

      {collapsed && (
        <Tooltip content="Expand sidebar" placement="right">
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label="Expand sidebar"
            className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-sm bg-white/10 text-white/60 transition-all hover:bg-white/[0.18] hover:text-text-on-color"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path d="M13 17l5-5-5-5" />
              <path d="M6 17l5-5-5-5" />
            </svg>
          </button>
        </Tooltip>
      )}
    </div>
  );
}

function navItemClasses(isActive: boolean, collapsed: boolean, isChild = false) {
  return [
    'group relative mx-1.5 my-px flex w-[calc(100%-12px)] items-center gap-2 whitespace-nowrap rounded-sm px-3.5 py-2 text-[13px] transition-all duration-[130ms]',
    isChild ? 'pl-7 text-xs' : '',
    isActive ? 'bg-ibm-blue-50/[0.22] font-semibold text-text-on-color' : 'text-white/[0.58] hover:bg-white/[0.08] hover:text-white/[0.88]',
    collapsed ? 'w-[calc(100%-8px)] justify-center px-0 py-[9px]' : '',
  ].join(' ');
}

function NavLeaf({ item, collapsed, isChild = false }: { item: NavItem; collapsed: boolean; isChild?: boolean }) {
  const link = (
    <NavLink to={item.path} data-label={item.label} className={({ isActive }) => navItemClasses(isActive, collapsed, isChild)}>
      {item.icon}
      {!collapsed && <span>{item.label}</span>}
    </NavLink>
  );

  // Collapsed sidebar has no visible label, so the item's name only shows
  // via the shared hover tooltip — same component every other tooltip in
  // the app uses, replacing what used to be a bespoke always-in-the-DOM
  // absolutely-positioned span faded in on `group-hover`.
  if (!collapsed) return link;

  return (
    <Tooltip content={item.label} placement="right" className="w-full">
      {link}
    </Tooltip>
  );
}

function NavParent({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const location = useLocation();
  const childActive = item.children!.some((c) => location.pathname === c.path);
  const [open, setOpen] = useState(childActive);

  if (collapsed) {
    // Collapsed sidebar: render children as flat leaves (no expand affordance available)
    return (
      <>
        {item.children!.map((child) => (
          <NavLeaf key={child.tab} item={child} collapsed={collapsed} />
        ))}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={[
          'relative flex w-[calc(100%-12px)] items-center gap-2 whitespace-nowrap rounded-sm px-3.5 py-2 text-[13px] transition-all duration-[130ms]',
          'mx-1.5 my-px cursor-pointer text-left',
          childActive ? 'text-sidebar-active-border' : 'text-white/[0.58] hover:bg-white/[0.08] hover:text-white/[0.88]',
        ].join(' ')}
      >
        {item.icon}
        <span>{item.label}</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          className={`ml-auto h-3 w-3 flex-shrink-0 opacity-45 transition-transform duration-200 ${open ? 'rotate-90 opacity-80' : ''}`}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
      <div
        className="ml-[18px] overflow-hidden border-l border-white/10 transition-[max-height] duration-[280ms] ease-iip-std"
        style={{ maxHeight: open ? 400 : 0 }}
      >
        {item.children!.map((child) => (
          <NavLeaf key={child.tab} item={child} collapsed={collapsed} isChild />
        ))}
      </div>
    </>
  );
}

function SidebarFooter({ collapsed }: { collapsed: boolean }) {
  const toast = useToast();
  const dataSync = useContext(DataSyncContext);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleReupload(file: File) {
    if (uploading) return; // guard against a second pick landing mid-upload
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('Re-upload failed', 'Only .csv files are accepted.');
      return;
    }

    setUploading(true);

    // Best-effort fingerprint pre-check: catches a re-export with the same
    // set of case numbers under a new filename (the backend's file-hash
    // dedup alone only catches byte-identical files).
    let caseNumbers: string[] = [];
    try {
      const text = await file.text();
      caseNumbers = extractCaseNumbers(parseCsv(text));
    } catch {
      // Preview-only extraction; upload proceeds regardless.
    }

    try {
      if (caseNumbers.length) {
        try {
          const fp = casesApi.buildCaseFingerprint(caseNumbers);
          const dup = await casesApi.checkFingerprint(fp);
          if (dup.duplicate) {
            toast.info(
              'Already up to date',
              `The same set of cases was already imported${dup.filename ? ` from "${dup.filename}"` : ''}.`,
            );
            return;
          }
        } catch {
          // Pre-check failing shouldn't block a real upload attempt.
        }
      }

      const res = await casesApi.uploadCasesCsv(file);

      if (res.status === 'success') {
        if (res.upload_id && caseNumbers.length) {
          casesApi.saveFingerprint(res.upload_id, casesApi.buildCaseFingerprint(caseNumbers)).catch(() => {});
        }
        if (res.versionTs) dataSync?.markMyUploadVersion(res.versionTs);
        toast.success(
          'Data re-uploaded',
          res.record_count != null ? `Imported ${res.record_count} records from ${res.filename}.` : res.filename,
        );
      } else if (res.status === 'skipped') {
        toast.info('Already up to date', res.reason || 'This file was already imported.');
      } else {
        toast.error('Re-upload failed', res.error || 'The server rejected this file.');
      }
    } catch (err) {
      toast.error('Re-upload failed', err instanceof ApiError ? err.message : 'Could not reach the server.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  if (collapsed) return null;

  return (
    <div className="flex-shrink-0 border-t border-white/[0.07] px-3 pb-4 pt-2.5">
      <div className="mt-1">
        <NavLink
          to={ADMIN_NAV_ITEM.path}
          className={({ isActive }) =>
            [
              'flex w-full items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-left text-[11px] font-medium transition-colors',
              isActive ? 'bg-sidebar-active-bg text-ibm-blue-60' : 'text-sidebar-text-dim hover:bg-sidebar-hover hover:text-sidebar-text',
            ].join(' ')
          }
        >
          {ADMIN_NAV_ITEM.icon}
          <span>{ADMIN_NAV_ITEM.label}</span>
        </NavLink>
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <Tooltip content="Logout from admin">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-sm border border-white/10 bg-white/[0.06] px-2.5 py-[5px] text-[11px] text-white/55 transition-colors hover:bg-white/10 hover:text-white/80"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Logout
          </button>
        </Tooltip>
        <Tooltip content={uploading ? 'Uploading…' : 'Upload a case listing CSV'}>
          <label
            className={[
              'inline-flex items-center gap-1.5 rounded-sm border border-white/10 bg-white/[0.06] px-2.5 py-[5px] text-[11px] text-white/55 transition-colors',
              uploading ? 'cursor-default opacity-60' : 'cursor-pointer hover:bg-white/10 hover:text-white/80',
            ].join(' ')}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            {uploading ? 'Uploading…' : 'Re-upload Data'}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              hidden
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleReupload(file);
              }}
            />
          </label>
        </Tooltip>
      </div>

      <a
        href="https://www.ibm.com/mysupport/s/createrecord/NewCase"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2.5 block rounded-sm bg-ibm-blue-50 px-2.5 py-[5px] text-center text-xs font-semibold text-text-on-color transition-colors hover:bg-ibm-blue-60"
      >
        + Open IBM Case
      </a>
    </div>
  );
}
