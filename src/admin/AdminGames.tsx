import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Plus, Trash as Trash2, PencilSimple as Edit2, MagnifyingGlass as Search, ArrowCounterClockwise, ClipboardText } from '@phosphor-icons/react';
import AdminLayout from './AdminLayout';
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
import { TWIN_MAX_PROMPTS, TWIN_PROMPTS_DEFAULTS, sanitizeTwinPrompts, type TwinPromptsContent } from '../components/ui/findMyTwinEngine';

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
  return (
    <div className="sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-white/95 backdrop-blur border-t border-background-warm flex flex-wrap items-center gap-2 sm:gap-3 z-10">
      <span className="text-xs text-dark-muted mr-auto" role="status">
        {dirty ? 'You have unsaved changes.' : custom ? 'Customised: the game uses your edits.' : 'Using the built-in content.'}
      </span>
      {custom && (
        <button type="button" onClick={onReset} disabled={saving} className="inline-flex items-center gap-1.5 text-sm font-medium text-dark-muted hover:text-primary disabled:opacity-50 min-h-[44px] px-2">
          <ArrowCounterClockwise size={16} aria-hidden="true" /> Restore built-in
        </button>
      )}
      {dirty && <Button variant="ghost" size="sm" onClick={onDiscard} disabled={saving}>Discard</Button>}
      <Button size="sm" onClick={onSave} loading={saving} disabled={!dirty || saving}>Save changes</Button>
    </div>
  );
}

function Segmented<T extends string>({ value, onChange, options, label }: {
  value: T; onChange: (v: T) => void; options: { id: T; label: string; count?: number }[]; label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex flex-wrap gap-1 bg-background-warm/60 rounded-lg p-1">
      {options.map(o => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={`px-3 py-1.5 rounded-md text-sm font-button font-semibold transition-colors ${value === o.id ? 'bg-primary text-white' : 'text-dark hover:bg-white'}`}
        >
          {o.label}{o.count !== undefined && <span className="ml-1.5 text-xs opacity-70">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

const Card = ({ children }: { children: ReactNode }) => <div className="bg-white rounded-lg shadow-card p-4 sm:p-5 space-y-4">{children}</div>;
const Hint = ({ children }: { children: ReactNode }) => <p className="text-sm text-dark-muted leading-relaxed">{children}</p>;

// ── A list of single-line texts: edit in place, add, bulk-add, delete ──
function StringListEditor({ items, onChange, max, addLabel, placeholder, minRecommended, rowPrefix }: {
  items: string[]; onChange: (next: string[]) => void; max: number; addLabel: string; placeholder: string;
  minRecommended?: number; rowPrefix?: (i: number) => string;
}) {
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [focusIdx, setFocusIdx] = useState<number | null>(null);

  const addBulk = () => {
    const lines = bulkText.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).map(l => l.slice(0, max));
    if (lines.length) onChange([...items, ...lines]);
    setBulkText('');
    setBulkOpen(false);
  };

  return (
    <div className="space-y-3">
      {minRecommended !== undefined && items.length < minRecommended && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-md px-3 py-2">Only {items.length} here. Aim for at least {minRecommended} so rounds don't repeat too soon.</p>
      )}
      <ul className="space-y-2">
        {items.map((t, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="w-14 shrink-0 pt-2.5 text-xs text-dark-muted tabular-nums">{rowPrefix ? rowPrefix(i) : i + 1}</span>
            <textarea
              ref={el => { if (el && focusIdx === i) { el.focus(); setFocusIdx(null); } }}
              rows={2}
              value={t}
              maxLength={max}
              aria-label={rowPrefix ? rowPrefix(i) : `Item ${i + 1}`}
              placeholder={placeholder}
              onChange={e => onChange(items.map((x, idx) => (idx === i ? e.target.value : x)))}
              className={`${inputClass} resize-y min-h-[44px]`}
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              aria-label={`Delete ${rowPrefix ? rowPrefix(i) : `item ${i + 1}`}`}
              className="shrink-0 w-10 h-10 mt-0.5 rounded-md text-dark-muted hover:text-red-600 hover:bg-red-50 flex items-center justify-center"
            >
              <Trash2 size={18} aria-hidden="true" />
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="text-sm text-dark-muted py-2">Nothing here yet.</li>}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => { setFocusIdx(items.length); onChange([...items, '']); }}>
          <Plus size={16} aria-hidden="true" /> {addLabel}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setBulkOpen(true)}>
          <ClipboardText size={16} aria-hidden="true" /> Paste several
        </Button>
      </div>
      <Modal
        isOpen={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Paste several"
        size="md"
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => setBulkOpen(false)}>Cancel</Button><Button size="sm" onClick={addBulk} disabled={!bulkText.trim()}>Add them</Button></div>}
      >
        <Hint>One per line. Blank lines are skipped.</Hint>
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
            items={draft.prompts[view][level]}
            onChange={next => setList(view, level, next)}
            max={TOD_MAX_PROMPT}
            addLabel={view === 'truth' ? 'Add a truth' : 'Add a dare'}
            placeholder={view === 'truth' ? 'A question for the player to answer honestly…' : 'Something for the player to do…'}
            minRecommended={10}
          />
        ) : (
          <div className="space-y-3">
            {draft.twists.map((t, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="grid sm:grid-cols-[12rem_minmax(0,1fr)] gap-2 flex-1 min-w-0">
                  <input aria-label={`Twist ${i + 1} title`} value={t.title} maxLength={60} placeholder="Title, e.g. Hot seat" onChange={e => setDraft(d => ({ ...d, twists: d.twists.map((x, idx) => (idx === i ? { ...x, title: e.target.value } : x)) }))} className={inputClass} />
                  <textarea aria-label={`Twist ${i + 1} text`} rows={2} value={t.text} maxLength={TOD_MAX_PROMPT} placeholder="What the group has to do…" onChange={e => setDraft(d => ({ ...d, twists: d.twists.map((x, idx) => (idx === i ? { ...x, text: e.target.value } : x)) }))} className={`${inputClass} resize-y`} />
                </div>
                <button type="button" aria-label={`Delete twist ${i + 1}`} onClick={() => setDraft(d => ({ ...d, twists: d.twists.filter((_, idx) => idx !== i) }))} className="shrink-0 w-10 h-10 rounded-md text-dark-muted hover:text-red-600 hover:bg-red-50 flex items-center justify-center"><Trash2 size={18} aria-hidden="true" /></button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setDraft(d => ({ ...d, twists: [...d.twists, { title: '', text: '' }] }))}><Plus size={16} aria-hidden="true" /> Add a twist card</Button>
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
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[12rem]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-muted" aria-hidden="true" />
            <input type="search" value={search} onChange={e => { setSearch(e.target.value); setShown(PAGE); }} placeholder={`Search ${draft.movies.length} films, people or years`} aria-label="Search films" className={`${inputClass} pl-9`} />
          </div>
          <Button size="sm" onClick={openAdd}><Plus size={16} aria-hidden="true" /> Add film</Button>
          <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}><ClipboardText size={16} aria-hidden="true" /> Paste several</Button>
        </div>

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
        <Hint>One film per line, in this order, separated by <code>|</code> (or tabs, so you can paste straight from a spreadsheet):</Hint>
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
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[10rem]">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-muted" aria-hidden="true" />
                <input type="search" value={search} onChange={e => { setSearch(e.target.value); setShown(PAGE); }} placeholder="Search words" aria-label="Search word pairs" className={`${inputClass} pl-9`} />
              </div>
              <div className="w-full sm:w-44"><Select<string> value={cat} onChange={v => { setCat(v); setShown(PAGE); }} options={[{ value: 'all', label: 'All categories' }, ...STOWAWAY_CATEGORIES.map(c => ({ value: c, label: CATEGORY_LABEL[c] }))]} /></div>
              <div className="w-full sm:w-36"><Select<string> value={lvl} onChange={v => { setLvl(v); setShown(PAGE); }} options={[{ value: 'all', label: 'All levels' }, ...LEVELS.map(l => ({ value: l.id, label: l.label }))]} /></div>
              <Button size="sm" onClick={() => {
                setSearch('');
                setDraft(d => ({ ...d, pairs: [{ category: (cat === 'all' ? 'places' : cat) as StowawayContent['pairs'][number]['category'], level: (lvl === 'all' ? 'easy' : lvl) as StowawayContent['pairs'][number]['level'], a: '', b: '' }, ...d.pairs] }));
              }}><Plus size={16} aria-hidden="true" /> Add pair</Button>
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
            {draft.challenges.map((c, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="grid sm:grid-cols-[12rem_minmax(0,1fr)] gap-2 flex-1 min-w-0">
                  <input aria-label={`Challenge ${i + 1} title`} value={c.title} maxLength={40} placeholder="Title" onChange={e => setDraft(d => ({ ...d, challenges: d.challenges.map((x, idx) => (idx === i ? { ...x, title: e.target.value } : x)) }))} className={inputClass} />
                  <textarea aria-label={`Challenge ${i + 1} text`} rows={2} value={c.text} maxLength={200} placeholder="What the player has to do with their clue…" onChange={e => setDraft(d => ({ ...d, challenges: d.challenges.map((x, idx) => (idx === i ? { ...x, text: e.target.value } : x)) }))} className={`${inputClass} resize-y`} />
                </div>
                <button type="button" aria-label={`Delete challenge ${i + 1}`} onClick={() => setDraft(d => ({ ...d, challenges: d.challenges.filter((_, idx) => idx !== i) }))} className="shrink-0 w-10 h-10 rounded-md text-dark-muted hover:text-red-600 hover:bg-red-50 flex items-center justify-center"><Trash2 size={18} aria-hidden="true" /></button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setDraft(d => ({ ...d, challenges: [...d.challenges, { id: '', title: '', text: '' }] }))}><Plus size={16} aria-hidden="true" /> Add a challenge</Button>
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
function TwinEditor({ onDirty }: { onDirty: OnDirty }) {
  const ed = useGameEditor<TwinPromptsContent>('twin', 'twin-prompts', TWIN_PROMPTS_DEFAULTS, sanitizeTwinPrompts, onDirty);
  const { draft, setDraft } = ed;

  const prepare = (d: TwinPromptsContent): Prepared<TwinPromptsContent> => {
    const prompts = trimList(d.prompts).slice(0, TWIN_MAX_PROMPTS);
    return prompts.length ? { value: { prompts } } : { error: 'Keep at least one conversation starter.' };
  };

  return (
    <div className="space-y-4">
      <Card>
        <Hint>When two twins find each other, a conversation starter unlocks. Round 1 uses the first one, round 2 the second, and so on (up to {TWIN_MAX_PROMPTS}). If there are fewer than the rounds played, the last one repeats.</Hint>
        <StringListEditor
          items={draft.prompts}
          onChange={next => setDraft({ prompts: next.slice(0, TWIN_MAX_PROMPTS) })}
          max={200}
          addLabel="Add a starter"
          placeholder="A question for the two twins to talk about…"
          rowPrefix={i => `Round ${i + 1}`}
        />
        {draft.prompts.length >= TWIN_MAX_PROMPTS && <p className="text-xs text-dark-muted">The game has {TWIN_MAX_PROMPTS} rounds, so that is the most you can add.</p>}
        <p className="text-xs text-dark-muted bg-background-warm/60 rounded-md px-3 py-2">The this-or-that questions are scored by the database in a fixed order, so they can't be edited here. Changing them needs a database update.</p>
      </Card>
      <EditorBar dirty={ed.dirty} custom={ed.custom} saving={ed.saving} onSave={() => void ed.save(prepare)} onDiscard={ed.discard} onReset={() => void ed.reset()} />
    </div>
  );
}

// ─────────────────────────────────── Page ───────────────────────────────────
type GameTab = 'tod' | 'charades' | 'stowaway' | 'twin';
const TABS: { id: GameTab; label: string }[] = [
  { id: 'tod', label: 'Truth or Dare' },
  { id: 'charades', label: 'Dumb Charades' },
  { id: 'stowaway', label: 'Stowaway' },
  { id: 'twin', label: 'Find My Twin' },
];

export default function AdminGames() {
  const [tab, setTab] = useState<GameTab>('tod');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const dirtyRef = useRef<Record<string, boolean>>({});
  const onDirty = useCallback<OnDirty>((id, dirty) => { dirtyRef.current[id] = dirty; }, []);

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
      subtitle="Change the questions, dares and word lists the games use"
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
          <div role="tablist" aria-label="Game" className="grid grid-cols-2 sm:inline-flex gap-1 bg-white rounded-lg p-1.5 shadow-card">
            {TABS.map(t => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-2 rounded-md text-center text-sm font-button font-semibold transition-colors ${tab === t.id ? 'bg-primary text-white' : 'text-dark hover:bg-background-warm'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {/* All four stay mounted so unsaved edits survive switching tabs. */}
          <div hidden={tab !== 'tod'}><TruthOrDareEditor onDirty={onDirty} /></div>
          <div hidden={tab !== 'charades'}><CharadesEditor onDirty={onDirty} /></div>
          <div hidden={tab !== 'stowaway'}><StowawayEditor onDirty={onDirty} /></div>
          <div hidden={tab !== 'twin'}><TwinEditor onDirty={onDirty} /></div>
          <p className="text-xs text-dark-muted">Pack the Bag and Travel Match are picture games with nothing to edit here.</p>
        </div>
      )}
    </AdminLayout>
  );
}
