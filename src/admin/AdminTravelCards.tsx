// Admin > Travel Cards: name tags for a trip, in three tabs.
//  - Travelers: the people booked on the chosen trip (the same isBooked() test
//    the Enquiries page and the trip Check-in list use; every booking row is
//    one traveler, so group bookings list each person by name).
//  - Trip leaders: the Trip Leaders directory; the leader assigned to the
//    chosen trip is listed first.
//  - Back card: the five text lines on the back are editable.
//  - Travelers / Trip leaders / Back card each also have an A3 print-sheet panel
//    (see CardSheetPanel.tsx).
//  - Badge: the round ULAA badge. One common design, so like the back card
//    there is no list: download a single PNG or A3 print sheets.
// The card artwork is drawn in utils/travelCard.ts.
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { ArrowCounterClockwise, CaretLeft, CaretRight, Check, CircleNotch, DownloadSimple as Download, IdentificationCard, PencilSimple, X } from '@phosphor-icons/react';
import AdminLayout from './AdminLayout';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import LengthField from '../components/ui/LengthField';
import CardSheetPanel, { CutGuideShapes } from './CardSheetPanel';
import { loadSharedSettings, saveSetting } from './travelCardSettings';
import { useAlert } from '../components/ui/useAlert';
import { getEnquiries, getUpcomingTrips, getAllTripLeadersAdmin } from '../services/api';
import { isBooked } from './enquiries/AdminEnquiriesShared';
import { FORM_INPUT_CLASS as inputClass } from '../constants/formStyles';
import { formatDate } from '../utils/utils-index';
import type { Enquiry, TripLeader, UpcomingTrip } from '../types/types-index';
import { DEFAULT_BACK_CARD_TEXT, GUIDE_NOTE, MARKS_GAP_HINT, MIN_GAP_FOR_MARKS_MM, badgeCutGuides, cutGuideOptions, isCutGuides, layoutBadgeSheet, planBadgeSheets, type BackCardText, type CardSheetItem, type CutGuides, type TravelCardRole } from '../utils/travelCardLayout';
import { MAX_PRINT_SHEETS } from '../constants/limits';

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

type CardTab = 'traveler' | 'leader' | 'back' | 'badge';
const TABS: { id: CardTab; label: string }[] = [
  { id: 'traveler', label: 'Travelers' },
  { id: 'leader', label: 'Trip leaders' },
  { id: 'back', label: 'Back card' },
  { id: 'badge', label: 'Badge' },
];

// Edits made here only change what is printed on the cards. They are kept in
// the database (shared by all admins) and never written back to a booking or the trip leader record.
const NAMES_KEY = 'ulaa-travel-card-names-v1';
const BACK_KEY = 'ulaa-travel-card-back-v1';
const BADGE_KEY = 'ulaa-travel-card-badge-v1';

// Badge print settings are kept as the text typed, so a half-typed number
// ("5" on the way to "58") is never rewritten under the admin's cursor.
interface BadgePrintInputs { diameterMm: string; gapMm: string; quantity: string; guides: CutGuides }
const DEFAULT_BADGE_INPUTS: BadgePrintInputs = { diameterMm: '58', gapMm: '4', quantity: '', guides: 'outline' };

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? { ...fallback, ...parsed } : fallback;
  } catch {
    return fallback;
  }
}
// Saved in this browser at once and for every admin shortly after (see travelCardSettings.ts).
function writeStorage(key: string, value: unknown) {
  saveSetting(key, value);
}

// One row in a card list, whichever tab it belongs to.
interface CardPerson {
  key: string;        // storage key for a name edit
  name: string;       // the name on record
  note?: string;      // small grey text after the name
}

const NO_PEOPLE: CardPerson[] = [];

const BACK_FIELDS: { key: keyof BackCardText; label: string; hint?: string }[] = [
  { key: 'topLine', label: 'Small line above the headline', hint: 'Shown in capitals.' },
  { key: 'headline', label: 'Headline' },
  { key: 'scanLine', label: 'Line under the QR code', hint: 'Shown in capitals.' },
  { key: 'instagram', label: 'Instagram ID' },
  { key: 'phone', label: 'Phone number' },
];

/** useState that survives leaving the page: kept in sessionStorage for this browser tab only. */
function useSessionState<T>(key: string, initial: T, serialize: (v: T) => unknown = v => v, revive: (raw: unknown) => T = raw => raw as T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.sessionStorage.getItem(key);
      return raw === null ? initial : revive(JSON.parse(raw));
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try { window.sessionStorage.setItem(key, JSON.stringify(serialize(value))); } catch { /* storage unavailable */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, value]);
  return [value, setValue];
}

const CARD_TABS: CardTab[] = ['traveler', 'leader', 'back', 'badge'];
const reviveSet = (raw: unknown) => new Set<string>(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);

export default function AdminTravelCards() {
  const alert = useAlert();
  const [tab, setTab] = useSessionState<CardTab>('travelCards.tab', 'traveler', v => v, raw => (CARD_TABS.includes(raw as CardTab) ? (raw as CardTab) : 'traveler'));
  const [trips, setTrips] = useState<UpcomingTrip[]>([]);
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [leaders, setLeaders] = useState<TripLeader[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [tripId, setTripId] = useSessionState<string>('travelCards.tripId', '', v => v, raw => (typeof raw === 'string' ? raw : ''));
  // Everyone is ticked by default; this holds the ones the admin unticked.
  const [unticked, setUnticked] = useSessionState<Set<string>>('travelCards.unticked', new Set(), v => [...v], reviveSet);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [customFont, setCustomFont] = useState<boolean | null>(null);
  const [nameOverrides, setNameOverrides] = useState<Record<string, string>>(() => readStorage<Record<string, string>>(NAMES_KEY, {}));
  const [editingKey, setEditingKey] = useSessionState<string | null>('travelCards.editingKey', null, v => v, raw => (typeof raw === 'string' ? raw : null));
  const [draft, setDraft] = useSessionState<string>('travelCards.nameDraft', '', v => v, raw => (typeof raw === 'string' ? raw : ''));
  const [backText, setBackText] = useState<BackCardText>(() => readStorage<BackCardText>(BACK_KEY, DEFAULT_BACK_CARD_TEXT));
  const [backPreviewUrl, setBackPreviewUrl] = useState<string | null>(null);
  const [backBusy, setBackBusy] = useState(false);
  const [badgePreviewUrl, setBadgePreviewUrl] = useState<string | null>(null);
  const [badgeSettings, setBadgeSettings] = useState<BadgePrintInputs>(() => readStorage<BadgePrintInputs>(BADGE_KEY, DEFAULT_BADGE_INPUTS));
  const [badgeBusy, setBadgeBusy] = useState<'single' | 'sheets' | null>(null);
  const [previewSheet, setPreviewSheet] = useState(0);
  const [includeLeader, setIncludeLeader] = useState(true);
  const [backMatchTravelers, setBackMatchTravelers] = useState(true);

  // Bring in what other admins saved (it replaces the copy kept in this browser).
  useEffect(() => {
    let cancelled = false;
    void loadSharedSettings([NAMES_KEY, BACK_KEY, BADGE_KEY]).then(remote => {
      if (cancelled || !remote) return;
      const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
      if (isObj(remote[NAMES_KEY])) setNameOverrides(remote[NAMES_KEY] as Record<string, string>);
      if (isObj(remote[BACK_KEY])) setBackText({ ...DEFAULT_BACK_CARD_TEXT, ...(remote[BACK_KEY] as Partial<BackCardText>) });
      if (isObj(remote[BADGE_KEY])) setBadgeSettings({ ...DEFAULT_BADGE_INPUTS, ...(remote[BADGE_KEY] as Partial<BadgePrintInputs>) });
    });
    return () => { cancelled = true; };
  }, []);

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

  // Both lists are always built (not just for the open tab) so the Back card
  // tab can follow the Travelers selection.
  const travelerPeople: CardPerson[] = useMemo(
    () => (tripId
      ? enquiries.filter(e => e.trip_id === tripId && isBooked(e)).sort((a, b) => a.full_name.localeCompare(b.full_name))
      : []
    ).map(e => ({
      key: e.id,
      name: e.full_name,
      note: e.group_size && e.group_size > 1 ? `Group ${e.group_seq}/${e.group_size}` : undefined,
    })),
    [enquiries, tripId],
  );
  const leaderPeople: CardPerson[] = useMemo(() => {
    const assigned = trip?.trip_leader_id ?? null;
    return [...leaders]
      .sort((a, b) => Number(b.id === assigned) - Number(a.id === assigned) || a.name.localeCompare(b.name))
      .map(l => ({
        key: `leader:${l.id}`,
        name: l.name,
        note: l.id === assigned ? 'Leads this trip' : l.designation || undefined,
      }));
  }, [leaders, trip]);
  const people: CardPerson[] = tab === 'traveler' ? travelerPeople : tab === 'leader' ? leaderPeople : NO_PEOPLE;

  const displayName = (p: CardPerson) => nameOverrides[p.key]?.trim() || p.name;
  const selected = useMemo(() => people.filter(p => !unticked.has(p.key)), [people, unticked]);
  const previewPerson = people.find(p => p.key === previewKey) ?? people[0] ?? null;
  const previewName = previewPerson ? displayName(previewPerson) : '';

  // Live preview of the front card for the person being looked at.
  useEffect(() => {
    if (!previewName || tab === 'back' || tab === 'badge') return;
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

  // The badge is the same for everyone, so it is drawn once when the tab opens.
  useEffect(() => {
    if (tab !== 'badge') return;
    let cancelled = false;
    let url: string | null = null;
    import('../utils/travelCard')
      .then(async m => {
        const blob = await m.renderBadgeBlob();
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setBadgePreviewUrl(url);
      })
      .catch(err => console.error(err));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [tab]);

  const resetListState = () => {
    setUnticked(new Set());
    setPreviewKey(null);
    setPreviewUrl(null);
    setEditingKey(null);
  };
  const chooseTab = (next: CardTab) => {
    if (next === tab) return;
    setTab(next);
    // Ticks are kept when switching tabs (each person has their own key) so the
    // Back card tab can match what was ticked on Travelers.
    setPreviewKey(null);
    setPreviewUrl(null);
    setEditingKey(null);
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

  // What goes on the A3 sheets: each ticked person once (with any edited
  // name), or the common back card.
  // On the Travelers tab the trip's assigned leader can be printed alongside
  // the travelers (their card says TRIP LEADER).
  const tripLeaderRecord = leaders.find(l => l.id === trip?.trip_leader_id) ?? null;
  const tripLeader = tab === 'traveler' ? tripLeaderRecord : null;
  // How many cards the Travelers sheets print: the ticked travelers plus the
  // trip leader when included. The Back card tab can print the same number.
  const tickedTravelers = travelerPeople.filter(p => !unticked.has(p.key)).length;
  const leaderCards = tripLeaderRecord && includeLeader ? 1 : 0;
  const matchingCount = tickedTravelers + leaderCards;
  const sheetItems = useMemo<CardSheetItem[]>(() => {
    const list: CardSheetItem[] = selected.map(p => ({ kind: 'front', name: displayName(p), role }));
    if (tripLeader && includeLeader) {
      list.push({ kind: 'front', name: nameOverrides[`leader:${tripLeader.id}`]?.trim() || tripLeader.name, role: 'leader' });
    }
    return list;
    // displayName reads nameOverrides, so list it rather than the function
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, nameOverrides, role, tripLeader, includeLeader]);
  const backSheetItems = useMemo<CardSheetItem[]>(() => [{ kind: 'back', text: backText }], [backText]);

  const badgeDiameter = Number(badgeSettings.diameterMm);
  const badgeGap = Number(badgeSettings.gapMm);
  const badgeSizeValid = badgeDiameter >= 20 && badgeDiameter <= 250 && badgeGap >= 0 && badgeGap <= 30;
  const badgePlan = useMemo(
    () => (badgeSizeValid ? planBadgeSheets({ diameterMm: badgeDiameter, gapMm: badgeGap }, 1) : { perSheet: 0, sheets: 0, tooManySheets: false }),
    [badgeSizeValid, badgeDiameter, badgeGap],
  );
  // Blank quantity means "one full sheet".
  const badgeQuantity = Math.floor(Number(badgeSettings.quantity)) > 0 ? Math.floor(Number(badgeSettings.quantity)) : badgePlan.perSheet;
  const badgeSheets = badgePlan.perSheet > 0 ? Math.ceil(badgeQuantity / badgePlan.perSheet) : 0;
  const badgeTooMany = badgeSheets > MAX_PRINT_SHEETS;
  const badgeGuides: CutGuides = isCutGuides(badgeSettings.guides) ? badgeSettings.guides : 'outline';
  // Where each badge sits on an A3 sheet (mm), for the sheet preview below.
  const badgeSlots = useMemo(
    () => (badgeSizeValid ? layoutBadgeSheet({ diameterMm: badgeDiameter, gapMm: badgeGap }) : []),
    [badgeSizeValid, badgeDiameter, badgeGap],
  );
  const sheetIndex = Math.min(previewSheet, Math.max(0, badgeSheets - 1));
  const badgesOnPreviewSheet = Math.max(0, Math.min(badgeSlots.length, badgeQuantity - sheetIndex * badgeSlots.length));

  const setBadgeGuides = (value: string) => {
    if (!isCutGuides(value)) return;
    const next = { ...badgeSettings, guides: value };
    setBadgeSettings(next);
    writeStorage(BADGE_KEY, next);
  };
  const setBadgeField = (key: 'diameterMm' | 'gapMm' | 'quantity', value: string) => {
    const next = { ...badgeSettings, [key]: value.replace(/[^\d.]/g, '') };
    setBadgeSettings(next);
    writeStorage(BADGE_KEY, next);
  };
  const downloadBadgeSingle = async () => {
    if (badgeBusy) return;
    setBadgeBusy('single');
    try {
      const { downloadBadge } = await import('../utils/travelCard');
      await downloadBadge();
    } catch (err) {
      console.error(err);
      await alert({ title: 'Badge', message: 'Could not create the badge. Please try again.' });
    } finally {
      setBadgeBusy(null);
    }
  };
  const downloadBadgeA3 = async () => {
    if (badgeBusy || badgePlan.perSheet === 0 || badgeTooMany) return;
    setBadgeBusy('sheets');
    try {
      const { downloadBadgeSheets } = await import('../utils/travelCard');
      await downloadBadgeSheets({ diameterMm: badgeDiameter, gapMm: badgeGap, guides: badgeGuides }, badgeQuantity);
    } catch (err) {
      console.error(err);
      await alert({ title: 'Badge print sheets', message: err instanceof Error ? err.message : 'Could not create the print sheets. Please try again.' });
    } finally {
      setBadgeBusy(null);
    }
  };

  const tripSelect = (
    <div className="bg-white rounded-lg p-4 shadow-card space-y-3">
      <label htmlFor="travel-card-trip" className="block text-sm font-medium text-dark">
        Trip
        {tab === 'leader' ? <span className="text-dark-muted font-normal"> (optional, shows who leads it)</span> : null}
        {tab === 'back' ? <span className="text-dark-muted font-normal"> (sets how many back cards to print)</span> : null}
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

  const fontNote = customFont === false && tab !== 'badge' && (
    <p className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2">
      Using a stand-in script font. Add <span className="font-mono">RasleyHeights.ttf</span> to <span className="font-mono">public/travel-card/fonts/</span> to match the design.
    </p>
  );

  const previewPanel = (
    <>
            <p className="text-sm font-medium text-dark mb-3">{tab === 'back' ? 'Back preview' : tab === 'badge' ? 'Badge preview' : 'Preview'}</p>
            {tab === 'badge' ? (
              badgePreviewUrl
                ? <img src={badgePreviewUrl} alt="The ULAA badge" className="w-full max-w-[260px] mx-auto rounded-full shadow-card" />
                : <div className="flex justify-center py-12"><CircleNotch size={28} className="animate-spin text-dark-muted" aria-hidden="true" /></div>
            ) : tab === 'back' ? (
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
    </>
  );

  return (
    <AdminLayout title="Travel Cards" subtitle="Name tags, trip leader cards, the back of the card and the ULAA badge" scrollRestorationReady={!loading}>
      <div className="space-y-4">
        <div role="tablist" aria-label="Card type" className="grid grid-cols-2 sm:inline-flex gap-1 bg-white rounded-lg p-1.5 shadow-card">
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => chooseTab(t.id)}
              className={`px-4 py-2 rounded-md text-center text-sm font-button font-semibold transition-colors ${
                tab === t.id ? 'bg-primary text-white' : 'text-dark hover:bg-background-warm'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
          <div className="space-y-4 min-w-0">
            {tripSelect}

            <div className="lg:hidden bg-white rounded-lg p-4 shadow-card" aria-label="Card preview">
              {previewPanel}
            </div>

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

            {showList && people.length > 0 && (
              <CardSheetPanel
                items={sheetItems}
                copies={false}
                fileName={n => (role === 'leader' ? `ULAA-Trip-Leader-Cards-A3-${n}pcs.pdf` : `ULAA-Travel-Cards-A3-${n}pcs.pdf`)}
                emptyMessage={tab === 'traveler' && tripLeader && includeLeader ? undefined : 'Tick at least one person above to lay their cards out on A3 sheets.'}
              >
                {tab === 'traveler' && (
                  <label className={`flex items-start gap-2 text-sm ${tripLeader ? 'text-dark cursor-pointer' : 'text-dark-muted'}`}>
                    <input
                      type="checkbox"
                      checked={!!tripLeader && includeLeader}
                      disabled={!tripLeader}
                      onChange={e => setIncludeLeader(e.target.checked)}
                      className="w-4 h-4 mt-0.5 accent-primary shrink-0"
                    />
                    <span>
                      {tripLeader
                        ? <>Also print the trip leader's card <span className="text-dark-muted">({nameOverrides[`leader:${tripLeader.id}`]?.trim() || tripLeader.name})</span></>
                        : 'No trip leader is assigned to this trip, so there is no leader card to add.'}
                    </span>
                  </label>
                )}
              </CardSheetPanel>
            )}

            {tab === 'badge' && (
              <div className="bg-white rounded-lg p-4 shadow-card space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-medium text-dark">The ULAA badge</p>
                  <Button size="sm" variant="outline" onClick={downloadBadgeSingle} disabled={!!badgeBusy}>
                    {badgeBusy === 'single' ? <CircleNotch size={16} weight="bold" className="animate-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
                    <span className="ml-2">{badgeBusy === 'single' ? 'Preparing…' : 'Download single badge (PNG)'}</span>
                  </Button>
                </div>
                <p className="text-xs text-dark-muted">One common design for everyone. Download it once, or set up A3 sheets with many badges on each for printing.</p>

                <div className="border-t border-background-warm pt-4 space-y-4">
                  <p className="text-sm font-medium text-dark">A3 print sheets</p>
                  <div className="grid sm:grid-cols-3 gap-3">
                    <LengthField id="badge-size" label="Badge size" valueMm={badgeSettings.diameterMm} onChangeMm={v => setBadgeField('diameterMm', v)} />
                    <LengthField id="badge-gap" label="Gap between" valueMm={badgeSettings.gapMm} onChangeMm={v => setBadgeField('gapMm', v)} />
                    <div>
                      <label htmlFor="badge-qty" className="block text-sm font-medium text-dark mb-1">Number of badges</label>
                      <input id="badge-qty" inputMode="numeric" value={badgeSettings.quantity} placeholder={badgePlan.perSheet ? `${badgePlan.perSheet} (1 sheet)` : ''} onChange={e => setBadgeField('quantity', e.target.value)} className={inputClass} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="badge-guides" className="block text-sm font-medium text-dark mb-1">Cut guides</label>
                    <Select inputId="badge-guides" value={badgeGuides} onChange={setBadgeGuides} options={cutGuideOptions('badge')} />
                    {badgeGuides === 'marks' && badgeGap < MIN_GAP_FOR_MARKS_MM && <p className="text-xs text-amber-800 mt-1">{MARKS_GAP_HINT}</p>}
                  </div>
                  {!badgeSizeValid ? (
                    <p role="alert" className="text-xs text-red-600">Badge size must be 20 to 250 mm and the gap 0 to 30 mm.</p>
                  ) : badgePlan.perSheet === 0 ? (
                    <p role="alert" className="text-xs text-red-600">That size does not fit on an A3 sheet.</p>
                  ) : (
                    <p className="text-sm text-dark bg-background-warm rounded-md px-3 py-2">
                      <span className="font-semibold">{badgePlan.perSheet}</span> badges fit on one A3 sheet.
                      {' '}{badgeQuantity} badge{badgeQuantity === 1 ? '' : 's'} = <span className="font-semibold">{badgeSheets}</span> sheet{badgeSheets === 1 ? '' : 's'}.
                    </p>
                  )}
                  {badgeTooMany && <p role="alert" className="text-xs text-red-600">That is more than {MAX_PRINT_SHEETS} sheets. Please download in smaller batches.</p>}

                  {badgeSlots.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium text-dark">Sheet preview</p>
                        <div className="flex items-center gap-1 text-xs text-dark-muted">
                          {badgeSheets > 1 && (
                            <button type="button" onClick={() => setPreviewSheet(Math.max(0, sheetIndex - 1))} disabled={sheetIndex === 0} aria-label="Previous sheet" className="p-1.5 rounded-md hover:bg-background-warm disabled:opacity-40 disabled:cursor-not-allowed"><CaretLeft size={14} weight="bold" aria-hidden="true" /></button>
                          )}
                          <span>Sheet {sheetIndex + 1} of {Math.max(1, badgeSheets)} · {badgesOnPreviewSheet} badge{badgesOnPreviewSheet === 1 ? '' : 's'}</span>
                          {badgeSheets > 1 && (
                            <button type="button" onClick={() => setPreviewSheet(Math.min(badgeSheets - 1, sheetIndex + 1))} disabled={sheetIndex >= badgeSheets - 1} aria-label="Next sheet" className="p-1.5 rounded-md hover:bg-background-warm disabled:opacity-40 disabled:cursor-not-allowed"><CaretRight size={14} weight="bold" aria-hidden="true" /></button>
                          )}
                        </div>
                      </div>
                      <svg
                        viewBox="0 0 297 420"
                        role="img"
                        aria-label={`A3 sheet ${sheetIndex + 1} of ${Math.max(1, badgeSheets)} with ${badgesOnPreviewSheet} badges`}
                        className="w-full max-w-[300px] bg-white border border-background-warm rounded-sm shadow-card"
                      >
                        <rect x="10" y="10" width="277" height="400" fill="none" stroke="#d8cdbd" strokeWidth="0.4" strokeDasharray="2 2" />
                        {badgeSlots.slice(0, badgesOnPreviewSheet).map((slot, i) => (
                          <g key={i}>
                            {badgePreviewUrl
                              ? <image href={badgePreviewUrl} x={slot.x} y={slot.y} width={badgeDiameter} height={badgeDiameter} />
                              : <circle cx={slot.x + badgeDiameter / 2} cy={slot.y + badgeDiameter / 2} r={badgeDiameter / 2} fill="#f6ebdc" stroke="#e44d2e" strokeWidth="0.6" />}
                            <CutGuideShapes shapes={badgeCutGuides(slot, badgeDiameter, badgeGap, badgeGuides)} />
                          </g>
                        ))}
                      </svg>
                      <p className="text-xs text-dark-muted">The dashed line is the 10 mm unprinted border. {badgeGuides !== 'none' && GUIDE_NOTE}</p>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-3">
                    <Button size="sm" onClick={downloadBadgeA3} disabled={!!badgeBusy || badgePlan.perSheet === 0 || badgeTooMany || !badgeSizeValid}>
                      {badgeBusy === 'sheets' ? <CircleNotch size={16} weight="bold" className="animate-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
                      <span className="ml-2">{badgeBusy === 'sheets' ? 'Preparing…' : 'Download A3 print sheets (PDF)'}</span>
                    </Button>
                    {badgeSettings.quantity && badgePlan.perSheet > 0 && (
                      <button type="button" onClick={() => setBadgeField('quantity', '')} className="text-xs font-button font-semibold text-dark-muted hover:text-primary">Fill one sheet</button>
                    )}
                  </div>
                  <p className="text-xs text-dark-muted">A3 is 297 × 420 mm with a 10 mm unprinted border. Print at 100% (actual size) so the badges come out the size you set. Badges are packed as tightly as fits, and the last sheet holds the remainder.</p>
                </div>
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
                <p className="text-xs text-dark-muted">The logo, QR code and icons are part of the card artwork and stay as they are. Changes are saved for all admins.</p>
              </div>
            )}

            {tab === 'back' && (
              <CardSheetPanel
                items={backSheetItems}
                copies
                fixedCount={backMatchTravelers && matchingCount > 0 ? matchingCount : undefined}
                fileName={n => `ULAA-Card-Back-A3-${n}pcs.pdf`}
              >
                <label className={`flex items-start gap-2 text-sm ${matchingCount > 0 ? 'text-dark cursor-pointer' : 'text-dark-muted'}`}>
                  <input
                    type="checkbox"
                    checked={backMatchTravelers && matchingCount > 0}
                    disabled={matchingCount === 0}
                    onChange={e => setBackMatchTravelers(e.target.checked)}
                    className="w-4 h-4 mt-0.5 accent-primary shrink-0"
                  />
                  <span>
                    {matchingCount > 0
                      ? <>One back card for every card on the Travelers sheets <span className="text-dark-muted">({tickedTravelers} traveler{tickedTravelers === 1 ? '' : 's'}{leaderCards ? ' + trip leader' : ''} = {matchingCount})</span></>
                      : 'Choose a trip above (with booked travelers ticked on the Travelers tab) to print one back card for each traveler. Or set a number below.'}
                  </span>
                </label>
              </CardSheetPanel>
            )}
          </div>

          <aside className="hidden lg:block bg-white rounded-lg p-4 shadow-card lg:sticky lg:top-4" aria-label="Card preview">
            {previewPanel}
          </aside>
        </div>
      </div>
    </AdminLayout>
  );
}
