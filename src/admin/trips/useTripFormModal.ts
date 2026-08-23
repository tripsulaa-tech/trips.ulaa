import { useEffect, useRef, useState } from 'react';
import {
  createUpcomingTrip, updateUpcomingTrip, getSiteContent, deleteImageByUrl,
} from '../../services/api';
import { useAlert } from '../../components/ui/useAlert';
import type { UpcomingTrip, TripFounder, FounderContent } from '../../types/types-index';
import { slugify } from '../../utils/utils-index';
import { DEFAULT_TERMS_AND_CONDITIONS } from '../../constants/terms';
import { DEFAULT_CANCELLATION_POLICY } from '../../constants/cancellationPolicy';
import { emptyFounder, emptyEndBanner, emptyForm, computeDuration, type TripForm } from './tripFormTypes';
import { handleExportTemplate, parseImportedTripForm } from './tripTemplateIO';

export { FORM_INPUT_CLASS as inputClass } from '../../constants/formStyles';

/** Owns the Add/Edit Trip modal end-to-end: the TripForm state itself,
 *  opening it (blank or pre-filled from a trip), the in-modal field
 *  search, saving, closing (with orphaned-upload cleanup), and the
 *  Export/Import Template flow. `load` is called after any save so the
 *  Trips table (owned by useTripsData) reflects the change. */
export function useTripFormModal(load: () => void) {
  const alert = useAlert();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalSearch, setModalSearch] = useState('');
  const [modalSearchNoMatch, setModalSearchNoMatch] = useState(false);
  const modalBodyRef = useRef<HTMLDivElement>(null);
  const [editingTrip, setEditingTrip] = useState<UpcomingTrip | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<TripForm>(emptyForm);
  const importInputRef = useRef<HTMLInputElement>(null);

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
    add(f.trip_founder?.photo);
    add(f.end_banner?.image);
    f.accommodation_photos?.forEach(u => add(u));
    f.fashion_photos?.forEach(u => add(u));
    f.gallery_items?.forEach(item => add(item.photo));
    f.itinerary?.forEach(day => day.images?.forEach(u => add(u)));
    return urls;
  };

  const STORAGE_BUCKET = 'ulaa';
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
  };

  // Scans every field label / section heading currently rendered inside the
  // Add/Edit Trip modal (Tabs renders every section in one continuous flow,
  // so everything is always in the DOM) and scrolls the first text match
  // into view with a brief highlight flash — a quick way to jump straight
  // to a field (e.g. "meeting point", "pricing") without hunting through tabs.
  const handleModalSearch = () => {
    const query = modalSearch.trim().toLowerCase();
    const container = modalBodyRef.current;
    if (!query || !container) {
      setModalSearchNoMatch(false);
      return;
    }
    const candidates = Array.from(container.querySelectorAll<HTMLElement>('label, h4'));
    const match = candidates.find(el => el.textContent?.toLowerCase().includes(query));
    if (!match) {
      setModalSearchNoMatch(true);
      return;
    }
    setModalSearchNoMatch(false);
    match.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const previousBackground = match.style.backgroundColor;
    const previousTransition = match.style.transition;
    match.style.transition = 'background-color 0.3s ease';
    match.style.backgroundColor = '#FDE9D9';
    setTimeout(() => {
      match.style.backgroundColor = previousBackground;
      match.style.transition = previousTransition;
    }, 1500);
  };

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

  const openCreate = async () => {
    setEditingTrip(null);
    setModalSearch('');
    setModalSearchNoMatch(false);
    // Pre-fill trip_founder from the shared "Meet the Founder" data (now its
    // own admin tab/site_content key, see src/admin/AdminFounder.tsx) so the
    // admin doesn't have to re-enter the same photo/name/bio for every trip.
    let preFilledFounder: TripFounder = emptyFounder;
    try {
      const founder = await getSiteContent<Partial<FounderContent>>('founder');
      if (founder) {
        const { photo = '', name = '', designation = '', description = '' } = founder;
        if (photo || name || description) {
          preFilledFounder = { photo, name, designation, description };
        }
      }
    } catch {
      // silently fall back to empty founder
    }
    const initialForm = { ...emptyForm, trip_founder: preFilledFounder };
    setForm(initialForm);
    initialModalUrlsRef.current = collectTripFormUrls(initialForm);
    setModalOpen(true);
  };

  const openEdit = (trip: UpcomingTrip) => {
    setEditingTrip(trip);
    const editForm: TripForm = {
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
      strike_through_price: trip.strike_through_price ?? '',
      advance_amount: trip.advance_amount ?? '',
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
      trip_founder: trip.trip_founder || emptyFounder,
      confidence_items: trip.confidence_items || [],
      confidence_description: trip.confidence_description || '',
      meeting_address: trip.meeting_address || '',
      end_banner: trip.end_banner || emptyEndBanner,
    };
    setForm(editForm);
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
    try {
      setSaving(true);
      const data = {
        ...form,
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
        strike_through_price: form.strike_through_price === '' ? null : form.strike_through_price,
        advance_amount: form.advance_amount === '' ? null : form.advance_amount,
        trip_type: form.trip_type === '' ? null : form.trip_type,
        min_age: form.min_age === '' ? null : form.min_age,
        max_age: form.max_age === '' ? null : form.max_age,
        seats_booked: Math.max(0, Math.min(form.seats_booked, form.total_seats)),
      };
      if (editingTrip) {
        await updateUpcomingTrip(editingTrip.id, data);
      } else {
        await createUpcomingTrip(data);
      }
      // All uploads are now committed to the DB — nothing to clean up on close.
      initialModalUrlsRef.current = new Set();
      setModalOpen(false);
      load();
    } catch {
      alert('Failed to save trip.');
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

  // Reads a filled-in export template (produced by handleExportTemplate,
  // optionally filled in) and populates the Add Trip form so the admin only
  // has to review/adjust and upload photos before saving.
  const handleImportFile = async (file: File) => {
    try {
      const raw = JSON.parse(await file.text());
      const imported = parseImportedTripForm(raw);
      setEditingTrip(null);
      setForm(imported);
      initialModalUrlsRef.current = collectTripFormUrls(imported);
      setModalOpen(true);
    } catch {
      await alert({
        title: 'Import failed',
        message: 'That file could not be read as a valid trip template. Make sure it is the JSON file produced by Export Template (optionally filled in) and try again.',
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
    modalSearch, setModalSearch, modalSearchNoMatch, modalBodyRef,
    editingTrip, form, setForm, saving, handleSave,
    commitGroupBulletDraft,
    importInputRef, handleImportInputChange,
    handleExportTemplate,
  };
}
