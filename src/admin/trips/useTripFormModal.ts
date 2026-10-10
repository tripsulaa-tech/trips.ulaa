import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createUpcomingTrip, updateUpcomingTrip, renameUpcomingTripSlug, getAllTripLeadersAdmin, deleteImageByUrl,
  uploadImage, uploadImageFromUrl, COVER_IMAGE_TARGET_SIZE_BYTES,
} from '../../services/api';
import { useAlert } from '../../components/ui/useAlert';
import { useToast } from '../../components/ui/useToast';
import type { UpcomingTrip, TripLeader } from '../../types/types-index';
import { slugify } from '../../utils/utils-index';
import { DEFAULT_TERMS_AND_CONDITIONS } from '../../constants/terms';
import { DEFAULT_CANCELLATION_POLICY } from '../../constants/cancellationPolicy';
import { emptyTripFinance, foldLegacyCosts } from '../../utils/tripFinance';
import { emptyTripOptions, cleanTripOptions } from '../../utils/tripOptions';
import { emptyEndBanner, emptyForm, computeDuration, type TripForm } from './tripFormTypes';
import { handleExportTemplate, parseImportedTripForm } from './tripTemplateIO';
import { readZip, mimeForName } from './zipReader';
import { scrollToTextMatch, findRankedMatches, scrollToMatchElement } from '../../utils/scroll';
import {
  useDraftKeeper, modalDraftBase, resolveModalDraft, settleDraft, discardDraft, type ModalDraftValue,
} from '../../hooks/useSessionDraft';
import { STORAGE_BUCKET } from '../../constants/storage';

export { FORM_INPUT_CLASS as inputClass } from '../../constants/formStyles';

// Where the half-edited trip is parked while the admin hops over to
// Admin → Trip Leaders to fix a leader's details (see stashDraftForLeaderDetour).
// sessionStorage, so it survives the route change (and a refresh) but is gone
// when the tab closes.
const LEADER_DETOUR_DRAFT_KEY = 'ulaa_trip_draft_leader_detour';

interface LeaderDetourDraft {
  tripId: string | null;
  form: TripForm;
  initialUrls: string[];
}

/** The form as built from a saved trip — what "Edit trip" opens with, and what a kept draft of that
 *  trip is measured against. */
function tripToForm(trip: UpcomingTrip): TripForm {
  return {
    title: trip.title, destination: trip.destination,
    start_date: trip.start_date, end_date: trip.end_date,
    duration: computeDuration(trip.start_date, trip.end_date) || trip.duration, description: trip.description,
    itinerary: trip.itinerary || [],
    not_included: trip.not_included || [],
    meeting_point: trip.meeting_point || '',
    meeting_point_map_url: trip.meeting_point_map_url || '',
    meeting_time: trip.meeting_time || '', meeting_terminal: trip.meeting_terminal || '',
    meeting_details: trip.meeting_details || '',
    faqs: trip.faqs || [], total_seats: trip.total_seats, seats_booked: trip.seats_booked || 0,
    min_age: trip.min_age ?? '', max_age: trip.max_age ?? '',
    price: trip.price ?? '', early_bird_price: trip.early_bird_price ?? '',
    early_bird_deadline: trip.early_bird_deadline || '',
    early_bird_seats: trip.early_bird_seats ?? '',
    strike_through_price: trip.strike_through_price ?? '',
    advance_amount: trip.advance_amount ?? '',
    special_offer_name: trip.special_offer_name || '',
    special_offer_price: trip.special_offer_price ?? '',
    special_offer_date: trip.special_offer_date || '',
    special_offer_end_date: trip.special_offer_end_date || '',
    card_feature_tags: trip.card_feature_tags || [],
    trip_type: trip.trip_type || '',
    cover_image: trip.cover_image || '',
    cover_image_crop: trip.cover_image_crop || null,
    hero_mobile_image: trip.hero_mobile_image || '',
    status: trip.status,
    terms_and_conditions: trip.terms_and_conditions || DEFAULT_TERMS_AND_CONDITIONS,
    cancellation_policy: trip.cancellation_policy || DEFAULT_CANCELLATION_POLICY,
    // Extended
    highlight_cards: trip.highlight_cards || [],
    accommodation_description: trip.accommodation_description || '',
    accommodation_photos: trip.accommodation_photos || [],
    included_groups: trip.included_groups || [],
    gallery_items: trip.gallery_items || [],
    gallery_description: trip.gallery_description || '',
    fashion_photos: trip.fashion_photos || [],
    fashion_description: trip.fashion_description || '',
    things_to_carry_items: trip.things_to_carry_items || [],
    trip_leader_id: trip.trip_leader_id || '',
    confidence_items: trip.confidence_items || [],
    confidence_description: trip.confidence_description || '',
    meeting_address: trip.meeting_address || '',
    end_banner: trip.end_banner || emptyEndBanner,
    trip_finance: foldLegacyCosts(trip.trip_finance || emptyTripFinance),
    trip_options: trip.trip_options || emptyTripOptions,
  };
}

const TRIP_DRAFT_KEY = 'trip-form';

/** Owns the Add/Edit Trip modal end-to-end: the TripForm state itself,
 *  opening it (blank or pre-filled from a trip), the in-modal field
 *  search, saving, closing (with orphaned-upload cleanup), and the
 *  Export/Import Template flow. `load` is called after any save so the
 *  Trips table (owned by useTripsData) reflects the change. */
export function useTripFormModal(load: () => void) {
  const alert = useAlert();
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalSearch, setModalSearch] = useState('');
  const [modalSearchNoMatch, setModalSearchNoMatch] = useState(false);
  // The modal's own scrollable body — passed to Modal as `bodyRef` and to
  // Tabs as `scrollContainerRef` so both the scroll-spy and any
  // programmatic jump (tab click, field search) scope their scrolling to
  // this container instead of walking up to <body>/<html>.
  const modalBodyRef = useRef<HTMLDivElement>(null);
  const [editingTrip, setEditingTrip] = useState<UpcomingTrip | null>(null);
  const [saving, setSaving] = useState(false);
  // Set while an imported template's photos are still being found / downloaded.
  const [photosImporting, setPhotosImporting] = useState(false);
  // Edit only: when the title no longer matches the trip's link, whether this
  // save should also change the link (old link keeps redirecting). Ticked by
  // default so renaming a trip renames its URL too.
  const [updateLink, setUpdateLink] = useState(true);
  const [form, setForm] = useState<TripForm>(emptyForm);
  // The form as it was when the pop-up opened (blank, or built from the saved trip): what the
  // kept draft is measured against.
  const [baseline, setBaseline] = useState<TripForm | null>(null);
  // A kept draft whose trip changed after the draft was started: held until the admin chooses.
  const [heldDraft, setHeldDraft] = useState<{ recordId: string | null; form: TripForm; baseline: TripForm } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // The Trip Leaders directory (Admin → Trip Leaders), loaded once so the
  // Add/Edit Trip modal's Trip Leader tab can offer an "assign from directory"
  // picker and preview the assigned leader's details live.
  const [tripLeaders, setTripLeaders] = useState<TripLeader[]>([]);
  useEffect(() => {
    getAllTripLeadersAdmin().then(setTripLeaders).catch(() => setTripLeaders([]));
  }, []);

  // Tracks the set of image URLs that were already in the form when the
  // modal opened. Any storage URL in the form at close-time that is NOT in
  // this set was uploaded during the current session but never saved to the
  // DB — it's an orphan. We delete those on cancel/close so they don't
  // silently accumulate in the bucket.
  const initialModalUrlsRef = useRef<Set<string>>(new Set());

  // Collects every image URL currently in a TripForm into a flat Set.
  const collectTripFormUrls = (f: TripForm): Set<string> => {
    const urls = new Set<string>();
    const add = (u?: string) => { if (u) urls.add(u); };
    add(f.cover_image);
    add(f.hero_mobile_image);
    add(f.end_banner?.image);
    f.accommodation_photos?.forEach(u => add(u));
    f.fashion_photos?.forEach(u => add(u));
    f.gallery_items?.forEach(item => add(item.photo));
    f.itinerary?.forEach(day => day.images?.forEach(u => add(u)));
    return urls;
  };

  const isStorageUrl = (url: string) => url.includes(`/object/public/${STORAGE_BUCKET}/`);

  // Closes the edit/create modal. Any image URLs that were uploaded during
  // this session but aren't in the initial snapshot are orphans (the admin
  // navigated away without saving) — delete them best-effort before closing.
  const closeModal = () => {
    const currentUrls = collectTripFormUrls(form);
    const initial = initialModalUrlsRef.current;
    for (const url of currentUrls) {
      if (!initial.has(url) && isStorageUrl(url)) {
        deleteImageByUrl(STORAGE_BUCKET, url).catch(() => {});
      }
    }
    initialModalUrlsRef.current = new Set();
    setModalOpen(false);
    discardDraft(TRIP_DRAFT_KEY);
  };

  // Keep the pop-up's unsaved edits while they differ from where it started, so leaving the
  // page (or refreshing) and coming back finds the pop-up as it was left.
  const draftValue = useMemo<ModalDraftValue<TripForm>>(() => ({ recordId: editingTrip?.id ?? null, form }), [editingTrip, form]);
  useDraftKeeper({
    key: TRIP_DRAFT_KEY,
    value: draftValue,
    base: modalOpen && baseline ? modalDraftBase(editingTrip?.id ?? null, baseline) : null,
  });

  const openFromDraft = (trips: UpcomingTrip[], recordId: string | null, draftForm: TripForm, draftBaseline: TripForm) => {
    setEditingTrip(recordId ? trips.find(t => t.id === recordId) ?? null : null);
    setForm({ ...emptyForm, ...draftForm });
    setBaseline(draftBaseline);
    initialModalUrlsRef.current = collectTripFormUrls(draftBaseline);
    setModalSearch('');
    setModalSearchNoMatch(false);
    setModalOpen(true);
  };

  /** Reopens the pop-up as it was left, if an unsaved draft is kept for this tab. Returns true
   *  when it reopened (or put a draft on hold because the trip changed meanwhile). */
  const resumeKeptDraft = (trips: UpcomingTrip[]): boolean => {
    const result = resolveModalDraft<TripForm>(TRIP_DRAFT_KEY, id => {
      if (id === null) return emptyForm;
      const trip = trips.find(t => t.id === id);
      return trip ? tripToForm(trip) : null;
    });
    if (result.status === 'none') return false;
    if (result.status === 'stale') {
      setHeldDraft({ recordId: result.recordId, form: result.form, baseline: result.baseline });
      return true;
    }
    openFromDraft(trips, result.recordId, result.form, result.baseline);
    return true;
  };

  const restoreHeldDraft = (trips: UpcomingTrip[]) => {
    if (!heldDraft) return;
    openFromDraft(trips, heldDraft.recordId, heldDraft.form, heldDraft.baseline);
    setHeldDraft(null);
  };
  const discardHeldDraft = () => {
    discardDraft(TRIP_DRAFT_KEY);
    setHeldDraft(null);
  };

  // Scans every field label / section heading currently rendered inside the
  // Add/Edit Trip modal (Tabs renders every section in one continuous flow,
  // so everything is always in the DOM) and scrolls the first text match
  // into view with a brief highlight flash — a quick way to jump straight
  // to a field (e.g. "meeting point", "pricing") without hunting through
  // tabs. `modalBodyRef` is the modal's own scrollable body (see Modal's
  // `bodyRef`); see scrollToTextMatch (shared with useSectionTabChrome's
  // own handlePageSearch) for why scrolling is scoped to it directly rather
  // than calling the match's own scrollIntoView(). The sticky bar it's kept
  // clear of here is Tabs' own `data-sticky-toolbar` marker.
  const handleModalSearch = () => {
    const query = modalSearch.trim();
    const container = modalBodyRef.current;
    if (!query || !container) {
      setModalSearchNoMatch(false);
      return;
    }
    jumpToSearchMatch(0);
  };

  // Jumps to the Nth best match for the current query (0 = best). Typing
  // always goes to the best match; pressing Enter in the search box steps to
  // the next one and wraps around.
  const searchMatchIndexRef = useRef(0);
  const jumpToSearchMatch = (index: number) => {
    const query = modalSearch.trim();
    const container = modalBodyRef.current;
    if (!query || !container) return;
    const matches = findRankedMatches(container, query);
    if (matches.length === 0) {
      setModalSearchNoMatch(true);
      return;
    }
    setModalSearchNoMatch(false);
    const i = ((index % matches.length) + matches.length) % matches.length;
    searchMatchIndexRef.current = i;
    scrollToMatchElement(container, matches[i], c => c.querySelector<HTMLElement>('[data-sticky-toolbar]')?.getBoundingClientRect().height ?? 0);
  };
  const handleModalSearchEnter = () => jumpToSearchMatch(searchMatchIndexRef.current + 1);

  // Runs the field search automatically as the admin types, so there's no
  // separate "Search" button to click — a short debounce avoids jumping/
  // scrolling on every single keystroke. Clearing the box resolves via the
  // same debounced call (handleModalSearch resets the no-match flag itself
  // when the query is empty), so nothing needs to run synchronously here.
  useEffect(() => {
    if (!modalOpen) return;
    const timeout = setTimeout(() => handleModalSearch(), modalSearch.trim() ? 350 : 0);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalSearch, modalOpen]);

  // ---- Trip Leader detour -------------------------------------------------
  // The Trip Leader tab can send the admin to Admin → Trip Leaders to edit
  // (or add) a leader. That's a different route, so this page unmounts and the
  // open modal would lose everything typed so far. Before leaving, the whole
  // form is parked in sessionStorage; on return, resumeLeaderDraft() puts the
  // modal back exactly as it was (and scrolls to the Trip Leader section).
  // Returns false if it couldn't be saved, so the caller can stay put instead
  // of silently losing work.
  const stashDraftForLeaderDetour = (): boolean => {
    try {
      const draft: LeaderDetourDraft = {
        tripId: editingTrip?.id ?? null,
        form,
        initialUrls: Array.from(initialModalUrlsRef.current),
      };
      sessionStorage.setItem(LEADER_DETOUR_DRAFT_KEY, JSON.stringify(draft));
      return true;
    } catch {
      return false;
    }
  };

  const pendingLeaderScrollRef = useRef(false);

  // Re-opens the modal from the parked draft. `trips` is the loaded trips
  // list (to find the trip being edited); `assignLeaderId`, when given (a
  // leader just created), is selected on the restored form.
  const resumeLeaderDraft = (trips: UpcomingTrip[], assignLeaderId?: string): boolean => {
    let draft: LeaderDetourDraft | null = null;
    try {
      const raw = sessionStorage.getItem(LEADER_DETOUR_DRAFT_KEY);
      draft = raw ? (JSON.parse(raw) as LeaderDetourDraft) : null;
      sessionStorage.removeItem(LEADER_DETOUR_DRAFT_KEY);
    } catch {
      draft = null;
    }
    if (!draft) return false;
    const trip = draft.tripId ? trips.find(t => t.id === draft!.tripId) : null;
    if (draft.tripId && !trip) return false; // the trip was deleted meanwhile
    setEditingTrip(trip ?? null);
    setForm(assignLeaderId ? { ...draft.form, trip_leader_id: assignLeaderId } : draft.form);
    setBaseline(trip ? tripToForm(trip) : emptyForm);
    initialModalUrlsRef.current = new Set(draft.initialUrls);
    setModalSearch('');
    setModalSearchNoMatch(false);
    pendingLeaderScrollRef.current = true;
    setModalOpen(true);
    return true;
  };

  // After a resume, bring the Trip Leader section into view once the modal
  // has rendered.
  useEffect(() => {
    if (!modalOpen || !pendingLeaderScrollRef.current) return;
    pendingLeaderScrollRef.current = false;
    const timeout = setTimeout(() => {
      scrollToTextMatch(modalBodyRef.current, 'Assign Trip Leader', 'label', {
        getStickyOffset: c => c.querySelector<HTMLElement>('[data-sticky-toolbar]')?.getBoundingClientRect().height ?? 0,
      });
    }, 450);
    return () => clearTimeout(timeout);
  }, [modalOpen]);

  const openCreate = () => {
    setEditingTrip(null);
    setModalSearch('');
    setModalSearchNoMatch(false);
    const initialForm = emptyForm;
    setForm(initialForm);
    setBaseline(initialForm);
    initialModalUrlsRef.current = collectTripFormUrls(initialForm);
    setModalOpen(true);
  };

  const openEdit = (trip: UpcomingTrip) => {
    setEditingTrip(trip);
    setUpdateLink(true);
    const editForm = tripToForm(trip);
    setForm(editForm);
    setBaseline(editForm);
    initialModalUrlsRef.current = collectTripFormUrls(editForm);
    setModalSearch('');
    setModalSearchNoMatch(false);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.destination.trim() || !form.start_date || !form.end_date) {
      await alert({
        title: 'Missing required fields',
        message: 'Title, Destination, Start Date, and End Date are all required before saving this trip.',
      });
      return;
    }
    if (form.price === '' || Number(form.price) <= 0) {
      await alert({
        title: 'Regular price required',
        message: 'Please enter a Regular Price per person before saving this trip.',
      });
      return;
    }
    if (form.min_age !== '' && form.max_age !== '' && Number(form.min_age) > Number(form.max_age)) {
      await alert({
        title: 'Invalid age range',
        message: 'Min Age cannot be greater than Max Age.',
      });
      return;
    }
    if (form.special_offer_date && form.special_offer_end_date && form.special_offer_end_date < form.special_offer_date) {
      await alert({
        title: 'Invalid offer date range',
        message: 'Offer End Date cannot be before Offer Start Date.',
      });
      return;
    }
    if (photosImporting) {
      await alert({
        title: 'Photos are still being imported',
        message: 'The photos from the imported template are still being found and saved. This takes a minute or two. Please wait for the "Imported … photos" message, then save, so the trip is not saved with unfinished photos.',
      });
      return;
    }
    // Safety net: never save a leftover "search: …" entry or a bare file name as if it were a photo link.
    const looksUnresolved = (u: string) => /^search:/i.test(u) || (u !== '' && !/^(https?:|data:|blob:)/i.test(u));
    const strip = (l: string[] | undefined) => (l ?? []).filter(u => !looksUnresolved(u));
    const cleaned: TripForm = {
      ...form,
      cover_image: looksUnresolved(form.cover_image) ? '' : form.cover_image,
      hero_mobile_image: looksUnresolved(form.hero_mobile_image) ? '' : form.hero_mobile_image,
      gallery_items: form.gallery_items.map(g => ({ ...g, photo: looksUnresolved(g.photo) ? '' : g.photo })),
      fashion_photos: strip(form.fashion_photos),
      accommodation_photos: strip(form.accommodation_photos),
      itinerary: form.itinerary.map(d => ({ ...d, images: strip(d.images) })),
      end_banner: { ...form.end_banner, image: looksUnresolved(form.end_banner.image) ? '' : form.end_banner.image },
    };
    try {
      setSaving(true);
      const data = {
        ...cleaned,
        // The slug is a public URL and a storage-folder path (see the
        // `trips/{slug}/...` pathPrefixes throughout this form), so it must
        // stay stable once a trip exists — recomputing it from the title on
        // every save would silently split an edited trip's images across
        // two folders (old-slug and new-slug) and break any previously
        // shared/bookmarked trip link. Only set it on create; on edit, the
        // existing slug column is left untouched (own it via a dedicated
        // rename flow if it ever needs to change deliberately).
        ...(editingTrip ? {} : { slug: slugify(form.title) }),
        price: form.price,
        early_bird_price: form.early_bird_price === '' ? null : form.early_bird_price,
        early_bird_deadline: form.early_bird_deadline || null,
        early_bird_seats: form.early_bird_seats === '' || form.early_bird_seats <= 0 ? null : Math.floor(form.early_bird_seats),
        strike_through_price: form.strike_through_price === '' ? null : form.strike_through_price,
        advance_amount: form.advance_amount === '' ? null : form.advance_amount,
        special_offer_name: form.special_offer_name === '' ? null : form.special_offer_name,
        special_offer_price: form.special_offer_price === '' ? null : form.special_offer_price,
        special_offer_date: form.special_offer_date || null,
        special_offer_end_date: form.special_offer_end_date || null,
        trip_type: form.trip_type === '' ? null : form.trip_type,
        min_age: form.min_age === '' ? null : form.min_age,
        max_age: form.max_age === '' ? null : form.max_age,
        trip_leader_id: form.trip_leader_id === '' ? null : form.trip_leader_id,
        seats_booked: Math.max(0, Math.min(form.seats_booked, form.total_seats)),
        // Blank/unnamed rows and dangling option references are dropped;
        // nothing left = stored as null (a plain single-price trip).
        trip_options: cleanTripOptions(form.trip_options),
      };
      let linkProblem = false;
      if (editingTrip) {
        await updateUpcomingTrip(editingTrip.id, data);
        // The slug is frozen in the database, so changing the link is its own
        // deliberate step (see add_trip_slug_rename.sql). The trip itself is
        // already saved by now; a failure here only leaves the old link.
        const newSlug = slugify(form.title);
        if (updateLink && newSlug && newSlug !== editingTrip.slug) {
          try {
            await renameUpcomingTripSlug(editingTrip.id, newSlug);
          } catch {
            linkProblem = true;
          }
        }
      } else {
        await createUpcomingTrip(data);
      }
      // All uploads are now committed to the DB — nothing to clean up on close.
      initialModalUrlsRef.current = new Set();
      setModalOpen(false);
      // Photos that were uploaded and then replaced before saving are deleted now.
      settleDraft(TRIP_DRAFT_KEY, collectTripFormUrls(form));
      load();
      if (linkProblem) {
        await alert({
          title: 'Trip saved, but its link was not changed',
          message: 'Another trip may already use that link, or add_trip_slug_rename.sql has not been run in Supabase yet. The trip still uses its old link.',
        });
      }
    } catch (e) {
      console.error('Trip save failed:', e);
      const reason = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : '';
      toast.error(`Couldn't save the trip.${reason ? ` Reason: ${reason}` : ''}`, { action: { label: 'Try again', onClick: () => { void handleSave(); } } });
    } finally {
      setSaving(false);
    }
  };

  // Commits whatever's typed/pasted in a group's bullet-draft textarea as one
  // or more bullets, then clears the box. Handles the case where a paste
  // didn't contain multiple lines (so wasn't auto-split) and needs Enter/blur
  // to be added as a single bullet.
  const commitGroupBulletDraft = (gi: number, el: HTMLTextAreaElement) => {
    const lines = el.value.split(/\r?\n\s*\n|\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    setForm(f => ({ ...f, included_groups: f.included_groups.map((g, idx) => idx === gi ? { ...g, bullets: [...g.bullets, ...lines] } : g) }));
    el.value = '';
  };

  // An imported template can name a photo for EVERY image spot (desktop cover, mobile hero, gallery,
  // fashion, each itinerary day, accommodation, end banner). Each one is either a direct image link
  // or the file name of a photo inside the .zip that was imported. In the background every photo is
  // downloaded / unpacked and saved to our storage exactly like a manual upload (compressed, longest
  // side capped), then swapped into the form. Anything that can't be loaded is cleared (a bare file
  // name would only show a broken picture) and reported once at the end. The two cover photos are
  // also checked against the recommended shape so a wrong-sized photo is flagged right away.
  const processImportedImages = async (imported: TripForm, zipFiles: Map<string, () => Promise<Blob>> | null) => {
    const measure = (url: string) => new Promise<{ w: number; h: number } | null>(resolve => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve(null);
      img.src = url;
    });
    const slug = slugify(imported.title) || 'new-trip';
    const isLink = (v: string) => /^https?:\/\//i.test(v);
    const baseName = (v: string) => (v.split(/[\\/]/).pop() ?? v).split('?')[0].toLowerCase();

    // Every image spot: where it lives (for the upload path) and how big to keep it.
    type Spot = { source: string; folder: string; label: string; big: boolean; kind?: 'desktop' | 'mobile' };
    const spots: Spot[] = [];
    const add = (source: string | undefined, folder: string, label: string, big = false, kind?: 'desktop' | 'mobile') => {
      if (source && !isStorageUrl(source)) spots.push({ source, folder, label, big, kind });
    };
    add(imported.cover_image, 'trip-covers', 'Desktop cover image', true, 'desktop');
    add(imported.hero_mobile_image, 'trip-covers/hero-mobile', 'Mobile hero image', true, 'mobile');
    imported.gallery_items.forEach((g, i) => add(g.photo, `trips/${slug}/gallery`, `Gallery photo ${i + 1}`));
    imported.fashion_photos.forEach((u, i) => add(u, `trips/${slug}/fashion`, `Fashion photo ${i + 1}`));
    imported.itinerary.forEach(d => (d.images ?? []).forEach((u, i) => add(u, `trips/${slug}/itinerary/day-${d.day}`, `Day ${d.day} photo ${i + 1}`)));
    imported.accommodation_photos.forEach((u, i) => add(u, `trips/${slug}/accommodation`, `Accommodation photo ${i + 1}`));
    add(imported.end_banner?.image, 'trip-end-banners', 'End banner image', false);
    if (spots.length === 0) return;
    setPhotosImporting(true);
    const total = spots.length;
    let finished = 0;
    toast.info(`Finding and saving ${total} photos. This takes a minute or two. Please wait for the "Imported … photos" message before saving.`, { duration: 12000 });

    // Swap one source string for its hosted URL (or '' to drop it) everywhere it appears.
    const swap = (from: string, to: string) => setForm(f => {
      const sub = (u: string) => (u === from ? to : u);
      const subList = (l: string[]) => (to ? l.map(sub) : l.filter(u => u !== from));
      return {
        ...f,
        cover_image: sub(f.cover_image),
        hero_mobile_image: sub(f.hero_mobile_image),
        gallery_items: f.gallery_items.map(g => ({ ...g, photo: sub(g.photo) })),
        fashion_photos: subList(f.fashion_photos),
        accommodation_photos: subList(f.accommodation_photos),
        itinerary: f.itinerary.map(d => ({ ...d, images: subList(d.images ?? []) })),
        end_banner: { ...f.end_banner, image: sub(f.end_banner.image) },
      };
    });

    const notes: string[] = [];
    const hosted = new Map<string, string>(); // source -> our storage URL (a photo used twice uploads once)
    let counter = 0;

    const processSpot = async (spot: Spot) => {
      let finalUrl = hosted.get(spot.source) ?? '';
      if (!finalUrl) {
        const target = spot.big ? COVER_IMAGE_TARGET_SIZE_BYTES : undefined;
        const path = `${spot.folder}/${Date.now()}-${counter++}-${slug}-import`;
        try {
          if (isLink(spot.source)) {
            try {
              finalUrl = await uploadImageFromUrl(STORAGE_BUCKET, spot.source, path, target);
            } catch {
              // Source site blocks reading the file (CORS): keep it linked so the photo still shows.
              finalUrl = spot.source;
              notes.push(`${spot.label}: the source site blocks saving it to our storage, so it is linked directly. Use Replace for best results.`);
            }
          } else {
            const getBlob = zipFiles?.get(baseName(spot.source));
            if (!getBlob) throw new Error('not in zip');
            const blob = await getBlob();
            const name = spot.source.split(/[\\/]/).pop() ?? 'image';
            finalUrl = await uploadImage(STORAGE_BUCKET, new File([blob], name, { type: blob.type || mimeForName(name) }), `${path}-${name}`, target);
          }
        } catch {
          swap(spot.source, '');
          notes.push(zipFiles
            ? `${spot.label}: "${spot.source}" was not found in the zip or could not be read.`
            : `${spot.label}: "${spot.source}" is a file name, but no zip was imported. Import a .zip with the photos inside, or upload it in the app.`);
          return;
        }
        hosted.set(spot.source, finalUrl);
      }
      if (finalUrl !== spot.source) swap(spot.source, finalUrl);

      if (spot.kind) {
        const size = await measure(finalUrl);
        if (!size) notes.push(`${spot.label}: it didn't load as an image. Please replace it.`);
        else if (spot.kind === 'desktop' && (size.w < 1600 || size.w / size.h < 1.3)) notes.push(`${spot.label} is ${size.w}×${size.h}. Use a landscape photo at least 1600px wide (ideally 2400×1029).`);
        else if (spot.kind === 'mobile' && (size.h <= size.w || size.w < 1080)) notes.push(`${spot.label} is ${size.w}×${size.h}. Use a portrait 9:16 photo, at least 1080×1920.`);
      }
    };

    // A few at a time: quick, without hammering storage.
    const queue = [...spots];
    try {
      await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
        while (queue.length) {
          const spot = queue.shift()!;
          try { await processSpot(spot); } catch { swap(spot.source, ''); notes.push(`${spot.label}: could not be imported. Add it in the app.`); }
          finished++;
          if (finished % 10 === 0 && finished < total) toast.info(`${finished} of ${total} photos done…`, { duration: 4000 });
        }
      }));
    } finally {
      setPhotosImporting(false);
    }

    if (notes.length) toast.warning(notes.join(' '), { duration: 30000 });
    else toast.success(`Imported ${hosted.size} photo${hosted.size === 1 ? '' : 's'}.`);
  };

  // Reads a filled-in export template and populates the Add Trip form. Accepts either the plain
  // .json, or a .zip holding that .json plus the photos it refers to by file name.
  const handleImportFile = async (file: File) => {
    try {
      let raw: unknown;
      let zipFiles: Map<string, () => Promise<Blob>> | null = null;
      if (/\.zip$/i.test(file.name) || file.type === 'application/zip' || file.type === 'application/x-zip-compressed') {
        const entries = await readZip(file);
        const jsons = entries.filter(e => /\.json$/i.test(e.name));
        // Prefer the shortest path (the template at the top of the zip) if there are several.
        const jsonEntry = jsons.sort((a, b) => a.name.length - b.name.length)[0];
        if (!jsonEntry) throw new Error('No .json file inside the zip');
        raw = JSON.parse(await (await jsonEntry.getBlob()).text());
        zipFiles = new Map(entries.filter(e => e !== jsonEntry).map(e => [(e.name.split('/').pop() ?? e.name).toLowerCase(), e.getBlob]));
      } else {
        raw = JSON.parse(await file.text());
      }
      const imported = parseImportedTripForm(raw);
      setEditingTrip(null);
      setForm(imported);
      // Measured against the blank form: an imported template is unsaved work worth keeping.
      setBaseline(emptyForm);
      initialModalUrlsRef.current = collectTripFormUrls(imported);
      setModalOpen(true);
      // Runs in the background so the form opens straight away.
      void processImportedImages(imported, zipFiles);
    } catch {
      await alert({
        title: 'Import failed',
        message: 'That file could not be read. Use the JSON file from Export Template (optionally filled in), or a .zip containing that JSON plus the photos it names, and try again.',
      });
    }
  };

  const handleImportInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImportFile(file);
    e.target.value = '';
  };

  return {
    modalOpen, closeModal, openCreate, openEdit,
    modalSearch, setModalSearch, modalSearchNoMatch, modalBodyRef, handleModalSearchEnter,
    editingTrip, form, setForm, saving, photosImporting, handleSave, updateLink, setUpdateLink,
    commitGroupBulletDraft,
    importInputRef, handleImportInputChange,
    handleExportTemplate,
    tripLeaders,
    stashDraftForLeaderDetour, resumeLeaderDraft,
    resumeKeptDraft, heldDraft, restoreHeldDraft, discardHeldDraft,
  };
}
