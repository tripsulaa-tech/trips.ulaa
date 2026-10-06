import { useEffect } from 'react';
import { collectStorageUrls } from '../utils/utils-index';
import { deleteImageByUrl } from '../services/api';
import { TIMING } from '../constants/limits';
import { STORAGE_BUCKET } from '../constants/storage';

// Unsaved-work keeper for the admin editors. While an editor differs from what is saved, its
// draft is written to sessionStorage (so it survives switching admin pages and a refresh, but
// not closing the tab). Each draft also remembers WHICH saved version it started from (`base`),
// so when the draft comes back and the saved version has changed in the meantime, the editor can
// hold the draft back instead of letting a later Save silently overwrite the newer data.
//
// Images uploaded for a draft are noted in a small localStorage ledger. If the draft is saved or
// discarded, its entry goes away. If the tab was simply closed, the entry survives and
// sweepAbandonedDraftUploads() deletes those files later instead of leaving them in storage.
//
// Storage problems (private mode, quota) are ignored on purpose: the editor then simply behaves
// as it did before drafts existed.

const PREFIX = 'ulaa.draft.';
const LEDGER_KEY = 'ulaa.draftUploads';
const ABANDONED_AFTER_MS = TIMING.draftExpiryMs;
const DEFAULT_BUCKET = STORAGE_BUCKET;

interface Envelope<T> {
  __draft: 1;
  /** stableStringify of the saved version this draft started from; null when unknown. */
  base: string | null;
  value: T;
}

function isEnvelope(v: unknown): v is Envelope<unknown> {
  return !!v && typeof v === 'object' && (v as { __draft?: unknown }).__draft === 1;
}

/** JSON with object keys sorted, so two reads of the same data compare equal even when the
 *  database returns the keys in a different order than the editor built them. */
export function stableStringify(value: unknown): string {
  const normalize = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(normalize);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) out[k] = normalize((v as Record<string, unknown>)[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(normalize(value)) ?? 'null';
}

// ---- Upload ledger ----------------------------------------------------------------------------

interface LedgerEntry { bucket: string; urls: string[]; at: number }
type Ledger = Record<string, LedgerEntry>;

function readLedger(): Ledger {
  try {
    const raw = window.localStorage.getItem(LEDGER_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Ledger) : {};
  } catch {
    return {};
  }
}

function writeLedger(ledger: Ledger) {
  try {
    if (Object.keys(ledger).length === 0) window.localStorage.removeItem(LEDGER_KEY);
    else window.localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
  } catch {
    /* ignore */
  }
}

/** Adds to the draft's list of uploaded files. The list only grows while the draft lives, so a
 *  photo that was uploaded and then replaced before saving is still found at cleanup time. */
function noteUploads(key: string, bucket: string, urls: string[]) {
  if (urls.length === 0) return;
  const ledger = readLedger();
  const known = new Set(ledger[key]?.urls ?? []);
  urls.forEach(u => known.add(u));
  ledger[key] = { bucket, urls: [...known], at: Date.now() };
  writeLedger(ledger);
}

function dropLedgerEntry(key: string) {
  const ledger = readLedger();
  if (key in ledger) {
    delete ledger[key];
    writeLedger(ledger);
  }
}

// ---- Draft storage ----------------------------------------------------------------------------

/** The draft's value, or null. Drafts written before versions were tracked read the same way. */
export function readDraft<T>(key: string): T | null {
  return readDraftWithBase<T>(key)?.value ?? null;
}

export function readDraftWithBase<T>(key: string): { value: T; base: string | null } | null {
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (isEnvelope(parsed)) return { value: parsed.value as T, base: parsed.base };
    return { value: parsed as T, base: null };
  } catch {
    return null;
  }
}

export function writeDraft(key: string, value: unknown, base: string | null = null) {
  try {
    const envelope: Envelope<unknown> = { __draft: 1, base, value };
    window.sessionStorage.setItem(PREFIX + key, JSON.stringify(envelope));
  } catch {
    /* ignore */
  }
}

/** Removes the draft. Use after a save (its uploads are now in use) or after the caller has
 *  already cleaned up the uploads itself. To also delete the draft's uploads, use discardDraft. */
export function clearDraft(key: string) {
  try {
    window.sessionStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
  dropLedgerEntry(key);
}

/** The draft is finished (saved, or edited back to the saved version): removes it, and deletes
 *  every image uploaded for it that the final version does not use. */
export function settleDraft(key: string, keepUrls: Set<string>) {
  const entry = readLedger()[key];
  if (entry) entry.urls.filter(u => !keepUrls.has(u)).forEach(url => deleteImageByUrl(entry.bucket, url).catch(() => {}));
  clearDraft(key);
}

/** Throws the draft away AND deletes the images that were uploaded only for it. */
export function discardDraft(key: string) {
  const entry = readLedger()[key];
  if (entry) entry.urls.forEach(url => deleteImageByUrl(entry.bucket, url).catch(() => {}));
  clearDraft(key);
}

/** Result of looking for a draft against the saved version that was just loaded. */
export interface DraftLookup<T> {
  /** A draft that started from the saved version now loaded: safe to put straight back. */
  draft: T | null;
  /** A draft that started from an OLDER saved version: held back until the admin chooses. */
  stale: T | null;
}

export function lookupDraft<T>(key: string, savedBase: string): DraftLookup<T> {
  const found = readDraftWithBase<T>(key);
  if (!found) return { draft: null, stale: null };
  if (found.base === null || found.base === savedBase) return { draft: found.value, stale: null };
  return { draft: null, stale: found.value };
}

/** Keeps `key`'s draft in step with `value` while it differs from the saved version `base`
 *  (a stableStringify of that saved version). Pass base = null while still loading. */
export function useDraftKeeper(opts: { key: string; value: unknown; base: string | null; enabled?: boolean; bucket?: string }) {
  const { key, value, base, enabled = true, bucket = DEFAULT_BUCKET } = opts;
  useEffect(() => {
    if (!enabled || base === null) return;
    if (stableStringify(value) === base) {
      // Nothing left to keep: the editor matches the saved version again. Files uploaded along
      // the way that the saved version doesn't use (replaced photos, abandoned edits) go too.
      let keep: Set<string>;
      try {
        keep = collectStorageUrls(JSON.parse(base), bucket);
      } catch {
        /* unreadable base: keep everything rather than risk deleting a file in use */
        clearDraft(key);
        return;
      }
      settleDraft(key, keep);
      return;
    }
    writeDraft(key, value, base);
    let baseUrls = new Set<string>();
    try {
      baseUrls = collectStorageUrls(JSON.parse(base), bucket);
    } catch {
      /* base unreadable: treat every URL as new, which only ever errs towards keeping files */
      baseUrls = new Set<string>();
    }
    noteUploads(key, bucket, [...collectStorageUrls(value, bucket)].filter(u => !baseUrls.has(u)));
  }, [key, value, base, enabled, bucket]);
}

// ---- Cleanup ----------------------------------------------------------------------------------

function hasLiveDraft(key: string): boolean {
  try {
    return window.sessionStorage.getItem(PREFIX + key) !== null;
  } catch {
    return false;
  }
}

/** Deletes uploads from drafts whose tab was closed without saving or discarding (older than a
 *  day, and not held by a draft in this tab). Safe to call on every admin page load. */
export function sweepAbandonedDraftUploads() {
  const ledger = readLedger();
  const now = Date.now();
  let changed = false;
  for (const [key, entry] of Object.entries(ledger)) {
    if (hasLiveDraft(key)) {
      if (now - entry.at > 60_000) { entry.at = now; changed = true; }
      continue;
    }
    if (now - entry.at < ABANDONED_AFTER_MS) continue;
    entry.urls.forEach(url => deleteImageByUrl(entry.bucket, url).catch(() => {}));
    delete ledger[key];
    changed = true;
  }
  if (changed) writeLedger(ledger);
}

export function hasAnyDraft(): boolean {
  try {
    for (let i = 0; i < window.sessionStorage.length; i++) {
      if (window.sessionStorage.key(i)?.startsWith(PREFIX)) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** Sign-out: nothing unsaved should outlive the session. Deletes every draft held by this tab
 *  together with the images uploaded only for them. */
export function discardAllDrafts() {
  const keys: string[] = [];
  try {
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const k = window.sessionStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k.slice(PREFIX.length));
    }
  } catch {
    return;
  }
  keys.forEach(discardDraft);
}

// ---- Pop-up forms (create/edit one record) -----------------------------------------------------
// A pop-up form keeps its draft as { recordId, form } measured against the blank form (new
// record) or the form built from the saved record (edit). When the page loads again, the draft
// either reopens the pop-up as it was, is held back because the record changed meanwhile, or is
// dropped because the record no longer exists.

export interface ModalDraftValue<F> { recordId: string | null; form: F }

export function modalDraftBase<F>(recordId: string | null, baseline: F): string {
  return stableStringify({ recordId, form: baseline });
}

export type ModalDraftResolution<F> =
  | { status: 'none' }
  | { status: 'resume' | 'stale'; recordId: string | null; form: F; baseline: F };

/** `baselineFor(recordId)` rebuilds the form from the CURRENT saved record (or the blank form
 *  for null) and returns null when that record no longer exists. */
export function resolveModalDraft<F>(key: string, baselineFor: (recordId: string | null) => F | null): ModalDraftResolution<F> {
  const found = readDraftWithBase<ModalDraftValue<F>>(key);
  if (!found || !found.value || typeof found.value !== 'object') return { status: 'none' };
  const { recordId, form } = found.value;
  const baseline = baselineFor(recordId ?? null);
  if (baseline === null) {
    discardDraft(key); // the record was deleted meanwhile
    return { status: 'none' };
  }
  const current = modalDraftBase(recordId ?? null, baseline);
  const status = found.base === null || found.base === current ? 'resume' : 'stale';
  return { status, recordId: recordId ?? null, form, baseline };
}
