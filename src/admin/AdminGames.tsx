import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';
import { Plus, Trash as Trash2, PencilSimple as Edit2, MagnifyingGlass as Search, ArrowCounterClockwise, ClipboardText, Info, CaretDown, X, Sparkle, Boat, FilmSlate, UsersThree } from '@phosphor-icons/react';
import AdminLayout from './AdminLayout';
import TruthOrDareHost from './games/TruthOrDareHost';
import StowawayHost from './games/StowawayHost';
import LinkGameHost from './games/LinkGameHost';
import TwinRoomHost from './games/TwinRoomHost';
import TripRosterPanel from './games/TripRoster';
import { useTripRoster } from './games/useTripRoster';
import DumbCharadesGame from '../components/ui/DumbCharadesGame';
import { loadPersisted, savePersisted } from '../utils/sessionState';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Select from '../components/ui/Select';
import { useToast } from '../components/ui/useToast';
import { useConfirm } from '../components/ui/useConfirm';
import { FORM_INPUT_CLASS as inputClass } from '../constants/formStyles';
import {
  getCachedGameContent, loadGameContent, resetGameContent, saveGameContent, type GameContentKey,
} from '../services/api/gameContent';
import {
  TOD_DEFAULTS, TOD_LEVELS, TOD_MAX_PROMPT, sanitizeTodContent, type TodContent, type TodKind, type TodLevel,
} from '../components/ui/truthOrDareData';
import {
  CHARADES_DEFAULTS, MAX_YEAR, MIN_YEAR, cleanMovie, sanitizeCharadesContent, type CharadesContent, type MovieInput,
} from '../components/ui/charadesTamilMovies';
import {
  CATEGORY_LABEL, LEVELS, STOWAWAY_CATEGORIES, STOWAWAY_DEFAULTS, STOWAWAY_LEVELS, sanitizeStowawayContent,
  type StowawayContent,
} from '../components/ui/stowawayWords';
import {
  TWIN_DEFAULT_WEIGHT, TWIN_ICONS, TWIN_ICON_KEYS, TWIN_MAX_LABEL, TWIN_MAX_QUESTIONS, TWIN_MAX_ROUNDS, TWIN_MAX_WEIGHT,
  TWIN_MIN_QUESTIONS, TWIN_MIN_WEIGHT, TWIN_PROMPTS_DEFAULTS, sanitizeTwinPrompts,
  type TwinOptionDraft, type TwinPromptsContent, type TwinQuestionDraft,
} from '../components/ui/findMyTwinEngine';
import { useCloseOnOutsideClick } from '../hooks/useCloseOnOutsideClick';

// Admin -> Games: edit what each game asks. Edits are saved to `site_content`
// (see services/api/gameContent.ts) and the games pick them up on their next
// load; "Restore built-in" removes the edits so a game goes back to the content
// that ships with the app.

type OnDirty = (id: string, dirty: boolean) => void;
type Prepared<T> = { value: T } | { error: string };

// ── Shared editor state: draft vs saved, save / discard / restore ──
function useGameEditor<T>(id: string, key: GameContentKey, defaults: T, sanitize: (raw: unknown) => T | null, onDirty: OnDirty) {
  const toast = useToast();
  const confirm = useConfirm();
  const [init] = useState(() => {
    const raw = getCachedGameContent(key);
    const clean = raw !== undefined ? sanitize(raw) : null;
    return { value: clean ?? defaults, custom: clean !== null };
  });
  const [draft, setDraft] = useState<T>(init.value);
  const [saved, setSaved] = useState<T>(init.value);
  const [custom, setCustom] = useState(init.custom);
  const [saving, setSaving] = useState(false);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  useEffect(() => { onDirty(id, dirty); }, [id, dirty, onDirty]);
  useEffect(() => () => onDirty(id, false), [id, onDirty]);

  const save = async (prepare: (d: T) => Prepared<T>) => {
    const result = prepare(draft);
    if ('error' in result) { toast.error(result.error); return; }
    setSaving(true);
    try {
      await saveGameContent(key, result.value);
      setDraft(result.value);
      setSaved(result.value);
      setCustom(true);
      toast.success('Saved. The game uses these from its next load.');
    } catch (err) {
      console.error(err);
      toast.error("Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    const ok = await confirm({
      title: 'Restore built-in content?',
      message: 'Your edits for this game are removed and it goes back to the content that came with the app. This cannot be undone.',
      confirmLabel: 'Restore',
    });
    if (!ok) return;
    setSaving(true);
    try {
      await resetGameContent(key);
      setDraft(defaults);
      setSaved(defaults);
      setCustom(false);
      toast.success('Restored the built-in content.');
    } catch (err) {
      console.error(err);
      toast.error("Couldn't restore. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return { draft, setDraft, dirty, custom, saving, save, reset, discard: () => setDraft(saved) };
}

function EditorBar({ dirty, custom, saving, onSave, onDiscard, onReset }: {
  dirty: boolean; custom: boolean; saving: boolean; onSave: () => void; onDiscard: () => void; onReset: () => void;
}) {
  // Quiet when nothing changed (just the status); Discard and Save appear once there is something to save.
  return (
    <div className={`sticky bottom-3 z-10 rounded-2xl border bg-white/95 backdrop-blur shadow-warm-lg px-3 sm:px-4 py-2 sm:py-2.5 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 transition-colors ${dirty ? 'border-primary/40' : 'border-background-warm'}`}>
      <div className="flex items-center gap-2 sm:mr-auto min-w-0">
        <span className={`w-2 h-2 shrink-0 rounded-full ${dirty ? 'bg-amber-500' : custom ? 'bg-green-600' : 'bg-dark-muted/40'}`} aria-hidden="true" />
        <span className={`text-xs sm:text-sm ${dirty ? 'text-dark font-semibold' : 'text-dark-muted'}`} role="status">
          {dirty ? 'Unsaved changes' : custom ? 'Saved · the game uses your edits' : 'Showing the default content'}
        </span>
        {custom && (
          <button type="button" onClick={onReset} disabled={saving} className="ml-auto sm:ml-2 inline-flex items-center gap-1.5 text-sm font-medium text-dark-muted hover:text-primary disabled:opacity-50 min-h-[44px] px-2">
            <ArrowCounterClockwise size={16} aria-hidden="true" /> Restore built-in
          </button>
        )}
      </div>
      {dirty && (
        <div className="flex gap-3 pb-1 sm:pb-0">
          <Button variant="outline" size="sm" className="flex-1 sm:flex-none sm:min-w-[8rem]" onClick={onDiscard} disabled={saving}>Discard</Button>
          <Button size="sm" className="flex-1 sm:flex-none sm:min-w-[8rem]" onClick={onSave} loading={saving} disabled={saving}>Save changes</Button>
        </div>
      )}
    </div>
  );
}

function Segmented<T extends string>({ value, onChange, options, label, tone = 'soft', stretch = true }: {
  value: T; onChange: (v: T) => void; options: { id: T; label: string; count?: number }[]; label: string;
  /** 'white' is the top-level look (sits on the page); 'soft' sits inside a card. */
  tone?: 'soft' | 'white'; stretch?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // On a narrow screen the row scrolls sideways: keep the chosen option in view.
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [value]);
  return (
    <div
      ref={ref}
      role="tablist"
      aria-label={label}
      className={`flex gap-1 rounded-lg p-1 overflow-x-auto no-scrollbar max-w-full ${stretch ? 'w-full sm:w-auto' : 'w-full sm:w-auto'} sm:inline-flex ${tone === 'white' ? 'bg-white shadow-card' : 'bg-background-warm/60'}`}
    >
      {options.map(o => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.id)}
            className={`shrink-0 whitespace-nowrap px-3 min-h-[36px] rounded-md text-sm font-button font-semibold transition-colors ${stretch ? 'max-sm:flex-1' : ''} ${on ? 'bg-primary text-white' : tone === 'white' ? 'text-dark hover:bg-background-warm' : 'text-dark hover:bg-white'}`}
          >
            {o.label}
            {o.count !== undefined && <span className={`ml-1.5 text-xs font-semibold tabular-nums ${on ? 'text-white/85' : 'text-dark-muted'}`}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

const Card = ({ children }: { children: ReactNode }) => <div className="bg-white rounded-2xl shadow-card p-3 sm:p-5 space-y-3 sm:space-y-4">{children}</div>;

// Explanations are folded away by default so the list is the first thing you
// see; `always` keeps short, essential instructions open.
const Hint = ({ children, always = false, title = 'How this works' }: { children: ReactNode; always?: boolean; title?: string }) => (
  always ? (
    <p className="text-sm text-dark-muted leading-relaxed">{children}</p>
  ) : (
    <details className="group rounded-lg bg-background-warm/50 text-sm text-dark-muted">
      <summary className="flex items-center gap-2 cursor-pointer select-none list-none min-h-[44px] px-3 font-medium text-dark [&::-webkit-details-marker]:hidden">
        <Info size={16} weight="duotone" className="text-primary shrink-0" aria-hidden="true" />
        {title}
        <CaretDown size={14} className="ml-auto shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="px-3 pb-3 leading-relaxed">{children}</div>
    </details>
  )
);

// A textarea that grows with its text, so a whole prompt is always visible.
// `focus` moves the cursor into it (then calls `onFocused`).
function AutoTextarea({ value, className, focus = false, onFocused, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string; focus?: boolean; onFocused?: () => void }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    // scrollHeight leaves out the border, so add it back or the last line is clipped.
    el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`;
  }, [value]);
  useEffect(() => {
    if (!focus) return;
    const el = ref.current;
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    onFocused?.();
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps
  return <textarea {...rest} ref={ref} rows={1} value={value} className={`${className ?? ''} resize-none overflow-hidden`} />;
}

// ── The row above every list (the Dumb Charades layout, used everywhere) ──
// The search fills the row, with the total in its placeholder; then the primary
// Add button, then an outlined "Paste several". On a phone the search takes a full
// row and the two buttons share the next one. A list too short to need a search
// shows its count on the left instead.
function ListToolbar({ count, noun, plural, filtering = false, matching = 0, search, onPaste, addLabel, onAdd }: {
  count: number; noun: string; plural: string;
  /** True while a search or filter is narrowing the list; `matching` is how many rows match. */
  filtering?: boolean; matching?: number;
  search?: { value: string; onChange: (v: string) => void; placeholder: string; label: string };
  onPaste?: () => void; addLabel: string; onAdd: () => void;
}) {
  const grow = search ? 'max-sm:flex-1' : '';
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {search ? (
          <div className="relative flex-1 min-w-[12rem] max-sm:basis-full">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-muted pointer-events-none" aria-hidden="true" />
            <input
              type="search"
              value={search.value}
              onChange={e => search.onChange(e.target.value)}
              placeholder={search.placeholder}
              aria-label={search.label}
              className={`${inputClass} pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden`}
            />
            {search.value && (
              <button type="button" onClick={() => search.onChange('')} aria-label="Clear search" className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-md text-dark-muted hover:text-dark flex items-center justify-center">
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        ) : (
          <span className="mr-auto text-sm font-semibold text-dark tabular-nums whitespace-nowrap">{count} {count === 1 ? noun : plural}</span>
        )}
        <Button size="sm" className={grow} onClick={onAdd}>
          <Plus size={16} aria-hidden="true" /> {addLabel}
        </Button>
        {onPaste && (
          <Button variant="outline" size="sm" className={grow} onClick={onPaste}>
            <ClipboardText size={16} aria-hidden="true" /> Paste several
          </Button>
        )}
      </div>
      {filtering && <p className="text-xs text-dark-muted tabular-nums" role="status">{matching} of {count} {plural}</p>}
    </div>
  );
}

// ── A list of single-line texts: tap to edit, add, bulk-add, search, delete ──
// Rows are compact (the text, two lines at most) so a long list is quick to scroll;
// tapping one opens it for editing in place, one at a time. Only the first few
// rows show at once, with "Show more" for the rest.
// New items go to the TOP (right under the Add button) so you see them straight
// away; lists where the order matters (`rowPrefix`, e.g. "Round 1") add at the end.
const LIST_PAGE = 12;

function StringListEditor({ items, onChange, max, addLabel, placeholder, minRecommended, rowPrefix }: {
  items: string[]; onChange: (next: string[]) => void; max: number; addLabel: string; placeholder: string;
  minRecommended?: number; rowPrefix?: (i: number) => string;
}) {
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(LIST_PAGE);
  const toast = useToast();
  const ordered = !!rowPrefix;
  // The latest items and whether this list is still on screen, so "Undo" never writes into a stale list.
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);
  const aliveRef = useRef(true);
  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);

  const addBulk = () => {
    const lines = bulkText.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).map(l => l.slice(0, max));
    if (lines.length) onChange(ordered ? [...items, ...lines] : [...lines, ...items]);
    setBulkText('');
    setBulkOpen(false);
    setEditIdx(null);
  };
  const addOne = () => {
    setQuery('');
    if (ordered) {
      setEditIdx(items.length);
      setShown(s => Math.max(s, items.length + 1));
      onChange([...items, '']);
    } else {
      setEditIdx(0);
      onChange(['', ...items]);
    }
  };
  const removeAt = (i: number) => {
    const removed = items[i];
    onChange(items.filter((_, idx) => idx !== i));
    setEditIdx(e => (e === null || e === i ? null : e > i ? e - 1 : e));
    // Nothing worth restoring for a blank row.
    if (!removed.trim()) return;
    toast.info('Deleted.', {
      duration: 6000,
      action: {
        label: 'Undo',
        onClick: () => {
          if (!aliveRef.current) return;
          const cur = itemsRef.current;
          const next = [...cur];
          next.splice(Math.min(i, cur.length), 0, removed);
          onChange(next);
        },
      },
    });
  };

  const q = query.trim().toLowerCase();
  const rows = items.map((t, i) => ({ t, i })).filter(r => !q || r.t.toLowerCase().includes(q));
  const showSearch = items.length > 8;
  const visible = rows.slice(0, shown);

  return (
    <div className="space-y-3">
      {minRecommended !== undefined && items.length < minRecommended && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-md px-3 py-2">Only {items.length} here. Aim for at least {minRecommended} so rounds don't repeat too soon.</p>
      )}
      <ListToolbar
        count={items.length}
        noun="item"
        plural="items"
        filtering={!!q}
        matching={rows.length}
        search={showSearch ? { value: query, onChange: v => { setQuery(v); setShown(LIST_PAGE); setEditIdx(null); }, placeholder: `Search ${items.length} items`, label: 'Search this list' } : undefined}
        onPaste={() => setBulkOpen(true)}
        addLabel={addLabel}
        onAdd={addOne}
      />
      <ul className="divide-y divide-background-warm/70 border border-background-warm rounded-lg xl:grid xl:grid-cols-2 xl:gap-2 xl:divide-y-0 xl:border-0 xl:rounded-none">
        {visible.map(({ t, i }) => {
          const label = rowPrefix ? rowPrefix(i) : `Item ${i + 1}`;
          const editing = editIdx === i;
          return (
            <li key={i} className={`group flex items-start gap-1 pl-2 pr-1 xl:border xl:border-background-warm xl:rounded-lg ${editing ? 'bg-background-warm/40 py-2 xl:col-span-2' : ''}`}>
              <span className={`${rowPrefix ? 'w-14' : 'w-6'} shrink-0 ${editing ? 'pt-3' : 'pt-3.5'} text-right text-[11px] text-dark-muted tabular-nums`}>{rowPrefix ? rowPrefix(i) : i + 1}</span>
              <div className="flex-1 min-w-0">
                {editing ? (
                  <>
                    <AutoTextarea
                      focus
                      value={t}
                      maxLength={max}
                      aria-label={label}
                      placeholder={placeholder}
                      onChange={e => onChange(items.map((x, idx) => (idx === i ? e.target.value : x)))}
                      onBlur={() => setEditIdx(e => (e === i ? null : e))}
                      className={`${inputClass} min-h-[44px] leading-snug`}
                    />
                    {t.length >= max * 0.8 && <p className="mt-0.5 text-right text-[11px] text-dark-muted tabular-nums">{t.length}/{max}</p>}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditIdx(i)}
                    aria-label={`${label}: ${t || 'empty'}. Edit`}
                    className="w-full flex items-center gap-2 text-left cursor-pointer min-h-[48px] px-2 py-2.5 rounded-md text-sm leading-snug hover:bg-background-warm/60 focus-visible:bg-background-warm/60 transition-colors"
                  >
                    {t.trim()
                      ? <span className="line-clamp-2 text-dark flex-1 min-w-0">{t}</span>
                      : <span className="text-amber-700 flex-1 min-w-0">Empty. Tap to write it.</span>}
                    <Edit2 size={15} className="shrink-0 text-dark-muted sm:opacity-0 sm:group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity" aria-hidden="true" />
                  </button>
                )}
              </div>
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => removeAt(i)}
                aria-label={`Delete ${label.toLowerCase()}`}
                className="shrink-0 w-10 h-12 rounded-md text-dark-muted hover:text-red-600 hover:bg-red-50 flex items-center justify-center"
              >
                <Trash2 size={18} aria-hidden="true" />
              </button>
            </li>
          );
        })}
        {items.length === 0 && <li className="text-sm text-dark-muted py-3 text-center xl:col-span-2">Nothing here yet. Tap “{addLabel}” to start.</li>}
        {items.length > 0 && rows.length === 0 && <li className="text-sm text-dark-muted py-3 text-center xl:col-span-2">No matches for “{query}”.</li>}
      </ul>
      {rows.length > shown && (
        <div className="text-center"><Button variant="ghost" size="sm" onClick={() => setShown(n => n + LIST_PAGE)}>Show more ({rows.length - shown} left)</Button></div>
      )}
      <Modal
        isOpen={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Paste several"
        size="md"
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => setBulkOpen(false)}>Cancel</Button><Button size="sm" onClick={addBulk} disabled={!bulkText.trim()}>Add them</Button></div>}
      >
        <Hint always>One per line. Blank lines are skipped.</Hint>
        <textarea rows={10} value={bulkText} onChange={e => setBulkText(e.target.value)} className={`${inputClass} mt-3`} aria-label="Items, one per line" />
      </Modal>
    </div>
  );
}

// ─────────────────────────────── Truth or Dare ───────────────────────────────
const trimList = (l: string[]) => l.map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);

function TruthOrDareEditor({ onDirty }: { onDirty: OnDirty }) {
  const ed = useGameEditor<TodContent>('tod', 'truth-or-dare', TOD_DEFAULTS, sanitizeTodContent, onDirty);
  const [view, setView] = useState<TodKind | 'twists'>('truth');
  const [level, setLevel] = useState<TodLevel>('chill');
  const { draft, setDraft } = ed;

  const setList = (kind: TodKind, lvl: TodLevel, next: string[]) =>
    setDraft(d => ({ ...d, prompts: { ...d.prompts, [kind]: { ...d.prompts[kind], [lvl]: next } } }));

  const prepare = (d: TodContent): Prepared<TodContent> => {
    const prompts = {} as TodContent['prompts'];
    for (const kind of ['truth', 'dare'] as TodKind[]) {
      prompts[kind] = {} as Record<TodLevel, string[]>;
      for (const l of TOD_LEVELS) {
        const list = trimList(d.prompts[kind][l.id]);
        if (!list.length) return { error: `${kind === 'truth' ? 'Truths' : 'Dares'} · ${l.label} needs at least one prompt.` };
        prompts[kind][l.id] = list;
      }
    }
    const twists = d.twists.filter(t => t.title.trim() || t.text.trim());
    if (twists.some(t => !t.title.trim() || !t.text.trim())) return { error: 'Every twist card needs both a title and text.' };
    if (!twists.length) return { error: 'Keep at least one twist card.' };
    return { value: { prompts, twists: twists.map(t => ({ title: t.title.replace(/\s+/g, ' ').trim(), text: t.text.replace(/\s+/g, ' ').trim() })) } };
  };

  return (
    <div className="space-y-4">
      <Card>
        <Hint>Truths and dares are shuffled per game and never repeat until a list runs out. <strong>Heat up</strong> mode moves from Chill to Spicy to Wild as rounds go on, so keep all three levels stocked. Twist cards involve the whole group and show up on "Surprise me".</Hint>
        <div className="flex flex-wrap gap-3">
          <Segmented<TodKind | 'twists'> label="Card type" value={view} onChange={setView} options={[
            { id: 'truth', label: 'Truths' }, { id: 'dare', label: 'Dares' }, { id: 'twists', label: 'Twist cards', count: draft.twists.length },
          ]} />
          {view !== 'twists' && (
            <Segmented<TodLevel> label="Heat level" value={level} onChange={setLevel} options={TOD_LEVELS.map(l => ({ id: l.id, label: l.label, count: draft.prompts[view][l.id].length }))} />
          )}
        </div>
        {view !== 'twists' ? (
          <StringListEditor
            key={`${view}-${level}`}
            items={draft.prompts[view][level]}
            onChange={next => setList(view, level, next)}
            max={TOD_MAX_PROMPT}
            addLabel={view === 'truth' ? 'Add a truth' : 'Add a dare'}
            placeholder={view === 'truth' ? 'A question for the player to answer honestly…' : 'Something for the player to do…'}
            minRecommended={10}
          />
        ) : (
          <div className="space-y-3">
            <ListToolbar count={draft.twists.length} noun="twist card" plural="twist cards" addLabel="Add a twist card" onAdd={() => setDraft(d => ({ ...d, twists: [{ title: '', text: '' }, ...d.twists] }))} />
            {draft.twists.map((t, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="grid sm:grid-cols-[12rem_minmax(0,1fr)] gap-2 flex-1 min-w-0">
                  <input aria-label={`Twist ${i + 1} title`} value={t.title} maxLength={60} placeholder="Title, e.g. Hot seat" onChange={e => setDraft(d => ({ ...d, twists: d.twists.map((x, idx) => (idx === i ? { ...x, title: e.target.value } : x)) }))} className={inputClass} />
                  <textarea aria-label={`Twist ${i + 1} text`} rows={2} value={t.text} maxLength={TOD_MAX_PROMPT} placeholder="What the group has to do…" onChange={e => setDraft(d => ({ ...d, twists: d.twists.map((x, idx) => (idx === i ? { ...x, text: e.target.value } : x)) }))} className={`${inputClass} resize-y`} />
                </div>
                <button type="button" aria-label={`Delete twist ${i + 1}`} onClick={() => setDraft(d => ({ ...d, twists: d.twists.filter((_, idx) => idx !== i) }))} className="shrink-0 w-10 h-10 rounded-md text-dark-muted hover:text-red-600 hover:bg-red-50 flex items-center justify-center"><Trash2 size={18} aria-hidden="true" /></button>
              </div>
            ))}
          </div>
        )}
      </Card>
      <EditorBar dirty={ed.dirty} custom={ed.custom} saving={ed.saving} onSave={() => void ed.save(prepare)} onDiscard={ed.discard} onReset={() => void ed.reset()} />
    </div>
  );
}

// ─────────────────────────────── Dumb Charades ───────────────────────────────
const joinNames = (l: string[]) => l.join(', ');
const splitNames = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean);
const PAGE = 40;

interface MovieForm { title: string; year: string; heroes: string; heroines: string; director: string; comedians: string }
const emptyMovie: MovieForm = { title: '', year: '', heroes: '', heroines: '', director: '', comedians: '' };
const toForm = (m: MovieInput): MovieForm => ({ title: m.title, year: String(m.year), heroes: joinNames(m.heroes), heroines: joinNames(m.heroines), director: m.director, comedians: joinNames(m.comedians) });

function CharadesEditor({ onDirty }: { onDirty: OnDirty }) {
  const ed = useGameEditor<CharadesContent>('charades', 'charades-tamil', CHARADES_DEFAULTS, sanitizeCharadesContent, onDirty);
  const toast = useToast();
  const confirm = useConfirm();
  const { draft, setDraft } = ed;
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [form, setForm] = useState<MovieForm | null>(null);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = draft.movies.map((m, i) => ({ m, i }));
    if (!q) return all;
    return all.filter(({ m }) => [m.title, String(m.year), m.director, ...m.heroes, ...m.heroines, ...m.comedians].some(x => x.toLowerCase().includes(q)));
  }, [draft.movies, search]);

  const openAdd = () => { setEditIdx(null); setForm({ ...emptyMovie }); };
  const openEdit = (i: number) => { setEditIdx(i); setForm(toForm(draft.movies[i])); };

  const submitForm = () => {
    if (!form) return;
    const movie = cleanMovie({ title: form.title, year: form.year, heroes: splitNames(form.heroes), heroines: splitNames(form.heroines), director: form.director, comedians: splitNames(form.comedians) });
    if (!movie) { toast.error(`Enter a title and a year between ${MIN_YEAR} and ${MAX_YEAR}.`); return; }
    const dup = draft.movies.some((x, i) => i !== editIdx && x.title.toLowerCase() === movie.title.toLowerCase() && x.year === movie.year);
    if (dup) { toast.error('That film (same title and year) is already in the list.'); return; }
    setDraft(d => ({ movies: editIdx === null ? [movie, ...d.movies] : d.movies.map((x, i) => (i === editIdx ? movie : x)) }));
    setForm(null);
  };

  const remove = async (i: number) => {
    if (!(await confirm({ title: 'Delete this film?', message: `"${draft.movies[i].title}" is removed from the game once you save.`, confirmLabel: 'Delete' }))) return;
    setDraft(d => ({ movies: d.movies.filter((_, idx) => idx !== i) }));
  };

  // Bulk lines: Title | Year | Heroes | Heroines | Director | Comedians (pipe or tab separated).
  const parsed = useMemo(() => {
    const out: MovieInput[] = [];
    let skipped = 0;
    for (const line of bulkText.split('\n').map(l => l.trim()).filter(Boolean)) {
      const [title, year, heroes, heroines, director, comedians] = line.split(/\||\t/).map(x => x.trim());
      const m = cleanMovie({ title, year, heroes: splitNames(heroes ?? ''), heroines: splitNames(heroines ?? ''), director: director ?? '', comedians: splitNames(comedians ?? '') });
      if (m) out.push(m); else skipped++;
    }
    return { out, skipped };
  }, [bulkText]);

  const addBulk = () => {
    const have = new Set(draft.movies.map(m => `${m.title.toLowerCase()}|${m.year}`));
    const fresh = parsed.out.filter(m => !have.has(`${m.title.toLowerCase()}|${m.year}`));
    setDraft(d => ({ movies: [...fresh, ...d.movies] }));
    toast.success(`Added ${fresh.length} film${fresh.length === 1 ? '' : 's'}${parsed.out.length - fresh.length ? ` (${parsed.out.length - fresh.length} already there)` : ''}.`);
    setBulkText('');
    setBulkOpen(false);
  };

  const prepare = (d: CharadesContent): Prepared<CharadesContent> => {
    if (d.movies.length < 5) return { error: 'Keep at least 5 films so a round has something to draw.' };
    return { value: d };
  };

  const field = (label: string, key: keyof MovieForm, props: { placeholder?: string; type?: string; hint?: string } = {}) => (
    <label className="block">
      <span className="block text-sm font-medium text-dark mb-1">{label}</span>
      <input value={form?.[key] ?? ''} type={props.type ?? 'text'} inputMode={props.type === 'number' ? 'numeric' : undefined} placeholder={props.placeholder} onChange={e => setForm(f => (f ? { ...f, [key]: e.target.value } : f))} className={inputClass} />
      {props.hint && <span className="block text-xs text-dark-muted mt-1">{props.hint}</span>}
    </label>
  );

  return (
    <div className="space-y-4">
      <Card>
        <Hint>Players can pick films by decade, hero, heroine, director or comedian. A person appears in those pickers once they have <strong>3 or more films</strong> here, so spell names <strong>exactly the same</strong> every time (for example "Kamal Haasan", never "Kamal").</Hint>
        <ListToolbar
          count={draft.movies.length}
          noun="film"
          plural="films"
          filtering={!!search.trim()}
          matching={rows.length}
          search={{ value: search, onChange: v => { setSearch(v); setShown(PAGE); }, placeholder: `Search ${draft.movies.length} films, people or years`, label: 'Search films' }}
          onPaste={() => setBulkOpen(true)}
          addLabel="Add film"
          onAdd={openAdd}
        />

        <ul className="divide-y divide-background-warm border border-background-warm rounded-lg">
          {rows.slice(0, shown).map(({ m, i }) => (
            <li key={`${m.title}-${m.year}-${i}`} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-dark truncate">{m.title} <span className="font-normal text-dark-muted">({m.year})</span></p>
                <p className="text-xs text-dark-muted truncate">{[joinNames(m.heroes), m.director && `dir. ${m.director}`, m.heroines.length ? joinNames(m.heroines) : '', m.comedians.length ? `comedy: ${joinNames(m.comedians)}` : ''].filter(Boolean).join(' · ')}</p>
              </div>
              <button type="button" onClick={() => openEdit(i)} aria-label={`Edit ${m.title}`} className="w-10 h-10 rounded-md text-dark-muted hover:text-primary hover:bg-background-warm flex items-center justify-center"><Edit2 size={18} aria-hidden="true" /></button>
              <button type="button" onClick={() => void remove(i)} aria-label={`Delete ${m.title}`} className="w-10 h-10 rounded-md text-dark-muted hover:text-red-600 hover:bg-red-50 flex items-center justify-center"><Trash2 size={18} aria-hidden="true" /></button>
            </li>
          ))}
          {rows.length === 0 && <li className="px-3 py-6 text-center text-sm text-dark-muted">No films match.</li>}
        </ul>
        {rows.length > shown && (
          <div className="text-center"><Button variant="ghost" size="sm" onClick={() => setShown(s => s + PAGE)}>Show more ({rows.length - shown} left)</Button></div>
        )}
      </Card>

      <Modal
        isOpen={form !== null}
        onClose={() => setForm(null)}
        title={editIdx === null ? 'Add a film' : 'Edit film'}
        size="md"
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => setForm(null)}>Cancel</Button><Button size="sm" onClick={submitForm}>{editIdx === null ? 'Add film' : 'Done'}</Button></div>}
      >
        <div className="space-y-3">
          {field('Title', 'title', { placeholder: 'e.g. Baashha' })}
          {field('Year', 'year', { type: 'number', placeholder: 'e.g. 1995' })}
          {field('Heroes', 'heroes', { hint: 'Separate several names with commas.' })}
          {field('Heroines', 'heroines', { hint: 'Optional. Separate several names with commas.' })}
          {field('Director', 'director')}
          {field('Comedians', 'comedians', { hint: 'Optional. Only if they are a big part of the film.' })}
        </div>
      </Modal>

      <Modal
        isOpen={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Paste several films"
        size="lg"
        footer={<div className="flex items-center justify-end gap-2"><span className="mr-auto text-xs text-dark-muted">{parsed.out.length} ready{parsed.skipped ? `, ${parsed.skipped} skipped (needs a title and year)` : ''}</span><Button variant="ghost" size="sm" onClick={() => setBulkOpen(false)}>Cancel</Button><Button size="sm" onClick={addBulk} disabled={!parsed.out.length}>Add {parsed.out.length || ''}</Button></div>}
      >
        <Hint always>One film per line, in this order, separated by <code>|</code> (or tabs, so you can paste straight from a spreadsheet):</Hint>
        <p className="mt-2 text-xs font-mono bg-background-warm/60 rounded-md px-3 py-2 break-words">Title | Year | Heroes | Heroines | Director | Comedians</p>
        <textarea rows={10} value={bulkText} onChange={e => setBulkText(e.target.value)} aria-label="Films, one per line" placeholder="Baashha|1995|Rajinikanth|Nagma|Suresh Krishna|" className={`${inputClass} mt-3 font-mono`} />
      </Modal>

      <EditorBar dirty={ed.dirty} custom={ed.custom} saving={ed.saving} onSave={() => void ed.save(prepare)} onDiscard={ed.discard} onReset={() => void ed.reset()} />
    </div>
  );
}

// ─────────────────────────────────── Stowaway ───────────────────────────────────
type StowView = 'pairs' | 'challenges' | 'dares';

function StowawayEditor({ onDirty }: { onDirty: OnDirty }) {
  const ed = useGameEditor<StowawayContent>('stowaway', 'stowaway', STOWAWAY_DEFAULTS, sanitizeStowawayContent, onDirty);
  const { draft, setDraft } = ed;
  const [view, setView] = useState<StowView>('pairs');
  const [cat, setCat] = useState<string>('all');
  const [lvl, setLvl] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(PAGE);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return draft.pairs
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => (cat === 'all' || p.category === cat) && (lvl === 'all' || p.level === lvl)
        && (!q || p.a.toLowerCase().includes(q) || p.b.toLowerCase().includes(q)));
  }, [draft.pairs, cat, lvl, search]);

  const setPair = (i: number, patch: Partial<StowawayContent['pairs'][number]>) =>
    setDraft(d => ({ ...d, pairs: d.pairs.map((p, idx) => (idx === i ? { ...p, ...patch } : p)) }));

  const prepare = (d: StowawayContent): Prepared<StowawayContent> => {
    const pairs = d.pairs.map(p => ({ ...p, a: p.a.replace(/\s+/g, ' ').trim(), b: p.b.replace(/\s+/g, ' ').trim() })).filter(p => p.a || p.b);
    if (pairs.some(p => !p.a || !p.b)) return { error: 'Every word pair needs two words.' };
    if (pairs.some(p => p.a.toLowerCase() === p.b.toLowerCase())) return { error: 'The two words in a pair must be different.' };
    for (const l of LEVELS) if (!pairs.some(p => p.level === l.id)) return { error: `Keep at least one ${l.label} pair.` };
    const challenges = d.challenges.filter(c => c.title.trim() || c.text.trim());
    if (challenges.some(c => !c.title.trim() || !c.text.trim())) return { error: 'Every challenge needs a title and text.' };
    if (!challenges.length) return { error: 'Keep at least one clue challenge.' };
    const dares = trimList(d.dares);
    if (!dares.length) return { error: 'Keep at least one dare.' };
    return { value: { pairs, challenges: challenges.map(c => ({ ...c, title: c.title.trim(), text: c.text.trim() })), dares } };
  };

  const sel = 'px-2 py-2 rounded-md border-2 border-background-warm bg-background text-sm text-dark focus:border-primary outline-none';

  return (
    <div className="space-y-4">
      <Card>
        <Hint>Explorers get one word of a pair and the Stowaway gets the other. Easy pairs are quite different, Hard pairs are nearly identical. Clue challenges twist how each player gives their clue; dares are for the losing side.</Hint>
        <Segmented<StowView> label="Stowaway content" value={view} onChange={setView} options={[
          { id: 'pairs', label: 'Word pairs', count: draft.pairs.length },
          { id: 'challenges', label: 'Clue challenges', count: draft.challenges.length },
          { id: 'dares', label: 'Dares', count: draft.dares.length },
        ]} />

        {view === 'pairs' && (
          <div className="space-y-3">
            <ListToolbar
              count={draft.pairs.length}
              noun="pair"
              plural="pairs"
              filtering={!!search.trim() || cat !== 'all' || lvl !== 'all'}
              matching={rows.length}
              search={{ value: search, onChange: v => { setSearch(v); setShown(PAGE); }, placeholder: `Search ${draft.pairs.length} word pairs`, label: 'Search word pairs' }}
              addLabel="Add pair"
              onAdd={() => {
                setSearch('');
                setDraft(d => ({ ...d, pairs: [{ category: (cat === 'all' ? 'places' : cat) as StowawayContent['pairs'][number]['category'], level: (lvl === 'all' ? 'easy' : lvl) as StowawayContent['pairs'][number]['level'], a: '', b: '' }, ...d.pairs] }));
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-full sm:w-44"><Select<string> value={cat} onChange={v => { setCat(v); setShown(PAGE); }} options={[{ value: 'all', label: 'All categories' }, ...STOWAWAY_CATEGORIES.map(c => ({ value: c, label: CATEGORY_LABEL[c] }))]} /></div>
              <div className="w-full sm:w-36"><Select<string> value={lvl} onChange={v => { setLvl(v); setShown(PAGE); }} options={[{ value: 'all', label: 'All levels' }, ...LEVELS.map(l => ({ value: l.id, label: l.label }))]} /></div>
            </div>
            <ul className="space-y-2">
              {rows.slice(0, shown).map(({ p, i }) => (
                <li key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_9rem_6.5rem_auto] gap-2 items-center">
                  <input aria-label={`Pair ${i + 1}, first word`} value={p.a} maxLength={40} onChange={e => setPair(i, { a: e.target.value })} className={inputClass} placeholder="Word A" />
                  <input aria-label={`Pair ${i + 1}, second word`} value={p.b} maxLength={40} onChange={e => setPair(i, { b: e.target.value })} className={inputClass} placeholder="Word B" />
                  <select aria-label={`Pair ${i + 1} category`} value={p.category} onChange={e => setPair(i, { category: e.target.value as typeof p.category })} className={`${sel} hidden sm:block`}>
                    {STOWAWAY_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
                  </select>
                  <select aria-label={`Pair ${i + 1} level`} value={p.level} onChange={e => setPair(i, { level: e.target.value as typeof p.level })} className={`${sel} hidden sm:block`}>
                    {STOWAWAY_LEVELS.map(l => <option key={l} value={l}>{LEVELS.find(x => x.id === l)?.label}</option>)}
                  </select>
                  <button type="button" aria-label={`Delete pair ${p.a} and ${p.b}`} onClick={() => setDraft(d => ({ ...d, pairs: d.pairs.filter((_, idx) => idx !== i) }))} className="w-10 h-10 rounded-md text-dark-muted hover:text-red-600 hover:bg-red-50 flex items-center justify-center"><Trash2 size={18} aria-hidden="true" /></button>
                </li>
              ))}
              {rows.length === 0 && <li className="text-sm text-dark-muted py-4 text-center">No pairs match.</li>}
            </ul>
            <p className="text-xs text-dark-muted sm:hidden">Open this page on a larger screen to change a pair's category or level.</p>
            {rows.length > shown && <div className="text-center"><Button variant="ghost" size="sm" onClick={() => setShown(s => s + PAGE)}>Show more ({rows.length - shown} left)</Button></div>}
          </div>
        )}

        {view === 'challenges' && (
          <div className="space-y-3">
            <ListToolbar count={draft.challenges.length} noun="challenge" plural="challenges" addLabel="Add a challenge" onAdd={() => setDraft(d => ({ ...d, challenges: [{ id: '', title: '', text: '' }, ...d.challenges] }))} />
            {draft.challenges.map((c, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="grid sm:grid-cols-[12rem_minmax(0,1fr)] gap-2 flex-1 min-w-0">
                  <input aria-label={`Challenge ${i + 1} title`} value={c.title} maxLength={40} placeholder="Title" onChange={e => setDraft(d => ({ ...d, challenges: d.challenges.map((x, idx) => (idx === i ? { ...x, title: e.target.value } : x)) }))} className={inputClass} />
                  <textarea aria-label={`Challenge ${i + 1} text`} rows={2} value={c.text} maxLength={200} placeholder="What the player has to do with their clue…" onChange={e => setDraft(d => ({ ...d, challenges: d.challenges.map((x, idx) => (idx === i ? { ...x, text: e.target.value } : x)) }))} className={`${inputClass} resize-y`} />
                </div>
                <button type="button" aria-label={`Delete challenge ${i + 1}`} onClick={() => setDraft(d => ({ ...d, challenges: d.challenges.filter((_, idx) => idx !== i) }))} className="shrink-0 w-10 h-10 rounded-md text-dark-muted hover:text-red-600 hover:bg-red-50 flex items-center justify-center"><Trash2 size={18} aria-hidden="true" /></button>
              </div>
            ))}
          </div>
        )}

        {view === 'dares' && (
          <StringListEditor items={draft.dares} onChange={next => setDraft(d => ({ ...d, dares: next }))} max={200} addLabel="Add a dare" placeholder="A dare for the losing side…" minRecommended={8} />
        )}
      </Card>
      <EditorBar dirty={ed.dirty} custom={ed.custom} saving={ed.saving} onSave={() => void ed.save(prepare)} onDiscard={ed.discard} onReset={() => void ed.reset()} />
    </div>
  );
}

// ─────────────────────────────────── Find My Twin ───────────────────────────────────
// A small icon dropdown for one side of a question.
function TwinIconPicker({ value, onChange, label, small = false }: { value: string; onChange: (key: string) => void; label: string; small?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useCloseOnOutsideClick(open, [ref], () => setOpen(false));
  const Current = (TWIN_ICONS[value] ?? TWIN_ICONS.compass).Icon;
  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`${label}: choose icon`}
        className={`${small ? 'w-9 h-9' : 'w-11 h-11'} rounded-md border-2 border-background-warm bg-white flex items-center justify-center text-primary hover:border-primary/50 transition-colors`}
      >
        <Current size={22} weight="duotone" aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 left-0 w-72 max-w-[85vw] max-h-64 overflow-y-auto bg-white border border-background-warm rounded-lg shadow-warm-lg p-2 grid grid-cols-6 gap-1">
          {TWIN_ICON_KEYS.map(k => {
            const I = TWIN_ICONS[k].Icon;
            return (
              <button
                key={k}
                type="button"
                title={TWIN_ICONS[k].label}
                aria-label={TWIN_ICONS[k].label}
                aria-pressed={k === value}
                onClick={() => { onChange(k); setOpen(false); }}
                className={`h-10 rounded-md flex items-center justify-center transition-colors ${k === value ? 'bg-primary text-white' : 'text-dark hover:bg-background-warm'}`}
              >
                <I size={20} weight="duotone" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TwinOptionField({ value, onChange, label }: { value: TwinOptionDraft; onChange: (v: TwinOptionDraft) => void; label: string }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <TwinIconPicker value={value.icon} label={label} onChange={icon => onChange({ ...value, icon })} />
      <input
        aria-label={label}
        value={value.label}
        maxLength={TWIN_MAX_LABEL}
        placeholder="Option"
        onChange={e => onChange({ ...value, label: e.target.value })}
        className={`${inputClass} min-h-[44px] min-w-0`}
      />
    </div>
  );
}

const cleanTwinLabel = (v: string) => v.replace(/\s+/g, ' ').trim();

// Importance is the friendly face of the weight number (Low / Normal / High).
const IMPORTANCE = [
  { id: 'low', label: 'Low', weight: 5 },
  { id: 'normal', label: 'Normal', weight: 10 },
  { id: 'high', label: 'High', weight: 15 },
] as const;
const importanceOf = (w: number) => (!Number.isFinite(w) ? 'normal' : w <= 7 ? 'low' : w <= 12 ? 'normal' : 'high');

/** What is wrong with one question, if anything. */
function twinRowError(qn: TwinQuestionDraft): string | null {
  const l = cleanTwinLabel(qn.left.label);
  const r = cleanTwinLabel(qn.right.label);
  if (!l || !r) return 'Fill in both options.';
  if (l.toLowerCase() === r.toLowerCase()) return 'The two options must be different.';
  const w = Math.round(Number(qn.weight));
  if (!Number.isFinite(w) || w < TWIN_MIN_WEIGHT || w > TWIN_MAX_WEIGHT) return `Weight must be between ${TWIN_MIN_WEIGHT} and ${TWIN_MAX_WEIGHT}.`;
  return null;
}

function TwinEditor({ onDirty }: { onDirty: OnDirty }) {
  const ed = useGameEditor<TwinPromptsContent>('twin', 'twin-prompts', TWIN_PROMPTS_DEFAULTS, sanitizeTwinPrompts, onDirty);
  const confirm = useConfirm();
  const { draft, setDraft } = ed;
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const rowRefs = useRef<Array<HTMLLIElement | null>>([]);

  const totalWeight = draft.questions.reduce((n, x) => n + (Number(x.weight) || 0), 0);
  const canRemove = draft.questions.length > TWIN_MIN_QUESTIONS;
  const canAdd = draft.questions.length < TWIN_MAX_QUESTIONS;

  // After "Add a question" (or a failed save), bring the row into view and put the cursor in it.
  useEffect(() => {
    if (pending === null) return;
    const el = rowRefs.current[pending];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
    setPending(null);
  }, [pending, draft.questions.length]);

  const setQuestion = (i: number, patch: Partial<TwinQuestionDraft>) =>
    setDraft(d => ({ ...d, questions: d.questions.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) }));

  const addQuestion = () => {
    if (!canAdd) return;
    const idx = draft.questions.length;
    setDraft(d => ({
      ...d,
      questions: [...d.questions, { left: { label: '', icon: 'star' }, right: { label: '', icon: 'compass' }, weight: TWIN_DEFAULT_WEIGHT }],
    }));
    setOpenIdx(idx);
    setPending(idx);
  };

  const removeQuestion = async (i: number) => {
    const qn = draft.questions[i];
    const name = qn.left.label && qn.right.label ? `"${qn.left.label} or ${qn.right.label}"` : `question ${i + 1}`;
    if (!(await confirm({ title: 'Delete this question?', message: `${name} is removed from the game once you save.`, confirmLabel: 'Delete' }))) return;
    setDraft(d => ({ ...d, questions: d.questions.filter((_, idx) => idx !== i) }));
    setOpenIdx(o => (o === null || o === i ? null : o > i ? o - 1 : o));
  };

  const prepare = (d: TwinPromptsContent): Prepared<TwinPromptsContent> => {
    const prompts = trimList(d.prompts).slice(0, TWIN_MAX_ROUNDS);
    if (!prompts.length) return { error: 'Keep at least one round (one conversation starter).' };
    if (d.questions.length < TWIN_MIN_QUESTIONS) return { error: `Keep at least ${TWIN_MIN_QUESTIONS} questions.` };
    const questions: TwinQuestionDraft[] = [];
    for (let i = 0; i < d.questions.length; i++) {
      const err = twinRowError(d.questions[i]);
      if (err) return { error: `Question ${i + 1}: ${err}` };
      questions.push({
        left: { ...d.questions[i].left, label: cleanTwinLabel(d.questions[i].left.label) },
        right: { ...d.questions[i].right, label: cleanTwinLabel(d.questions[i].right.label) },
        weight: Math.round(Number(d.questions[i].weight)),
      });
    }
    return { value: { prompts, questions } };
  };

  // A failed save also marks the broken question and opens it, so nobody has to hunt for it.
  const onSave = () => {
    const bad = draft.questions.findIndex(x => twinRowError(x) !== null);
    if (bad >= 0) { setShowErrors(true); setOpenIdx(bad); setPending(bad); }
    void ed.save(prepare);
  };

  return (
    <div className="space-y-4">
      {/* What players answer first. */}
      <Card>
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-dark mr-auto">Questions players answer</h3>
          <span className="inline-flex items-center text-[11px] font-semibold text-dark-muted bg-background-warm rounded-full px-2.5 py-1 tabular-nums">{draft.questions.length} questions</span>
        </div>
        <Hint>Each question is a this-or-that with two options. Players answer every question, and the more answers two players share, the higher their match %. Tap a question to edit it. <strong>Importance</strong> sets how much a question counts compared with the others. Keep between {TWIN_MIN_QUESTIONS} and {TWIN_MAX_QUESTIONS} questions. <strong>Change questions between games</strong>: a game that is already running keeps working, but players who answered earlier answered the old list.</Hint>
        <ol className="divide-y divide-background-warm/80 border border-background-warm rounded-lg lg:grid lg:grid-cols-2 lg:gap-2 lg:divide-y-0 lg:border-0 lg:rounded-none">
          {draft.questions.map((qn, i) => {
            const open = openIdx === i;
            const err = twinRowError(qn);
            const showErr = !!err && (showErrors || err === 'The two options must be different.');
            const L = (TWIN_ICONS[qn.left.icon] ?? TWIN_ICONS.compass).Icon;
            const R = (TWIN_ICONS[qn.right.icon] ?? TWIN_ICONS.compass).Icon;
            const imp = importanceOf(Number(qn.weight));
            return (
              <li key={i} ref={el => { rowRefs.current[i] = el; }} className={`lg:border lg:border-background-warm lg:rounded-lg ${open ? 'lg:col-span-2' : ''} ${showErr ? 'bg-red-50/60' : ''}`}>
                <div className="flex items-center gap-1 pr-1">
                  <button
                    type="button"
                    onClick={() => setOpenIdx(open ? null : i)}
                    aria-expanded={open}
                    aria-label={`Question ${i + 1}: ${qn.left.label || 'empty'} or ${qn.right.label || 'empty'}. ${open ? 'Close' : 'Edit'}`}
                    className="flex-1 min-w-0 flex items-center gap-2.5 text-left cursor-pointer min-h-[52px] px-3 rounded-lg hover:bg-background-warm/60 transition-colors"
                  >
                    <span className="w-5 shrink-0 text-right text-[11px] text-dark-muted tabular-nums">{i + 1}</span>
                    <span className="flex items-center -space-x-1.5 shrink-0 text-primary" aria-hidden="true">
                      <span className="w-7 h-7 rounded-full bg-background-warm border-2 border-white flex items-center justify-center"><L size={14} weight="duotone" /></span>
                      <span className="w-7 h-7 rounded-full bg-background-warm border-2 border-white flex items-center justify-center"><R size={14} weight="duotone" /></span>
                    </span>
                    <span className={`min-w-0 flex-1 truncate text-sm font-medium ${showErr ? 'text-red-700' : 'text-dark'}`}>
                      {qn.left.label || '…'} <span className="font-normal text-dark-muted text-xs">or</span> {qn.right.label || '…'}
                    </span>
                    <span className={`hidden min-[400px]:inline shrink-0 text-[11px] font-semibold rounded-full px-2 py-0.5 ${imp === 'high' ? 'bg-primary/15 text-primary' : imp === 'low' ? 'bg-background-warm text-dark-muted' : 'bg-background-warm text-dark'}`}>
                      {IMPORTANCE.find(x => x.id === imp)?.label}
                    </span>
                    <CaretDown size={14} className={`shrink-0 text-dark-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeQuestion(i)}
                    disabled={!canRemove}
                    aria-label={`Delete question ${i + 1}`}
                    title={canRemove ? 'Delete this question' : `Keep at least ${TWIN_MIN_QUESTIONS} questions`}
                    className="shrink-0 w-10 h-11 rounded-md text-dark-muted hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-dark-muted flex items-center justify-center"
                  >
                    <Trash2 size={18} aria-hidden="true" />
                  </button>
                </div>

                {open && (
                  <div className="mx-3 mb-3 rounded-lg bg-background-warm/40 p-3 space-y-3">
                    <div className="grid sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-2 sm:gap-3 items-center">
                      <TwinOptionField label={`Question ${i + 1}, first option`} value={qn.left} onChange={v => setQuestion(i, { left: v })} />
                      <span className="text-dark-muted text-xs text-center">or</span>
                      <TwinOptionField label={`Question ${i + 1}, second option`} value={qn.right} onChange={v => setQuestion(i, { right: v })} />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-dark mb-1.5">How much does this question matter?</p>
                      <div role="radiogroup" aria-label={`Question ${i + 1} importance`} className="grid grid-cols-3 gap-1 bg-white rounded-lg p-1">
                        {IMPORTANCE.map(o => (
                          <button
                            key={o.id}
                            type="button"
                            role="radio"
                            aria-checked={imp === o.id}
                            onClick={() => setQuestion(i, { weight: o.weight })}
                            className={`min-h-[40px] rounded-md text-sm font-button font-semibold transition-colors ${imp === o.id ? 'bg-primary text-white' : 'text-dark hover:bg-background-warm'}`}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                      <details className="mt-2 text-xs text-dark-muted">
                        <summary className="cursor-pointer select-none min-h-[32px] flex items-center">Exact weight{totalWeight > 0 && Number.isFinite(qn.weight) ? ` · ${Math.round((qn.weight / totalWeight) * 100)}% of the match` : ''}</summary>
                        <div className="flex items-center gap-2 pt-1">
                          <input
                            type="number"
                            inputMode="numeric"
                            min={TWIN_MIN_WEIGHT}
                            max={TWIN_MAX_WEIGHT}
                            aria-label={`Question ${i + 1} exact weight`}
                            value={Number.isFinite(qn.weight) ? qn.weight : ''}
                            onChange={e => setQuestion(i, { weight: e.target.value === '' ? Number.NaN : Number(e.target.value) })}
                            className={`${inputClass} min-h-[40px] w-20 px-2 text-center`}
                          />
                          <span>from {TWIN_MIN_WEIGHT} to {TWIN_MAX_WEIGHT}</span>
                        </div>
                      </details>
                    </div>
                  </div>
                )}
                {showErr && <p role="alert" className="px-3 pb-2 -mt-1 text-xs text-red-600 pl-[3.25rem]">{err}</p>}
              </li>
            );
          })}
        </ol>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={addQuestion} disabled={!canAdd}><Plus size={16} aria-hidden="true" /> Add a question</Button>
          {!canAdd && <span className="text-xs text-dark-muted">The most you can add is {TWIN_MAX_QUESTIONS}.</span>}
        </div>
      </Card>

      {/* Rounds: one conversation starter per round. */}
      <Card>
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-dark mr-auto">Rounds and conversation starters</h3>
          <span className="inline-flex items-center text-[11px] font-semibold text-dark-muted bg-background-warm rounded-full px-2.5 py-1 tabular-nums">{draft.prompts.length} {draft.prompts.length === 1 ? 'round' : 'rounds'}</span>
        </div>
        <Hint>Each row below is <strong>one round</strong>, so the number of rows is the number of rounds (up to {TWIN_MAX_ROUNDS}). In every round, each player is paired with a new twin and has to find them in the room. When the two meet, that round's conversation starter unlocks for them, and once every pair has talked the next round begins. The game also stops early when nobody new is left to meet, so a small group plays fewer rounds than a big one (4 players can have at most 3 rounds).</Hint>
        <StringListEditor
          items={draft.prompts}
          onChange={next => setDraft(d => ({ ...d, prompts: next.slice(0, TWIN_MAX_ROUNDS) }))}
          max={200}
          addLabel="Add a round"
          placeholder="A question for the two twins to talk about…"
          rowPrefix={i => `Round ${i + 1}`}
        />
        {draft.prompts.length >= TWIN_MAX_ROUNDS && <p className="text-xs text-dark-muted">The most you can add is {TWIN_MAX_ROUNDS} rounds.</p>}
      </Card>
      <EditorBar dirty={ed.dirty} custom={ed.custom} saving={ed.saving} onSave={onSave} onDiscard={() => { ed.discard(); setShowErrors(false); setOpenIdx(null); }} onReset={() => void ed.reset()} />
    </div>
  );
}

// ─────────────────────────────────── Page ───────────────────────────────────
type GameTab = 'play' | 'edit';
const TABS: { id: GameTab; label: string }[] = [
  { id: 'play', label: 'Play' },
  { id: 'edit', label: 'Edit' },
];
type EditGame = 'tod' | 'stowaway' | 'charades' | 'twin';
const EDIT_GAMES: { id: EditGame; label: string; blurb: string; Icon: PhosphorIcon }[] = [
  { id: 'tod', label: 'Truth or Dare', blurb: 'Truths, dares, twists', Icon: Sparkle },
  { id: 'stowaway', label: 'Stowaway', blurb: 'Word pairs, challenges', Icon: Boat },
  { id: 'charades', label: 'Dumb Charades', blurb: 'Tamil film list', Icon: FilmSlate },
  { id: 'twin', label: 'Find My Twin', blurb: 'Questions and rounds', Icon: UsersThree },
];

// Which game to edit: four cards (2 x 2 on a phone, one row of four on desktop).
// A dot on a card means that game has unsaved edits.
function GamePicker({ value, onChange, dirty }: { value: EditGame; onChange: (g: EditGame) => void; dirty: Record<string, boolean> }) {
  return (
    <div role="tablist" aria-label="Game to edit" className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
      {EDIT_GAMES.map(g => {
        const on = value === g.id;
        return (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(g.id)}
            className={`relative flex items-center gap-2.5 min-h-[56px] px-3 py-2 rounded-2xl border-2 text-left transition-colors ${on ? 'bg-primary border-primary text-white shadow-card' : 'bg-white border-transparent shadow-card text-dark hover:border-primary/30'}`}
          >
            <span className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center ${on ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary'}`} aria-hidden="true">
              <g.Icon size={20} weight="duotone" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-button font-semibold leading-tight truncate">{g.label}</span>
              <span className={`block text-[11px] leading-tight truncate mt-0.5 ${on ? 'text-white/80' : 'text-dark-muted'}`}>{g.blurb}</span>
            </span>
            {dirty[g.id] && <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-white" title="Unsaved changes" aria-label="Unsaved changes" />}
          </button>
        );
      })}
    </div>
  );
}
const PERSIST_KEY = 'ulaa:admin-games:tab';

export default function AdminGames() {
  // Older saved values were one tab per game ('tod', 'stowaway', ...): open Edit on that game.
  const [saved] = useState(() => loadPersisted<{ tab?: string; game?: string }>(PERSIST_KEY));
  const [tab, setTab] = useState<GameTab>(() => (saved.tab === 'edit' || EDIT_GAMES.some(g => g.id === saved.tab) ? 'edit' : 'play'));
  const [game, setGame] = useState<EditGame>(() => {
    const g = EDIT_GAMES.find(x => x.id === saved.game) ?? EDIT_GAMES.find(x => x.id === saved.tab);
    return g ? g.id : 'tod';
  });
  useEffect(() => { savePersisted(PERSIST_KEY, { tab, game }); }, [tab, game]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const roster = useTripRoster();
  const dirtyRef = useRef<Record<string, boolean>>({});
  const [dirtyMap, setDirtyMap] = useState<Record<string, boolean>>({});
  const onDirty = useCallback<OnDirty>((id, dirty) => {
    dirtyRef.current[id] = dirty;
    setDirtyMap(m => (!!m[id] === dirty ? m : { ...m, [id]: dirty }));
  }, []);

  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    loadGameContent(true)
      .catch(err => { console.error(err); if (alive) setLoadError(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [attempt]);
  const retry = () => { setLoading(true); setLoadError(false); setAttempt(a => a + 1); };

  return (
    <AdminLayout
      title="Games"
      subtitle="Pick a trip and host its games, or change the questions, dares and word lists the games use"
      hasUnsavedChanges={() => Object.values(dirtyRef.current).some(Boolean)}
      scrollRestorationReady={!loading}
    >
      {loading ? (
        <div role="status" className="text-center py-16 text-dark-muted">Loading…</div>
      ) : loadError ? (
        <div className="bg-white rounded-lg shadow-card p-8 text-center space-y-3">
          <p className="text-dark">Couldn't load the saved game content.</p>
          <p className="text-sm text-dark-muted">Editing now could overwrite saved changes with the built-in content, so please try again.</p>
          <Button size="sm" onClick={retry}>Try again</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* One row, one style: the section (Play / Edit) and, in Edit, the game. */}
          <div className="sm:max-w-xs">
            <Segmented<GameTab> label="Section" tone="white" stretch value={tab} onChange={setTab} options={TABS} />
          </div>
          {/* Everything stays mounted so unsaved edits survive switching tabs. */}
          <div hidden={tab !== 'play'}>
            {/* Phone: roster card, then the games, in one column. Desktop (lg+): the roster is a sticky left rail
                and the games fill the space beside it (two across on very wide screens). */}
            <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-[21rem_minmax(0,1fr)] lg:gap-6 lg:items-start">
              <aside className="lg:sticky lg:top-[7.5rem]" aria-label="Who is playing">
                <TripRosterPanel roster={roster} />
              </aside>
              <section aria-labelledby="games-heading" className="space-y-3">
                <div className="flex items-baseline gap-2 px-1">
                  <h2 id="games-heading" className="font-display text-base font-extrabold text-dark mr-auto">Games</h2>
                  <p className="text-xs text-dark-muted tabular-nums" role="status">
                    {roster.tripId ? `Dealt to ${roster.names.length} ${roster.names.length === 1 ? 'player' : 'players'}` : 'Pick a trip to start'}
                  </p>
                </div>
                <div className="grid gap-3 2xl:grid-cols-2">
                  <TruthOrDareHost roster={roster} />
                  <StowawayHost roster={roster} />
                  <LinkGameHost
                    game={<DumbCharadesGame row />}
                    path="/play/dumb-charades"
                    title="Dumb Charades"
                    tripId={roster.tripId}
                    tripTitle={roster.trip?.title}
                    note="Teams act out Tamil movies on one phone."
                  />
                  <TwinRoomHost roster={roster} />
                </div>
              </section>
            </div>
          </div>
          <div hidden={tab !== 'edit'} className="space-y-4">
            <GamePicker value={game} onChange={setGame} dirty={dirtyMap} />
            {/* All four stay mounted so unsaved edits survive switching games. */}
            <div hidden={game !== 'tod'}><TruthOrDareEditor onDirty={onDirty} /></div>
            <div hidden={game !== 'stowaway'}><StowawayEditor onDirty={onDirty} /></div>
            <div hidden={game !== 'charades'}><CharadesEditor onDirty={onDirty} /></div>
            <div hidden={game !== 'twin'}><TwinEditor onDirty={onDirty} /></div>
          </div>
          <p className="text-xs text-dark-muted">Pack the Bag and Travel Match are picture games with nothing to edit here.</p>
        </div>
      )}
    </AdminLayout>
  );
}
