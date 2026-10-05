// Admin > Travel Cards: name tags for a trip, in three tabs.
//  - Travelers: the people booked on the chosen trip (the same isBooked() test
//    the Enquiries page and the trip Check-in list use; every booking row is
//    one traveler, so group bookings list each person by name).
//  - Trip leaders: the Trip Leaders directory; the leader assigned to the
//    chosen trip is listed first.
//  - Back card: the five text lines on the back are editable.
// The card artwork is drawn in utils/travelCard.ts.
import { useEffect, useMemo, useState } from 'react';
import { ArrowCounterClockwise, Check, CircleNotch, DownloadSimple as Download, IdentificationCard, PencilSimple, X } from '@phosphor-icons/react';
import AdminLayout from './AdminLayout';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import { useAlert } from '../components/ui/useAlert';
import { getEnquiries, getUpcomingTrips, getAllTripLeadersAdmin } from '../services/api';
import { isBooked } from './enquiries/AdminEnquiriesShared';
import { FORM_INPUT_CLASS as inputClass } from '../constants/formStyles';
import { formatDate } from '../utils/utils-index';
import type { Enquiry, TripLeader, UpcomingTrip } from '../types/types-index';
import { DEFAULT_BACK_CARD_TEXT, type BackCardText, type TravelCardRole } from '../utils/travelCard';

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

type CardTab = 'traveler' | 'leader' | 'back';
const TABS: { id: CardTab; label: string }[] = [
  { id: 'traveler', label: 'Travelers' },
  { id: 'leader', label: 'Trip leaders' },
  { id: 'back', label: 'Back card' },
];

// Edits made here only change what is printed on the cards. They are kept in
// this browser and never written back to a booking or the trip leader record.
const NAMES_KEY = 'ulaa-travel-card-names-v1';
const BACK_KEY = 'ulaa-travel-card-back-v1';

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? { ...fallback, ...parsed } : fallback;
  } catch {
    return fallback;
  }
}
function writeStorage(key: string, value: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable: edit lasts this visit only */ }
}

// One row in a card list, whichever tab it belongs to.
interface CardPerson {
  key: string;        // storage key for a name edit
  name: string;       // the name on record
  note?: string;      // small grey text after the name
}

const BACK_FIELDS: { key: keyof BackCardText; label: string; hint?: string }[] = [
  { key: 'topLine', label: 'Small line above the headline', hint: 'Shown in capitals.' },
  { key: 'headline', label: 'Headline' },
  { key: 'scanLine', label: 'Line under the QR code', hint: 'Shown in capitals.' },
  { key: 'instagram', label: 'Instagram ID' },
  { key: 'phone', label: 'Phone number' },
];

export default function AdminTravelCards() {
  const alert = useAlert();
  const [tab, setTab] = useState<CardTab>('traveler');
  const [trips, setTrips] = useState<UpcomingTrip[]>([]);
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [leaders, setLeaders] = useState<TripLeader[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [tripId, setTripId] = useState('');
  // Everyone is ticked by default; this holds the ones the admin unticked.
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [customFont, setCustomFont] = useState<boolean | null>(null);
  const [nameOverrides, setNameOverrides] = useState<Record<string, string>>(() => readStorage<Record<string, string>>(NAMES_KEY, {}));
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [backText, setBackText] = useState<BackCardText>(() => readStorage<BackCardText>(BACK_KEY, DEFAULT_BACK_CARD_TEXT));
  const [backPreviewUrl, setBackPreviewUrl] = useState<string | null>(null);
  const [backBusy, setBackBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getUpcomingTrips(), getEnquiries(), getAllTripLeadersAdmin()])
      .then(([t, e, l]) => {
        if (cancelled) return;
        setTrips(t);
        setEnquiries(e);
        setLeaders(l);
      })
      .catch(err => {
        console.error(err);
        if (!cancelled) setLoadError(true);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const trip = trips.find(t => t.id === tripId);
  const role: TravelCardRole = tab === 'leader' ? 'leader' : 'traveler';

  const people: CardPerson[] = useMemo(() => {
    if (tab === 'traveler') {
      return (tripId
        ? enquiries.filter(e => e.trip_id === tripId && isBooked(e)).sort((a, b) => a.full_name.localeCompare(b.full_name))
        : []
      ).map(e => ({
        key: e.id,
        name: e.full_name,
        note: e.group_size && e.group_size > 1 ? `Group ${e.group_seq}/${e.group_size}` : undefined,
      }));
    }
    if (tab === 'leader') {
      const assigned = trip?.trip_leader_id ?? null;
      return [...leaders]
        .sort((a, b) => Number(b.id === assigned) - Number(a.id === assigned) || a.name.localeCompare(b.name))
        .map(l => ({
          key: `leader:${l.id}`,
          name: l.name,
          note: l.id === assigned ? 'Leads this trip' : l.designation || undefined,
        }));
    }
    return [];
  }, [tab, tripId, trip, enquiries, leaders]);

  const displayName = (p: CardPerson) => nameOverrides[p.key]?.trim() || p.name;
  const selected = useMemo(() => people.filter(p => !unticked.has(p.key)), [people, unticked]);
  const previewPerson = people.find(p => p.key === previewKey) ?? people[0] ?? null;
  const previewName = previewPerson ? displayName(previewPerson) : '';

  // Live preview of the front card for the person being looked at.
  useEffect(() => {
    if (!previewName || tab === 'back') return;
    let cancelled = false;
    let url: string | null = null;
    import('../utils/travelCard')
      .then(async m => {
        const [blob, custom] = await Promise.all([m.renderTravelCardBlob(previewName, role), m.usingCustomNameFont()]);
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setCustomFont(custom);
      })
      .catch(err => console.error(err));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [previewName, role, tab]);

  // Live preview of the back card (re-drawn shortly after each keystroke).
  useEffect(() => {
    if (tab !== 'back') return;
    let cancelled = false;
    let url: string | null = null;
    const timer = setTimeout(() => {
      import('../utils/travelCard')
        .then(async m => {
          const [blob, custom] = await Promise.all([m.renderTravelCardBackBlob(backText), m.usingCustomNameFont()]);
          if (cancelled) return;
          url = URL.createObjectURL(blob);
          setBackPreviewUrl(url);
          setCustomFont(custom);
        })
        .catch(err => console.error(err));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (url) URL.revokeObjectURL(url);
    };
  }, [tab, backText]);

  const resetListState = () => {
    setUnticked(new Set());
    setPreviewKey(null);
    setPreviewUrl(null);
    setEditingKey(null);
  };
  const chooseTab = (next: CardTab) => {
    if (next === tab) return;
    setTab(next);
    resetListState();
  };
  const chooseTrip = (id: string) => {
    setTripId(id);
    resetListState();
  };

  const toggle = (key: string) =>
    setUnticked(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  const allTicked = people.length > 0 && selected.length === people.length;
  const toggleAll = () => setUnticked(allTicked ? new Set(people.map(p => p.key)) : new Set());

  const saveOverrides = (next: Record<string, string>) => {
    setNameOverrides(next);
    writeStorage(NAMES_KEY, next);
  };
  const startEdit = (p: CardPerson) => { setEditingKey(p.key); setDraft(displayName(p)); };
  const commitEdit = (p: CardPerson) => {
    const name = draft.replace(/\s+/g, ' ').trim();
    const next = { ...nameOverrides };
    if (!name || name === p.name) delete next[p.key]; else next[p.key] = name;
    saveOverrides(next);
    setEditingKey(null);
  };
  const resetName = (p: CardPerson) => {
    const next = { ...nameOverrides };
    delete next[p.key];
    saveOverrides(next);
    setEditingKey(null);
  };

  const downloadOne = async (p: CardPerson) => {
    if (busyKey || bulkBusy) return;
    setBusyKey(p.key);
    try {
      const { downloadTravelCard } = await import('../utils/travelCard');
      await downloadTravelCard(displayName(p), role);
    } catch (err) {
      console.error(err);
      await alert({ title: 'Travel card', message: `Could not create ${displayName(p)}'s card. Please try again.` });
    } finally {
      setBusyKey(null);
    }
  };

  // One PNG per ticked person. The short pause keeps browsers from dropping
  // back-to-back downloads; Chrome may ask once to "allow multiple downloads".
  const downloadSelected = async () => {
    if (bulkBusy || busyKey || selected.length === 0) return;
    setBulkBusy(true);
    try {
      const { downloadTravelCard } = await import('../utils/travelCard');
      for (const p of selected) {
        await downloadTravelCard(displayName(p), role);
        await pause(400);
      }
    } catch (err) {
      console.error(err);
      await alert({ title: 'Travel cards', message: 'Could not create all the cards. Please try again.' });
    } finally {
      setBulkBusy(false);
    }
  };

  const setBackField = (key: keyof BackCardText, value: string) => {
    const next = { ...backText, [key]: value };
    setBackText(next);
    writeStorage(BACK_KEY, next);
  };
  const resetBack = () => {
    setBackText(DEFAULT_BACK_CARD_TEXT);
    writeStorage(BACK_KEY, DEFAULT_BACK_CARD_TEXT);
  };
  const backIsDefault = BACK_FIELDS.every(f => backText[f.key] === DEFAULT_BACK_CARD_TEXT[f.key]);
  const downloadBack = async () => {
    if (backBusy) return;
    setBackBusy(true);
    try {
      const { downloadTravelCardBack } = await import('../utils/travelCard');
      await downloadTravelCardBack(backText);
    } catch (err) {
      console.error(err);
      await alert({ title: 'Back card', message: 'Could not create the back card. Please try again.' });
    } finally {
      setBackBusy(false);
    }
  };

  const tripSelect = (
    <div className="bg-white rounded-lg p-4 shadow-card space-y-3">
      <label htmlFor="travel-card-trip" className="block text-sm font-medium text-dark">
        Trip{tab === 'leader' ? <span className="text-dark-muted font-normal"> (optional, shows who leads it)</span> : null}
      </label>
      <Select
        inputId="travel-card-trip"
        value={tripId}
        onChange={chooseTrip}
        disabled={loading || loadError}
        placeholder={loading ? 'Loading trips…' : 'Choose a trip'}
        options={trips.map(t => ({
          value: t.id,
          label: `${t.title} · ${formatDate(t.start_date, { day: 'numeric', month: 'short', year: 'numeric' })}`,
        }))}
      />
      {loadError && <p role="alert" className="text-sm text-red-600">Couldn't load trips and bookings. Refresh the page and try again.</p>}
    </div>
  );

  const showList = tab === 'leader' || (tab === 'traveler' && !!tripId);
  const emptyMessage = tab === 'leader'
    ? 'No trip leaders yet. Add them under Trips › Trip Leaders.'
    : `No one has booked ${trip ? `“${trip.title}”` : 'this trip'} yet. A traveler appears here once their payment is recorded.`;

  const fontNote = customFont === false && (
    <p className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2">
      Using a stand-in script font. Add <span className="font-mono">RasleyHeights.ttf</span> to <span className="font-mono">public/travel-card/fonts/</span> to match the design.
    </p>
  );

  return (
    <AdminLayout title="Travel Cards" subtitle="Name tags for travelers and trip leaders, plus the back of the card" scrollRestorationReady={!loading}>
      <div className="space-y-4">
        <div role="tablist" aria-label="Card type" className="inline-flex flex-wrap gap-1 bg-white rounded-full p-1 shadow-card">
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => chooseTab(t.id)}
              className={`px-4 py-1.5 rounded-full text-sm font-button font-semibold transition-colors ${
                tab === t.id ? 'bg-primary text-white' : 'text-dark hover:bg-background-warm'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
          <div className="space-y-4 min-w-0">
            {tab !== 'back' && tripSelect}

            {showList && (
              <div className="bg-white rounded-lg shadow-card">
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-background-warm">
                  <label className="inline-flex items-center gap-2 text-sm font-medium text-dark cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allTicked}
                      onChange={toggleAll}
                      disabled={people.length === 0}
                      className="w-4 h-4 accent-primary"
                    />
                    Select all
                    <span className="text-dark-muted font-normal">({selected.length} of {people.length} selected)</span>
                  </label>
                  <Button size="sm" onClick={downloadSelected} disabled={selected.length === 0 || bulkBusy || !!busyKey}>
                    {bulkBusy ? <CircleNotch size={16} weight="bold" className="animate-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
                    <span className="ml-2">{bulkBusy ? 'Preparing…' : `Download selected${selected.length ? ` (${selected.length})` : ''}`}</span>
                  </Button>
                </div>

                {people.length === 0 ? (
                  <p className="text-center py-10 text-dark-muted text-sm">{emptyMessage}</p>
                ) : (
                  <ul className="divide-y divide-background-warm">
                    {people.map(p => {
                      const ticked = !unticked.has(p.key);
                      const active = previewPerson?.key === p.key;
                      const edited = !!nameOverrides[p.key];
                      return (
                        <li key={p.key} className={`flex items-center gap-3 px-4 py-2.5 ${active ? 'bg-primary/5' : ''}`}>
                          <input
                            type="checkbox"
                            checked={ticked}
                            onChange={() => toggle(p.key)}
                            aria-label={`Include ${displayName(p)}`}
                            className="w-4 h-4 accent-primary shrink-0"
                          />
                          {editingKey === p.key ? (
                            <div className="min-w-0 flex-1 flex items-center gap-1.5">
                              <input
                                autoFocus
                                value={draft}
                                onChange={ev => setDraft(ev.target.value)}
                                onKeyDown={ev => {
                                  if (ev.key === 'Enter') commitEdit(p);
                                  if (ev.key === 'Escape') setEditingKey(null);
                                }}
                                aria-label={`Name on card for ${p.name}`}
                                maxLength={60}
                                className={`${inputClass} !py-1.5`}
                              />
                              <button type="button" onClick={() => commitEdit(p)} aria-label="Save name" title="Save name" className="p-1.5 rounded-md text-primary hover:bg-primary/10"><Check size={16} weight="bold" aria-hidden="true" /></button>
                              <button type="button" onClick={() => setEditingKey(null)} aria-label="Cancel" title="Cancel" className="p-1.5 rounded-md text-dark-muted hover:bg-background-warm"><X size={16} aria-hidden="true" /></button>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => setPreviewKey(p.key)}
                                className="min-w-0 flex-1 text-left text-sm text-dark hover:text-primary"
                                title="Show this card in the preview"
                              >
                                <span className="block truncate">
                                  {displayName(p)}
                                  {p.note ? <span className="text-dark-muted text-xs"> · {p.note}</span> : null}
                                </span>
                                {edited && <span className="block truncate text-2xs text-dark-muted">Original: {p.name}</span>}
                              </button>
                              {edited && (
                                <button type="button" onClick={() => resetName(p)} aria-label={`Reset ${p.name}'s name`} title="Use the original name again" className="p-1.5 rounded-md text-dark-muted hover:text-primary hover:bg-primary/10 shrink-0"><ArrowCounterClockwise size={15} aria-hidden="true" /></button>
                              )}
                              <button type="button" onClick={() => startEdit(p)} aria-label={`Edit name on ${p.name}'s card`} title="Edit the name shown on the card" className="p-1.5 rounded-md text-dark-muted hover:text-primary hover:bg-primary/10 shrink-0"><PencilSimple size={15} aria-hidden="true" /></button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => downloadOne(p)}
                            disabled={!!busyKey || bulkBusy}
                            aria-label={`Download ${displayName(p)}'s card`}
                            className="shrink-0 inline-flex items-center gap-1.5 text-xs font-button font-semibold px-3 py-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {busyKey === p.key ? <CircleNotch size={14} weight="bold" className="animate-spin" aria-hidden="true" /> : <Download size={14} aria-hidden="true" />}
                            Download
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {tab === 'back' && (
              <div className="bg-white rounded-lg p-4 shadow-card space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-medium text-dark">Text on the back of the card</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={resetBack}
                      disabled={backIsDefault}
                      className="inline-flex items-center gap-1.5 text-xs font-button font-semibold px-3 py-1.5 rounded-md text-dark-muted hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ArrowCounterClockwise size={14} aria-hidden="true" /> Reset
                    </button>
                    <Button size="sm" onClick={downloadBack} disabled={backBusy}>
                      {backBusy ? <CircleNotch size={16} weight="bold" className="animate-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
                      <span className="ml-2">{backBusy ? 'Preparing…' : 'Download back card'}</span>
                    </Button>
                  </div>
                </div>
                {BACK_FIELDS.map(f => (
                  <div key={f.key}>
                    <label htmlFor={`back-${f.key}`} className="block text-sm font-medium text-dark mb-1">{f.label}</label>
                    <input
                      id={`back-${f.key}`}
                      value={backText[f.key]}
                      onChange={e => setBackField(f.key, e.target.value)}
                      maxLength={60}
                      className={inputClass}
                    />
                    {f.hint && <p className="text-xs text-dark-muted mt-1">{f.hint}</p>}
                  </div>
                ))}
                <p className="text-xs text-dark-muted">The logo, QR code and icons are part of the card artwork and stay as they are. Changes are saved in this browser.</p>
              </div>
            )}
          </div>

          <aside className="bg-white rounded-lg p-4 shadow-card lg:sticky lg:top-4" aria-label="Card preview">
            <p className="text-sm font-medium text-dark mb-3">{tab === 'back' ? 'Back preview' : 'Preview'}</p>
            {tab === 'back' ? (
              backPreviewUrl
                ? <img src={backPreviewUrl} alt="Back of the travel card" className="w-full max-w-[260px] mx-auto rounded-lg shadow-card" />
                : <div className="flex justify-center py-12"><CircleNotch size={28} className="animate-spin text-dark-muted" aria-hidden="true" /></div>
            ) : previewUrl && previewName ? (
              <img src={previewUrl} alt={`Card for ${previewName}`} className="w-full max-w-[260px] mx-auto rounded-lg shadow-card" />
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-dark-muted text-sm">
                <IdentificationCard size={40} aria-hidden="true" />
                <p>{tab === 'leader' ? 'Trip leaders will show here.' : 'Choose a trip to see the card.'}</p>
              </div>
            )}
            {fontNote}
          </aside>
        </div>
      </div>
    </AdminLayout>
  );
}
