import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Plus, Edit2, Trash2, Eye, EyeOff, Download, Upload, Search, ClipboardList, X } from 'lucide-react';
import AdminLayout from './AdminLayout';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Tabs, { TabPanel } from '../components/ui/Tabs';
import ImageUploadField from '../components/ui/ImageUploadField';
import MultiImageUploadField from '../components/ui/MultiImageUploadField';
import CoverImageCropEditor from '../components/ui/CoverImageCropEditor';
import TagListEditor from '../components/ui/TagListEditor';
import ItineraryEditor from '../components/ui/ItineraryEditor';
import FAQEditor from '../components/ui/FAQEditor';
import CancellationPolicyEditor from '../components/ui/CancellationPolicyEditor';
import TermsEditor from '../components/ui/TermsEditor';
import CancellationPolicyDisplay from '../components/ui/CancellationPolicyDisplay';
import DatePicker from '../components/ui/DatePicker';
import TripHighlightIconPicker from '../components/ui/TripHighlightIconPicker';
import TripHighlightIconDisplay from '../components/ui/TripHighlightIconDisplay';
import { getAllUpcomingTripsAdmin, createUpcomingTrip, updateUpcomingTrip, deleteUpcomingTrip, COVER_IMAGE_TARGET_SIZE_BYTES } from '../services/api';

import { useConfirm } from '../components/ui/ConfirmDialog';
import { useAlert } from '../components/ui/AlertDialog';
import type {
  UpcomingTrip, ItineraryDay, FAQ, CancellationPolicy,
  TripHighlightCard, TripInclusionItem, TripIncludedGroup, TripGalleryItem,
  TripFounder, TripConfidenceItem, TripEndBanner, CoverImageCrop,
} from '../types/types-index';
import { formatDate, slugify, formatAgeRange } from '../utils/utils-index';

// Computes a "X Days / Y Nights" string from two yyyy-mm-dd date strings.
// Falls back to '' if either date is missing/invalid, and never returns a negative duration.
const computeDuration = (startDate: string, endDate: string): string => {
  if (!startDate || !endDate) return '';
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return '';
  const msPerDay = 1000 * 60 * 60 * 24;
  const nights = Math.round((end.getTime() - start.getTime()) / msPerDay);
  if (nights < 0) return '';
  const days = nights + 1;
  return `${days} Day${days !== 1 ? 's' : ''} / ${nights} Night${nights !== 1 ? 's' : ''}`;
};
import { DEFAULT_TERMS_AND_CONDITIONS } from '../constants/terms';
import { DEFAULT_CANCELLATION_POLICY } from '../constants/cancellationPolicy';
import { parseTerms } from '../utils/parseTerms';
import TermsBlocks from '../components/ui/TermsBlocks';

interface TripForm {
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  duration: string;
  description: string;
  itinerary: ItineraryDay[];
  not_included: string[];
  meeting_point: string;
  meeting_point_map_url: string;
  meeting_time: string;
  meeting_terminal: string;
  meeting_details: string;
  faqs: FAQ[];
  total_seats: number;
  seats_booked: number;
  // Optional age eligibility range. Blank ('') means no restriction on
  // that side — see the DB check constraints in add_trip_age_range.sql.
  min_age: number | '';
  max_age: number | '';
  price: number | '';
  early_bird_price: number | '';
  early_bird_deadline: string;
  strike_through_price: number | '';
  // '' means "not set" (stored as null) — see UpcomingTrip.trip_type in
  // types-index.ts for why this matters to the DB's refund logic.
  trip_type: 'domestic' | 'international' | '';
  cover_image: string;
  // Saved position/zoom for cover_image (see CoverImageCrop in
  // types-index.ts). null means "no crop saved" — every layout falls back
  // to its plain centered object-cover, so existing trips are unaffected.
  cover_image_crop: CoverImageCrop | null;
  // Separately-uploaded image for the Mobile Hero banner (see
  // hero_mobile_image in types-index.ts). '' means "not set" — falls
  // back to the cropped cover_image on mobile.
  hero_mobile_image: string;
  gallery_images: string[];
  terms_and_conditions: string;
  cancellation_policy: CancellationPolicy;
  is_published: boolean;
  // ── Extended content blocks ──────────────────────────────────────────
  highlight_cards: TripHighlightCard[];
  accommodation_description: string;
  accommodation_photos: string[];
  included_items: TripInclusionItem[];
  included_groups: TripIncludedGroup[];
  not_included_items: TripInclusionItem[];
  gallery_items: TripGalleryItem[];
  gallery_description: string;
  fashion_photos: string[];
  fashion_description: string;
  things_to_carry_items: TripInclusionItem[];
  trip_founder: TripFounder;
  confidence_items: TripConfidenceItem[];
  confidence_description: string;
  meeting_address: string;
  end_banner: TripEndBanner;
}

const emptyFounder: TripFounder = { photo: '', name: '', description: '' };
const emptyEndBanner: TripEndBanner = { image: '', heading: '', description: '', cta_label: '', cta_url: '' };

const emptyForm: TripForm = {
  title: '', destination: '', start_date: '', end_date: '', duration: '',
  description: '', itinerary: [], not_included: [],
  meeting_point: '', meeting_point_map_url: '',
  meeting_time: '', meeting_terminal: '', meeting_details: '', faqs: [], total_seats: 15, seats_booked: 0,
  min_age: '', max_age: '', price: '',
  early_bird_price: '', early_bird_deadline: '', strike_through_price: '', trip_type: '',
  cover_image: '', cover_image_crop: null, hero_mobile_image: '', gallery_images: [], terms_and_conditions: DEFAULT_TERMS_AND_CONDITIONS,
  cancellation_policy: DEFAULT_CANCELLATION_POLICY, is_published: false,
  // Extended
  highlight_cards: [], accommodation_description: '', accommodation_photos: [],
  included_items: [], included_groups: [], not_included_items: [], gallery_items: [], gallery_description: "Views worth every post. Memories worth even more.",
  fashion_photos: [], fashion_description: 'Styles that speaks, moments that stay.', things_to_carry_items: [],
  trip_founder: emptyFounder, confidence_items: [], confidence_description: 'We take care of Everything, so you can Enjoy Every Moment!',
  meeting_address: '', end_banner: emptyEndBanner,
};

export default function AdminTrips() {
  const confirm = useConfirm();
  const alert = useAlert();
  const [trips, setTrips] = useState<UpcomingTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalSearch, setModalSearch] = useState('');
  const [modalSearchNoMatch, setModalSearchNoMatch] = useState(false);
  const modalBodyRef = useRef<HTMLDivElement>(null);
  const [editingTrip, setEditingTrip] = useState<UpcomingTrip | null>(null);
  const [viewingTrip, setViewingTrip] = useState<UpcomingTrip | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<TripForm>(emptyForm);
  const importInputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    getAllUpcomingTripsAdmin().then(setTrips).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

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

  const openCreate = () => {
    setEditingTrip(null);
    setForm(emptyForm);
    setModalSearch('');
    setModalSearchNoMatch(false);
    setModalOpen(true);
  };

  // Builds and downloads a blank, annotated JSON template mirroring every
  // field on the Add Trip form. Meant to be handed to an external tool
  // (e.g. ChatGPT, given trip photos) to fill in trip details, which the
  // admin can then copy back into the Add Trip form by hand. This is an
  // export-only helper — nothing here is read back into the app.
  const handleExportTemplate = () => {
    const template = {
      _instructions:
        'This is a blank template of the ULAA "Add Trip" admin form. Fill in every field ' +
        'with trip details (use the provided trip photos/notes as source material). ' +
        'Keep the JSON structure and key names exactly as-is — only replace the placeholder ' +
        'values. Leave a field as an empty string "" if there is truly nothing to fill in. ' +
        'Fields marked "(leave blank — uploaded manually)" are image uploads and cannot be ' +
        'filled from this template; leave those as empty strings, the admin will upload the ' +
        'actual photos in the app after pasting the rest of this back in.',
      title: '<Trip title, e.g. "Spiti Valley Winter Expedition">',
      destination: '<Destination, e.g. "Spiti, Himachal Pradesh">',
      start_date: '<Start date, format YYYY-MM-DD>',
      end_date: '<End date, format YYYY-MM-DD>',
      duration: '(auto-computed from start_date/end_date — leave blank)',
      description: '<Short 2-4 sentence overview. Day-by-day plan goes in itinerary below, not here>',
      min_age: '<Minimum eligible age as a number, or "" for no restriction>',
      max_age: '<Maximum eligible age as a number, or "" for no restriction>',
      itinerary: [
        {
          day: 1,
          title: '<Short title for this day, e.g. "Arrival & Local Exploration">',
          description: '<What happens this day>',
          images: ['(leave blank — uploaded manually)'],
          icon: '<Optional icon-library key for this day\'s theme, e.g. "palmtree", "coffee", "paw-print", "mountain" — leave "" to just show the day number>',
          bullets: ['<Optional bulleted sub-item for this day, e.g. "Guided trek to the viewpoint">'],
        },
      ],
      not_included: ['<Short line item of what is NOT included, e.g. "Flights to base city">'],
      meeting_point: '<Free-text meeting point label, e.g. "Delhi Airport Terminal 3">',
      meeting_point_map_url: '<Google Maps link for the meeting point, or "">',
      meeting_time: '<Meeting time, e.g. "6:00 AM">',
      meeting_terminal: '<Terminal/gate/landmark detail, or "">',
      meeting_address: '<Full street address of the meeting point, or "">',
      meeting_details: '<Any extra logistics notes for the meeting point, or "">',
      faqs: [
        { question: '<Frequently asked question>', answer: '<Answer>' },
      ],
      total_seats: '<Total number of seats as a number, e.g. 15>',
      seats_booked: 0,
      price: '<Regular price per person in INR as a number>',
      early_bird_price: '<Early bird price per person in INR as a number, or "">',
      early_bird_deadline: '<Early bird deadline, format YYYY-MM-DD, or "">',
      strike_through_price: '<Optional "was ₹X" marketing price as a number, or "">',
      trip_type: '<"domestic" or "international", or "" if not set>',
      cover_image: '(leave blank — uploaded manually)',
      hero_mobile_image: '(leave blank — uploaded manually)',
      gallery_images: ['(leave blank — uploaded manually)'],
      terms_and_conditions: '(leave as default unless the trip needs custom terms)',
      cancellation_policy: {
        payment_due_days: '<Days before departure the remaining balance is due, as a number>',
        tiers: [
          {
            min_days: '<Minimum days-before-departure for this tier (inclusive), or null for no lower bound>',
            max_days: '<Maximum days-before-departure for this tier (inclusive), or null for no upper bound>',
            description: '<Refund treatment for this window, e.g. "Full refund minus processing fee">',
          },
        ],
        refund_min_days: '<Fastest number of working days an approved refund is processed in>',
        refund_max_days: '<Slowest number of working days an approved refund is processed in>',
      },
      is_published: false,
      // ── Extended content blocks ──────────────────────────────────────
      highlight_cards: [
        { icon: '<emoji or short icon label>', heading: '<Short heading>', description: '<1-2 sentence description>' },
      ],
      accommodation_description: '<"Stay. Relax. Repeat." section body — describe the accommodation>',
      accommodation_photos: ['(leave blank — uploaded manually)'],
      included_items: [
        { icon: '<emoji or icon label>', description: '<Included item description>' },
      ],
      included_groups: [
        {
          icon: '<emoji or icon label>',
          heading: '<Group heading, e.g. "Premium Stay Experience">',
          bullets: ['<Bulleted sub-item under this heading, e.g. "5 Nights accommodation at carefully selected 4-star and beachfront properties">'],
        },
      ],
      not_included_items: [
        { icon: '<emoji or icon label>', description: '<Not-included item description>' },
      ],
      gallery_items: [
        { photo: '(leave blank — uploaded manually)', description: '<Caption / place name for this photo>' },
      ],
      gallery_description: '<Short intro paragraph shown below the "Places You\'ll Definitely Post" heading, or "">',
      fashion_photos: ['(leave blank — uploaded manually)'],
      fashion_description: '<Short intro paragraph shown below the "Fashion Aesthetics" heading, or "">',
      things_to_carry_items: [
        { icon: '<emoji or icon label>', description: '<Item traveller should pack, e.g. "Warm jacket">' },
      ],
      trip_founder: {
        photo: '(leave blank — uploaded manually)',
        name: '<Founder/host name for this trip>',
        description: '<Short founder bio/description for this trip>',
      },
      confidence_items: [
        { icon: '<emoji or icon label>', description: '<"Travel with Confidence" point, e.g. "24/7 support during the trip">' },
      ],
      confidence_description: '<Short intro paragraph shown below the "Travel with Confidence" heading, or "">',
      end_banner: {
        image: '(leave blank — uploaded manually)',
        heading: '<End banner heading>',
        description: '<End banner description>',
        cta_label: '<Call-to-action button text, e.g. "Book Now">',
        cta_url: '<Call-to-action link, or "">',
      },
    };

    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ulaa-add-trip-template.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Reads a filled-in export template (e.g. produced by ChatGPT from
  // handleExportTemplate's output) and populates the Add Trip form so the
  // admin only has to review/adjust and upload photos before saving —
  // instead of retyping everything by hand.
  const isPlaceholder = (v: unknown): boolean =>
    typeof v !== 'string' || v.trim() === '' || v.trim().startsWith('<') || v.trim().startsWith('(');

  const asStr = (v: unknown, fallback = ''): string => (isPlaceholder(v) ? fallback : String(v));

  const asNum = (v: unknown): number | '' => {
    if (isPlaceholder(v)) return '';
    const n = Number(v);
    return isNaN(n) ? '' : n;
  };

  const asNumOrNull = (v: unknown): number | null => {
    if (v === null || isPlaceholder(v)) return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  };

  const asStrArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter(item => !isPlaceholder(item)).map(item => String(item)) : [];

  const handleImportFile = async (file: File) => {
    try {
      const raw = JSON.parse(await file.text());
      const imported: TripForm = {
        title: asStr(raw.title),
        destination: asStr(raw.destination),
        start_date: asStr(raw.start_date),
        end_date: asStr(raw.end_date),
        duration: computeDuration(asStr(raw.start_date), asStr(raw.end_date)),
        description: asStr(raw.description),
        itinerary: Array.isArray(raw.itinerary)
          ? raw.itinerary.map((d: Record<string, unknown>, i: number) => ({
              day: asNum(d?.day) || i + 1,
              title: asStr(d?.title),
              description: asStr(d?.description),
              images: asStrArray(d?.images),
              icon: asStr(d?.icon),
              bullets: asStrArray(d?.bullets),
            }))
          : [],
        not_included: asStrArray(raw.not_included),
        meeting_point: asStr(raw.meeting_point),
        meeting_point_map_url: asStr(raw.meeting_point_map_url),
        meeting_time: asStr(raw.meeting_time),
        meeting_terminal: asStr(raw.meeting_terminal),
        meeting_details: asStr(raw.meeting_details),
        faqs: Array.isArray(raw.faqs)
          ? raw.faqs
              .filter((f: Record<string, unknown>) => !isPlaceholder(f?.question) || !isPlaceholder(f?.answer))
              .map((f: Record<string, unknown>) => ({ question: asStr(f?.question), answer: asStr(f?.answer) }))
          : [],
        total_seats: asNum(raw.total_seats) || emptyForm.total_seats,
        seats_booked: asNum(raw.seats_booked) || 0,
        min_age: asNum(raw.min_age),
        max_age: asNum(raw.max_age),
        price: asNum(raw.price),
        early_bird_price: asNum(raw.early_bird_price),
        early_bird_deadline: asStr(raw.early_bird_deadline),
        strike_through_price: asNum(raw.strike_through_price),
        trip_type: raw.trip_type === 'domestic' || raw.trip_type === 'international' ? raw.trip_type : '',
        cover_image: '',
        cover_image_crop: null,
        hero_mobile_image: '',
        gallery_images: [],
        terms_and_conditions: isPlaceholder(raw.terms_and_conditions) ? DEFAULT_TERMS_AND_CONDITIONS : raw.terms_and_conditions,
        cancellation_policy: raw.cancellation_policy ? {
          payment_due_days: asNum(raw.cancellation_policy.payment_due_days) || DEFAULT_CANCELLATION_POLICY.payment_due_days,
          tiers: Array.isArray(raw.cancellation_policy.tiers)
            ? raw.cancellation_policy.tiers.map((t: Record<string, unknown>) => ({
                min_days: asNumOrNull(t?.min_days),
                max_days: asNumOrNull(t?.max_days),
                description: asStr(t?.description),
              }))
            : DEFAULT_CANCELLATION_POLICY.tiers,
          refund_min_days: asNum(raw.cancellation_policy.refund_min_days) || DEFAULT_CANCELLATION_POLICY.refund_min_days,
          refund_max_days: asNum(raw.cancellation_policy.refund_max_days) || DEFAULT_CANCELLATION_POLICY.refund_max_days,
        } : DEFAULT_CANCELLATION_POLICY,
        is_published: false,
        highlight_cards: Array.isArray(raw.highlight_cards)
          ? raw.highlight_cards.map((c: Record<string, unknown>) => ({ icon: asStr(c?.icon), heading: asStr(c?.heading), description: asStr(c?.description) }))
          : [],
        accommodation_description: asStr(raw.accommodation_description),
        accommodation_photos: [],
        included_items: Array.isArray(raw.included_items)
          ? raw.included_items.map((c: Record<string, unknown>) => ({ icon: asStr(c?.icon), description: asStr(c?.description) }))
          : [],
        included_groups: Array.isArray(raw.included_groups)
          ? raw.included_groups.map((g: Record<string, unknown>) => ({
              icon: asStr(g?.icon),
              heading: asStr(g?.heading),
              bullets: asStrArray(g?.bullets),
            }))
          : [],
        not_included_items: Array.isArray(raw.not_included_items)
          ? raw.not_included_items.map((c: Record<string, unknown>) => ({ icon: asStr(c?.icon), description: asStr(c?.description) }))
          : [],
        gallery_items: Array.isArray(raw.gallery_items)
          ? raw.gallery_items.map((g: Record<string, unknown>) => ({ photo: '', description: asStr(g?.description) }))
          : [],
        gallery_description: asStr(raw.gallery_description),
        fashion_photos: [],
        fashion_description: asStr(raw.fashion_description),
        things_to_carry_items: Array.isArray(raw.things_to_carry_items)
          ? raw.things_to_carry_items.map((c: Record<string, unknown>) => ({ icon: asStr(c?.icon), description: asStr(c?.description) }))
          : [],
        trip_founder: raw.trip_founder
          ? { photo: '', name: asStr(raw.trip_founder.name), description: asStr(raw.trip_founder.description) }
          : emptyFounder,
        confidence_items: Array.isArray(raw.confidence_items)
          ? raw.confidence_items.map((c: Record<string, unknown>) => ({ icon: asStr(c?.icon), description: asStr(c?.description) }))
          : [],
        confidence_description: asStr(raw.confidence_description),
        meeting_address: asStr(raw.meeting_address),
        end_banner: raw.end_banner
          ? {
              image: '',
              heading: asStr(raw.end_banner.heading),
              description: asStr(raw.end_banner.description),
              cta_label: asStr(raw.end_banner.cta_label),
              cta_url: asStr(raw.end_banner.cta_url),
            }
          : emptyEndBanner,
      };
      setEditingTrip(null);
      setForm(imported);
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

  const openEdit = (trip: UpcomingTrip) => {
    setEditingTrip(trip);
    setForm({
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
      trip_type: trip.trip_type || '',
      cover_image: trip.cover_image || '',
      cover_image_crop: trip.cover_image_crop || null,
      hero_mobile_image: trip.hero_mobile_image || '',
      gallery_images: trip.gallery_images || [], is_published: trip.is_published,
      terms_and_conditions: trip.terms_and_conditions || DEFAULT_TERMS_AND_CONDITIONS,
      cancellation_policy: trip.cancellation_policy || DEFAULT_CANCELLATION_POLICY,
      // Extended
      highlight_cards: trip.highlight_cards || [],
      accommodation_description: trip.accommodation_description || '',
      accommodation_photos: trip.accommodation_photos || [],
      included_items: trip.included_items || [],
      included_groups: trip.included_groups || [],
      not_included_items: trip.not_included_items || [],
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
    });
    setModalSearch('');
    setModalSearchNoMatch(false);
    setModalOpen(true);
  };

  const handleSave = async () => {
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
        slug: slugify(form.title),
        price: form.price,
        early_bird_price: form.early_bird_price === '' ? null : form.early_bird_price,
        early_bird_deadline: form.early_bird_deadline || null,
        strike_through_price: form.strike_through_price === '' ? null : form.strike_through_price,
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
      setModalOpen(false);
      load();
    } catch {
      alert('Failed to save trip.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Delete this trip?',
      message: 'This cannot be undone.',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    await deleteUpcomingTrip(id);
    load();
  };

  const togglePublish = async (trip: UpcomingTrip) => {
    await updateUpcomingTrip(trip.id, { is_published: !trip.is_published });
    load();
  };

  const inputClass = `w-full px-3 py-2 rounded-md border-2 border-background-warm bg-background font-body text-dark text-sm focus:border-primary outline-none transition-colors`;
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
  const publishedCount = trips.filter(t => t.is_published).length;
  const draftCount = trips.length - publishedCount;

  return (
    <AdminLayout title="Upcoming Trips">
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button variant="primary" size="sm" onClick={openCreate}>
              <Plus size={16} /> Add Trip
            </Button>
          </div>
          <div className="flex items-center">
            <p className="flex items-center gap-2 text-dark-muted text-sm">
              <ClipboardList size={20} className="text-primary flex-shrink-0" />
              <span className="font-semibold text-green-700">{publishedCount}</span> Published
              <span className="text-dark-muted/50">•</span>
              <span className="font-semibold text-dark">{draftCount}</span> Draft
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleImportInputChange}
            />
            <button onClick={() => importInputRef.current?.click()} className="p-2 rounded-md border-2 border-primary/30 text-primary hover:bg-primary/5 transition-colors" title="Import Template">
              <Upload size={16} />
            </button>
            <button onClick={handleExportTemplate} className="p-2 rounded-md border-2 border-primary/30 text-primary hover:bg-primary/5 transition-colors" title="Export Template">
              <Download size={16} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-dark-muted">Loading...</div>
        ) : trips.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-lg shadow-card">
            <p className="font-display text-xl text-dark-muted mb-4">No trips yet.</p>
            <Button variant="primary" onClick={openCreate}><Plus size={16} /> Add Your First Trip</Button>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-card overflow-hidden">
            <div className="overflow-x-auto scrollbar-hide">
              <table className="w-full text-sm">
                <thead className="bg-background-warm text-dark font-medium">
                  <tr>
                    <th className="px-4 py-3 text-left">Trip</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell">Destination</th>
                    <th className="px-4 py-3 text-left hidden lg:table-cell">Date</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell">Seats</th>
                    <th className="px-2 py-3 text-center whitespace-nowrap">Status</th>
                    <th className="px-3 py-3 text-right whitespace-nowrap w-[112px] sm:w-auto">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-background-warm">
                  {trips.map(trip => (
                    <motion.tr key={trip.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-background/50">
                      <td className="px-4 py-3 font-medium text-dark truncate max-w-[150px] sm:max-w-none">
                        <button
                          onClick={() => setViewingTrip(trip)}
                          className="text-left hover:text-primary hover:underline underline-offset-2 truncate"
                          title="View details"
                        >
                          {trip.title}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-dark-muted hidden md:table-cell truncate">{trip.destination}</td>
                      <td className="px-4 py-3 text-dark-muted hidden lg:table-cell whitespace-nowrap">{formatDate(trip.start_date, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      <td className="px-4 py-3 text-dark-muted hidden md:table-cell whitespace-nowrap">
                        {trip.seats_booked}/{trip.total_seats}
                        <span className="text-xs text-dark-muted/70 ml-1">
                          ({Math.max(0, trip.total_seats - trip.seats_booked)} left)
                        </span>
                      </td>
                      <td className="px-2 py-3 text-center">
                        <span className={`inline-block text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap ${trip.is_published ? 'bg-green-100 text-green-700' : 'bg-background-warm text-dark-muted'}`}>
                          {trip.is_published ? 'Published' : 'Draft'}
                        </span>
                      </td>
                      <td className="pl-2 pr-2 sm:pl-4 sm:pr-3 py-3 whitespace-nowrap">
                        <div className="flex items-center justify-end gap-0.5 sm:gap-1.5">
                          <button onClick={() => togglePublish(trip)} className="flex-shrink-0 p-2 sm:p-1.5 rounded hover:bg-background active:bg-background text-dark-muted hover:text-primary transition-colors" title={trip.is_published ? 'Unpublish' : 'Publish'}>
                            {trip.is_published ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                          <button onClick={() => openEdit(trip)} className="flex-shrink-0 p-2 sm:p-1.5 rounded hover:bg-background active:bg-background text-dark-muted hover:text-primary transition-colors" title="Edit">
                            <Edit2 size={15} />
                          </button>
                          <button onClick={() => handleDelete(trip.id)} className="flex-shrink-0 p-2 sm:p-1.5 rounded hover:bg-red-50 active:bg-red-50 text-dark-muted hover:text-red-600 transition-colors" title="Delete">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>


      {/* Create/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingTrip ? 'Edit Trip' : 'Add Trip'}
        size="xl"
        headerContent={
          <div className="relative w-full max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-muted pointer-events-none" />
            <input
              type="text"
              value={modalSearch}
              onChange={e => setModalSearch(e.target.value)}
              placeholder="Search fields (e.g. meeting point, pricing, media)..."
              className="w-full pl-9 pr-3 py-2 rounded-md border-2 border-background-warm bg-background font-body text-dark text-sm focus:border-primary outline-none transition-colors"
            />
          </div>
        }
        footer={
          <div className="flex gap-3">
            <Button variant="outline" size="md" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button variant="primary" size="md" onClick={handleSave} loading={saving}>
              {editingTrip ? 'Save Changes' : 'Create Trip'}
            </Button>
          </div>
        }
      >
        {modalSearchNoMatch && (
          <p className="text-xs text-red-500 -mt-2 mb-3">No matching field found for "{modalSearch}".</p>
        )}
        <div ref={modalBodyRef}>
          <Tabs>
          <TabPanel label="Basic Info">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-dark mb-1">Trip Title *</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={inputClass} placeholder="e.g. Spiti Valley Winter Expedition" />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark mb-1">Destination *</label>
              <input value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} className={inputClass} placeholder="e.g. Spiti, Himachal Pradesh" />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark mb-1">Duration *</label>
              <input
                value={form.duration}
                readOnly
                className={`${inputClass} bg-background-warm/60 cursor-not-allowed`}
                placeholder="Auto-filled from Start/End Date"
              />
              <p className="text-xs text-dark-muted mt-1">Calculated automatically from the Start and End Date fields.</p>
            </div>
            <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-dark mb-1">Start Date *</label>
                <DatePicker
                  value={form.start_date}
                  onChange={start_date => setForm(f => ({ ...f, start_date, duration: computeDuration(start_date, f.end_date) || f.duration }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark mb-1">End Date *</label>
                <DatePicker
                  value={form.end_date}
                  onChange={end_date => setForm(f => ({ ...f, end_date, duration: computeDuration(f.start_date, end_date) || f.duration }))}
                  min={form.start_date || undefined}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark mb-1">Min Age</label>
                <input
                  type="number"
                  min={0}
                  value={form.min_age}
                  onChange={e => setForm(f => ({ ...f, min_age: e.target.value === '' ? '' : +e.target.value }))}
                  className={inputClass}
                  placeholder="e.g. 18 (optional)"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark mb-1">Max Age</label>
                <input
                  type="number"
                  min={0}
                  value={form.max_age}
                  onChange={e => setForm(f => ({ ...f, max_age: e.target.value === '' ? '' : +e.target.value }))}
                  className={inputClass}
                  placeholder="e.g. 65 (optional)"
                />
              </div>
              <p className="col-span-2 md:col-span-4 text-xs text-dark-muted -mt-2">
                Default: 18–65 years. Leave blank for no restriction.
              </p>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-dark mb-1">Description *</label>
              <p className="text-xs text-dark-muted mb-1">Short overview only — put the day-by-day plan in Itinerary below, not here.</p>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} className={`${inputClass} resize-none`} />
            </div>
          </TabPanel>
          <TabPanel label="Pricing & Availability">
            <div className="md:col-span-2 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-dark mb-1">Total Seats</label>
                <input type="number" min={0} value={form.total_seats} onChange={e => setForm(f => ({ ...f, total_seats: +e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark mb-1">Seats Filled</label>
                <input
                  type="number"
                  min={0}
                  max={form.total_seats}
                  value={form.seats_booked}
                  onChange={e => setForm(f => ({ ...f, seats_booked: Math.max(0, Math.min(+e.target.value, f.total_seats)) }))}
                  className={inputClass}
                />
                <p className="text-xs text-dark-muted mt-1">
                  {Math.max(0, form.total_seats - form.seats_booked)} of {form.total_seats} seats left
                </p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-dark mb-1">Regular Price per person (₹) *</label>
              <input
                type="number"
                value={form.price}
                onChange={e => setForm(f => ({ ...f, price: e.target.value === '' ? '' : +e.target.value }))}
                className={inputClass}
                placeholder="e.g. 42999"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark mb-1">Strikeout Price per person (₹)</label>
              <input
                type="number"
                value={form.strike_through_price}
                onChange={e => setForm(f => ({ ...f, strike_through_price: e.target.value === '' ? '' : +e.target.value }))}
                className={inputClass}
                placeholder="e.g. 49999 (optional)"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark mb-1">Early-Bird Price per person (₹)</label>
              <input
                type="number"
                value={form.early_bird_price}
                onChange={e => setForm(f => ({ ...f, early_bird_price: e.target.value === '' ? '' : +e.target.value }))}
                className={inputClass}
                placeholder="e.g. 39999 (optional)"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark mb-1">Trip Type</label>
              <select
                value={form.trip_type}
                onChange={e => setForm(f => ({ ...f, trip_type: e.target.value as TripForm['trip_type'] }))}
                className={inputClass}
              >
                <option value="">Not set</option>
                <option value="domestic">Domestic</option>
                <option value="international">International</option>
              </select>
              <p className="text-xs text-dark-muted mt-1">Used to auto-fill the correct cancellation-window rules on bookings for this trip.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-dark mb-1">Early-Bird Deadline</label>
              <DatePicker
                value={form.early_bird_deadline}
                onChange={early_bird_deadline => setForm(f => ({ ...f, early_bird_deadline }))}
              />
              <p className="text-xs text-dark-muted mt-1">The early-bird price shows automatically until this date, then the page switches to the regular price on its own.</p>
            </div>
          </TabPanel>
          <TabPanel label="Media">
            <div className="md:col-span-2 space-y-3">
              <ImageUploadField
                label="Cover Image"
                value={form.cover_image}
                // A new/replaced image invalidates any saved position — the
                // old focal point/zoom was framed for a different photo —
                // so it resets to null (falls back to centered, no zoom)
                // rather than silently misapplying to the new one.
                onChange={url => setForm(f => ({ ...f, cover_image: url, cover_image_crop: null }))}
                bucket="ulaa"
                pathPrefix="trip-covers"
                fileNamePrefix={editingTrip ? editingTrip.slug : (slugify(form.title) || undefined)}
                maxSizeBytes={COVER_IMAGE_TARGET_SIZE_BYTES}
                hint="Landscape, at least 1600×1200px, with the main subject centered — this same photo is reused for the trip card and desktop hero, so you'll reposition/zoom it for each after uploading. The mobile hero uses its own separate image, uploaded below."
                allowUrl
              />
              {form.cover_image && (
                <CoverImageCropEditor
                  imageUrl={form.cover_image}
                  value={form.cover_image_crop}
                  onChange={cover_image_crop => setForm(f => ({ ...f, cover_image_crop }))}
                />
              )}
              <ImageUploadField
                label="Hero Banner Image (Mobile)"
                value={form.hero_mobile_image}
                onChange={url => setForm(f => ({ ...f, hero_mobile_image: url }))}
                bucket="ulaa"
                pathPrefix="trip-covers/hero-mobile"
                fileNamePrefix={editingTrip ? editingTrip.slug : (slugify(form.title) || undefined)}
                maxSizeBytes={COVER_IMAGE_TARGET_SIZE_BYTES}
                hint="Tall portrait, 9:16 ratio, at least 1080×1920px — fills the full-height banner on phone screens edge to edge, in place of the cropped cover image. Optional: falls back to the Cover Image (repositioned above) if left empty."
                allowUrl
              />
            </div>

            {/* Places You'll Post — gallery with captions */}
            <div className="md:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-semibold text-dark">Places You'll Definitely Post</label>
                <button type="button" onClick={() => setForm(f => ({ ...f, gallery_items: [...f.gallery_items, { photo: '', description: '' }] }))} className="flex items-center gap-1 text-xs font-medium text-primary border border-primary rounded-md px-2.5 py-1.5 hover:bg-primary/5 transition-colors"><Plus size={13} /> Add Item</button>
              </div>
              <div>
                <label className="block text-sm font-medium text-dark mb-1">Section Description</label>
                <textarea
                  value={form.gallery_description}
                  onChange={e => setForm(f => ({ ...f, gallery_description: e.target.value }))}
                  rows={2}
                  className={`${inputClass} resize-none`}
                  placeholder="Short intro paragraph shown below the &quot;Places You'll Definitely Post&quot; heading..."
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {form.gallery_items.map((item, i) => (
                  <div key={i} className="border border-background-warm rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-dark-muted uppercase tracking-wide">Photo {i + 1}</span>
                      <button type="button" onClick={() => setForm(f => ({ ...f, gallery_items: f.gallery_items.filter((_, idx) => idx !== i) }))} className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"><Trash2 size={13} /></button>
                    </div>
                    <ImageUploadField
                      label=""
                      value={item.photo}
                      onChange={url => setForm(f => ({ ...f, gallery_items: f.gallery_items.map((it, idx) => idx === i ? { ...it, photo: url } : it) }))}
                      bucket="ulaa"
                      pathPrefix={`trips/${editingTrip ? editingTrip.slug : (slugify(form.title) || 'new-trip')}/gallery`}
                      hint="4:3 landscape works best (e.g. 1200×900px) — shown in a cropped carousel tile."
                      aspectRatio="3/2"
                      allowUrl
                    />
                    <div>
                      <label className="block text-xs font-medium text-dark mb-1">Caption / Place Name</label>
                      <input value={item.description} onChange={e => setForm(f => ({ ...f, gallery_items: f.gallery_items.map((it, idx) => idx === i ? { ...it, description: e.target.value } : it) }))} className={inputClass} placeholder="e.g. Chandratal Lake at dawn" />
                    </div>
                  </div>
                ))}
              </div>
              {form.gallery_items.length === 0 && <p className="text-xs text-dark-muted">No gallery items yet.</p>}
            </div>

            {/* Fashion Aesthetics */}
            <div className="md:col-span-2">
              <MultiImageUploadField
                label="Fashion Aesthetics (outfit inspiration photos)"
                value={form.fashion_photos}
                onChange={urls => setForm(f => ({ ...f, fashion_photos: urls }))}
                bucket="ulaa"
                pathPrefix={`trips/${editingTrip ? editingTrip.slug : (slugify(form.title) || 'new-trip')}/fashion`}
                hint="Shown uncropped in a masonry grid, so portrait, landscape, or square all work — just keep each photo at least 800px on its shortest side."
                allowUrl
              >
                <label className="block text-sm font-medium text-dark mb-1">Section Description</label>
                <textarea
                  value={form.fashion_description}
                  onChange={e => setForm(f => ({ ...f, fashion_description: e.target.value }))}
                  rows={2}
                  className={`${inputClass} resize-none`}
                  placeholder="Short intro paragraph shown below the &quot;Fashion Aesthetics&quot; heading..."
                />
              </MultiImageUploadField>
            </div>
          </TabPanel>
          <TabPanel label="Overview & Itinerary">
            {/* Rich Highlight Cards */}
            <div className="md:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-semibold text-dark">Why You'll Love This Trip</label>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, highlight_cards: [...f.highlight_cards, { icon: '', heading: '', description: '' }] }))}
                  className="flex items-center gap-1 text-xs font-medium text-primary border border-primary rounded-md px-2.5 py-1.5 hover:bg-primary/5 transition-colors"
                >
                  <Plus size={13} /> Add Card
                </button>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                {form.highlight_cards.map((card, i) => (
                  <div key={i} className="border border-background-warm rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-dark-muted uppercase tracking-wide">Card {i + 1}</span>
                      <button type="button" onClick={() => setForm(f => ({ ...f, highlight_cards: f.highlight_cards.filter((_, idx) => idx !== i) }))} className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"><Trash2 size={13} /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-dark mb-1">Icon</label>
                        <TripHighlightIconPicker
                          value={card.icon}
                          hintText={card.heading}
                          onChange={key => setForm(f => ({ ...f, highlight_cards: f.highlight_cards.map((c, idx) => idx === i ? { ...c, icon: key } : c) }))}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-dark mb-1">Heading</label>
                        <input value={card.heading} onChange={e => setForm(f => ({ ...f, highlight_cards: f.highlight_cards.map((c, idx) => idx === i ? { ...c, heading: e.target.value } : c) }))} className={inputClass} placeholder="e.g. Dreamy Beaches" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-dark mb-1">Description</label>
                      <textarea value={card.description} onChange={e => setForm(f => ({ ...f, highlight_cards: f.highlight_cards.map((c, idx) => idx === i ? { ...c, description: e.target.value } : c) }))} rows={2} className={`${inputClass} resize-none`} />
                    </div>
                  </div>
                ))}
              </div>
              {form.highlight_cards.length === 0 && (
                <p className="text-xs text-dark-muted">No highlight cards yet. Click "Add Card" to begin.</p>
              )}
            </div>

            <div className="md:col-span-2">
              <ItineraryEditor
                value={form.itinerary}
                onChange={days => setForm(f => ({ ...f, itinerary: days }))}
                tripSlug={editingTrip ? editingTrip.slug : (slugify(form.title) || 'new-trip')}
              />
            </div>
          </TabPanel>
          <TabPanel label="Inclusions & Prep">
            {/* Grouped What's Included — heading + bulleted sub-items (e.g. "Premium Stay Experience") */}
            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-dark">What's Included</label>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, included_groups: [...f.included_groups, { icon: '', heading: '', bullets: [] }] }))}
                  className="flex items-center gap-1 text-xs font-button font-semibold text-primary hover:text-primary/80 transition-colors"
                >
                  <Plus size={14} /> Add Group
                </button>
              </div>
              <p className="text-xs text-dark-muted mb-3">Shown instead of the icon grid above when at least one group is added, e.g. a "Premium Stay Experience" heading with bulleted details below it.</p>
              <div className="space-y-3">
              {form.included_groups.map((group, gi) => (
                <div key={gi} className="border border-background-warm rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-dark-muted uppercase tracking-wide">Group {gi + 1}</span>
                    <button type="button" onClick={() => setForm(f => ({ ...f, included_groups: f.included_groups.filter((_, idx) => idx !== gi) }))} className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"><Trash2 size={13} /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-dark mb-1">Icon</label>
                      <TripHighlightIconPicker
                        value={group.icon}
                        hintText={group.heading}
                        onChange={key => setForm(f => ({ ...f, included_groups: f.included_groups.map((g, idx) => idx === gi ? { ...g, icon: key } : g) }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-dark mb-1">Heading</label>
                      <input value={group.heading} onChange={e => setForm(f => ({ ...f, included_groups: f.included_groups.map((g, idx) => idx === gi ? { ...g, heading: e.target.value } : g) }))} className={inputClass} placeholder="e.g. Premium Stay Experience" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-dark mb-1">Bullet Points</label>
                    <textarea
                      placeholder="Paste bullet points here — one per line or paragraph. Press Enter or click away to add."
                      rows={2}
                      className={`${inputClass} resize-none`}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          commitGroupBulletDraft(gi, e.currentTarget);
                        }
                      }}
                      onBlur={e => commitGroupBulletDraft(gi, e.currentTarget)}
                      onPaste={e => {
                        const text = e.clipboardData.getData('text');
                        const lines = text.split(/\r?\n\s*\n|\r?\n/).map(l => l.trim()).filter(Boolean);
                        if (lines.length > 1) {
                          e.preventDefault();
                          setForm(f => ({ ...f, included_groups: f.included_groups.map((g, idx) => idx === gi ? { ...g, bullets: [...g.bullets, ...lines] } : g) }));
                          e.currentTarget.value = '';
                        }
                      }}
                    />
                    <p className="text-[11px] text-dark-muted mt-1">Paste a list — each line or paragraph automatically becomes its own bullet below.</p>
                    {group.bullets.length > 0 && (
                      <ul className="space-y-2 mt-2">
                        {group.bullets.map((bullet, bi) => (
                          <li key={bi} className="flex items-center gap-2 bg-background-warm rounded-lg px-3 py-2">
                            <span className="flex-1 text-sm text-dark">{bullet}</span>
                            <button
                              type="button"
                              onClick={() => setForm(f => ({ ...f, included_groups: f.included_groups.map((g, idx) => idx === gi ? { ...g, bullets: g.bullets.filter((_, i) => i !== bi) } : g) }))}
                              className="text-dark-muted hover:text-red-600 transition-colors shrink-0"
                              title="Remove"
                            >
                              <X size={15} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
              {form.included_groups.length === 0 && <p className="text-xs text-dark-muted">No groups yet. Click "Add Group" to begin.</p>}
              </div>
            </div>

            <div className="md:col-span-2">
              <TagListEditor
                label="What's Not Included"
                value={form.not_included}
                onChange={items => setForm(f => ({ ...f, not_included: items }))}
                placeholder="e.g. Flights"
              />
            </div>
            <div className="md:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-semibold text-dark">Things to Carry</label>
                <button type="button" onClick={() => setForm(f => ({ ...f, things_to_carry_items: [...f.things_to_carry_items, { icon: '', description: '' }] }))} className="flex items-center gap-1 text-xs font-medium text-primary border border-primary rounded-md px-2.5 py-1.5 hover:bg-primary/5 transition-colors"><Plus size={13} /> Add Item</button>
              </div>
              {form.things_to_carry_items.map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-32 flex-shrink-0">
                    <TripHighlightIconPicker
                      value={item.icon}
                      hintText={item.description}
                      onChange={key => setForm(f => ({ ...f, things_to_carry_items: f.things_to_carry_items.map((it, idx) => idx === i ? { ...it, icon: key } : it) }))}
                    />
                  </div>
                  <input value={item.description} onChange={e => setForm(f => ({ ...f, things_to_carry_items: f.things_to_carry_items.map((it, idx) => idx === i ? { ...it, description: e.target.value } : it) }))} className={`${inputClass} flex-1`} placeholder="e.g. Warm jacket" />
                  <button type="button" onClick={() => setForm(f => ({ ...f, things_to_carry_items: f.things_to_carry_items.filter((_, idx) => idx !== i) }))} className="p-1.5 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"><Trash2 size={13} /></button>
                </div>
              ))}
              {form.things_to_carry_items.length === 0 && <p className="text-xs text-dark-muted">No items yet. Click "Add Item" to begin.</p>}
            </div>

            {/* Travel with Confidence */}
            <div className="md:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-semibold text-dark">Travel with Confidence</label>
                <button type="button" onClick={() => setForm(f => ({ ...f, confidence_items: [...f.confidence_items, { icon: '', description: '' }] }))} className="flex items-center gap-1 text-xs font-medium text-primary border border-primary rounded-md px-2.5 py-1.5 hover:bg-primary/5 transition-colors"><Plus size={13} /> Add Item</button>
              </div>
              <div>
                <label className="block text-sm font-medium text-dark mb-1">Section Description</label>
                <textarea
                  value={form.confidence_description}
                  onChange={e => setForm(f => ({ ...f, confidence_description: e.target.value }))}
                  rows={3}
                  className={`${inputClass} resize-none`}
                  placeholder="Short intro paragraph shown below the &quot;Travel with Confidence&quot; heading..."
                />
              </div>
              {form.confidence_items.map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-32 flex-shrink-0">
                    <TripHighlightIconPicker
                      value={item.icon}
                      hintText={item.description}
                      onChange={key => setForm(f => ({ ...f, confidence_items: f.confidence_items.map((it, idx) => idx === i ? { ...it, icon: key } : it) }))}
                    />
                  </div>
                  <input value={item.description} onChange={e => setForm(f => ({ ...f, confidence_items: f.confidence_items.map((it, idx) => idx === i ? { ...it, description: e.target.value } : it) }))} className={`${inputClass} flex-1`} placeholder="e.g. 24/7 on-ground support" />
                  <button type="button" onClick={() => setForm(f => ({ ...f, confidence_items: f.confidence_items.filter((_, idx) => idx !== i) }))} className="p-1.5 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"><Trash2 size={13} /></button>
                </div>
              ))}
              {form.confidence_items.length === 0 && <p className="text-xs text-dark-muted">No confidence items yet.</p>}
            </div>
          </TabPanel>
          <TabPanel label="Accommodation">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-dark mb-1">Section Description</label>
              <textarea
                value={form.accommodation_description}
                onChange={e => setForm(f => ({ ...f, accommodation_description: e.target.value }))}
                rows={4}
                className={`${inputClass} resize-none`}
                placeholder="Describe the accommodation experience for this trip..."
              />
            </div>
            <div className="md:col-span-2">
              <MultiImageUploadField
                label="Accommodation Photos"
                value={form.accommodation_photos}
                onChange={urls => setForm(f => ({ ...f, accommodation_photos: urls }))}
                bucket="ulaa"
                pathPrefix={`trips/${editingTrip ? editingTrip.slug : (slugify(form.title) || 'new-trip')}/accommodation`}
                hint="16:9 landscape works best (e.g. 1280×720px) — shown in cropped cards."
                allowUrl
              />
            </div>
          </TabPanel>
          <TabPanel label="Meeting Point">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-dark mb-1">Location Name</label>
              <div className="flex gap-2">
                <input
                  value={form.meeting_point}
                  onChange={e => setForm(f => ({ ...f, meeting_point: e.target.value }))}
                  className={inputClass}
                  placeholder="e.g. Shimla Bus Stand, Himachal Pradesh — 7:00 AM on Day 1"
                />
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(form.meeting_point || form.destination)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => { if (!form.meeting_point.trim() && !form.destination.trim()) e.preventDefault(); }}
                  className="shrink-0 flex items-center gap-1.5 px-3 rounded-md border-2 border-background-warm bg-background text-dark text-sm font-medium hover:border-primary hover:text-primary transition-colors whitespace-nowrap"
                  title="Opens Google Maps in a new tab, already searching for this"
                >
                  Find on Maps ↗
                </a>
              </div>
              <p className="text-xs text-dark-muted mt-1.5">Shown as plain text on the trip page.</p>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-dark mb-1">Address</label>
              <input
                value={form.meeting_address}
                onChange={e => setForm(f => ({ ...f, meeting_address: e.target.value }))}
                className={inputClass}
                placeholder="e.g. Near HRTC Bus Terminal, Cart Road, Shimla - 171001"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-dark mb-1">Meeting Point — Google Maps Link</label>
              <input
                value={form.meeting_point_map_url}
                onChange={e => setForm(f => ({ ...f, meeting_point_map_url: e.target.value }))}
                className={inputClass}
                placeholder="Paste the link here"
              />
              <p className="text-xs text-dark-muted mt-1.5">
                In the Maps tab that opened: confirm the pin is on the right spot (search again if not) → tap <span className="font-medium text-dark">Share</span> → <span className="font-medium text-dark">Copy link</span> → paste it above.
                {form.meeting_point_map_url.trim() && (
                  <>
                    {' '}
                    <a
                      href={form.meeting_point_map_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary font-medium hover:underline"
                    >
                      Open this link ↗
                    </a>
                  </>
                )}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark mb-1">Time</label>
              <input
                value={form.meeting_time}
                onChange={e => setForm(f => ({ ...f, meeting_time: e.target.value }))}
                className={inputClass}
                placeholder="e.g. 7:00 AM on Day 1"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark mb-1">Terminal</label>
              <input
                value={form.meeting_terminal}
                onChange={e => setForm(f => ({ ...f, meeting_terminal: e.target.value }))}
                className={inputClass}
                placeholder="e.g. Terminal 2, Departure Gate"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-dark mb-1">Details</label>
              <input
                value={form.meeting_details}
                onChange={e => setForm(f => ({ ...f, meeting_details: e.target.value }))}
                className={inputClass}
                placeholder="e.g. Look for the ULAA placard near the arrivals gate"
              />
              <p className="text-xs text-dark-muted mt-1.5">
                Time, Terminal, and Details are all optional — leave any of them blank and the trip page and PDF show a friendly "to be communicated" placeholder instead.
              </p>
            </div>
          </TabPanel>
          <TabPanel label="Founder">
            <div className="md:col-span-2">
              <ImageUploadField
                label="Founder Photo"
                value={form.trip_founder.photo}
                onChange={url => setForm(f => ({ ...f, trip_founder: { ...f.trip_founder, photo: url } }))}
                bucket="ulaa"
                pathPrefix="trip-founder"
                fileNamePrefix={editingTrip ? editingTrip.slug : (slugify(form.title) || undefined)}
                hint="Square, at least 400×400px, with the face centered — shown as a circular avatar."
                allowUrl
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark mb-1">Name</label>
              <input
                value={form.trip_founder.name}
                onChange={e => setForm(f => ({ ...f, trip_founder: { ...f.trip_founder, name: e.target.value } }))}
                className={inputClass}
                placeholder="e.g. Priya Sharma"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-dark mb-1">Description / About</label>
              <textarea
                value={form.trip_founder.description}
                onChange={e => setForm(f => ({ ...f, trip_founder: { ...f.trip_founder, description: e.target.value } }))}
                rows={4}
                className={`${inputClass} resize-none`}
                placeholder="A short note from the founder about this trip..."
              />
            </div>
          </TabPanel>
          <TabPanel label="End Banner">
            <div className="md:col-span-2">
              <ImageUploadField
                label="Banner Image"
                value={form.end_banner.image}
                onChange={url => setForm(f => ({ ...f, end_banner: { ...f.end_banner, image: url } }))}
                bucket="ulaa"
                pathPrefix="trip-end-banners"
                fileNamePrefix={editingTrip ? editingTrip.slug : (slugify(form.title) || undefined)}
                hint="Wide landscape, at least 1600×900px — shown full-bleed behind the closing CTA text."
                allowUrl
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-dark mb-1">Heading (left side)</label>
              <input
                value={form.end_banner.heading}
                onChange={e => setForm(f => ({ ...f, end_banner: { ...f.end_banner, heading: e.target.value } }))}
                className={inputClass}
                placeholder="e.g. Ready to Experience the Magic?"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-dark mb-1">Description</label>
              <textarea
                value={form.end_banner.description}
                onChange={e => setForm(f => ({ ...f, end_banner: { ...f.end_banner, description: e.target.value } }))}
                rows={3}
                className={`${inputClass} resize-none`}
                placeholder="A short compelling call-to-action paragraph..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark mb-1">CTA Button Label (optional)</label>
              <input
                value={form.end_banner.cta_label}
                onChange={e => setForm(f => ({ ...f, end_banner: { ...f.end_banner, cta_label: e.target.value } }))}
                className={inputClass}
                placeholder="Book Your Seat"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark mb-1">CTA URL (optional)</label>
              <input
                value={form.end_banner.cta_url}
                onChange={e => setForm(f => ({ ...f, end_banner: { ...f.end_banner, cta_url: e.target.value } }))}
                className={inputClass}
                placeholder="#booking or /trips/..."
              />
            </div>
          </TabPanel>
          <TabPanel label="Terms & Conditions">
            <div className="md:col-span-2">
              <TermsEditor
                value={form.terms_and_conditions}
                onChange={terms_and_conditions => setForm(f => ({ ...f, terms_and_conditions }))}
              />
            </div>
          </TabPanel>
          <TabPanel label="FAQs">
            <div className="md:col-span-2">
              <FAQEditor
                value={form.faqs}
                onChange={faqs => setForm(f => ({ ...f, faqs }))}
              />
            </div>
          </TabPanel>
          <TabPanel label="Cancellation Policy">
            <div className="md:col-span-2">
              <CancellationPolicyEditor
                value={form.cancellation_policy}
                onChange={cancellation_policy => setForm(f => ({ ...f, cancellation_policy }))}
              />
            </div>
          </TabPanel>
          <TabPanel label="Publish">
            <div className="md:col-span-2 flex items-center gap-3">
              <input type="checkbox" id="is_published" checked={form.is_published} onChange={e => setForm(f => ({ ...f, is_published: e.target.checked }))} className="w-4 h-4 accent-primary" />
              <label htmlFor="is_published" className="text-sm font-medium text-dark">Publish immediately</label>
            </div>
          </TabPanel>
        </Tabs>
        </div>
      </Modal>

      {/* View-only details popup — no editable fields, just a clean read-out */}
      <Modal isOpen={!!viewingTrip} onClose={() => setViewingTrip(null)} title={viewingTrip?.title || 'Trip Details'} size="lg">
        {viewingTrip && (
          <div className="space-y-5">
            {viewingTrip.cover_image && (
              <img src={viewingTrip.cover_image} alt={viewingTrip.title} className="w-full h-48 object-cover rounded-md" />
            )}
            {viewingTrip.hero_mobile_image && (
              <div>
                <p className="text-xs font-medium text-dark-muted mb-1">Mobile Hero Banner</p>
                <img src={viewingTrip.hero_mobile_image} alt="" className="w-28 h-40 object-cover rounded-md" />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap ${viewingTrip.is_published ? 'bg-green-100 text-green-700' : 'bg-background-warm text-dark-muted'}`}>
                {viewingTrip.is_published ? 'Published' : 'Draft'}
              </span>
              <span className="text-xs font-button font-semibold px-2 py-1 rounded-md whitespace-nowrap bg-background-warm text-dark-muted">
                {viewingTrip.seats_booked}/{viewingTrip.total_seats} seats booked
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs font-medium text-dark-muted mb-0.5">Destination</p>
                <p className="text-dark">{viewingTrip.destination}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-dark-muted mb-0.5">Duration</p>
                <p className="text-dark">{viewingTrip.duration}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-dark-muted mb-0.5">Age Range</p>
                <p className="text-dark">
                  {viewingTrip.min_age != null || viewingTrip.max_age != null
                    ? formatAgeRange(viewingTrip.min_age, viewingTrip.max_age)
                    : 'No restriction (default 18–65)'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-dark-muted mb-0.5">Dates</p>
                <p className="text-dark">
                  {formatDate(viewingTrip.start_date, { day: 'numeric', month: 'short', year: 'numeric' })}
                  {' – '}
                  {formatDate(viewingTrip.end_date, { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-dark-muted mb-0.5">Price</p>
                <p className="text-dark">
                  {viewingTrip.price ? `₹${viewingTrip.price.toLocaleString('en-IN')}` : '—'}
                  {viewingTrip.early_bird_price ? ` (Early-bird ₹${viewingTrip.early_bird_price.toLocaleString('en-IN')})` : ''}
                  {viewingTrip.strike_through_price ? ` — strikeout ₹${viewingTrip.strike_through_price.toLocaleString('en-IN')}` : ''}
                </p>
              </div>
              {viewingTrip.meeting_point && (
                <div className="col-span-2">
                  <p className="text-xs font-medium text-dark-muted mb-0.5">Meeting Point</p>
                  <p className="text-dark">{viewingTrip.meeting_point}</p>
                  {viewingTrip.meeting_address && (
                    <p className="text-dark-muted text-sm mt-0.5">{viewingTrip.meeting_address}</p>
                  )}
                  {(viewingTrip.meeting_time || viewingTrip.meeting_terminal || viewingTrip.meeting_details) && (
                    <p className="text-dark-muted text-sm mt-1">
                      {[
                        viewingTrip.meeting_time && `Time: ${viewingTrip.meeting_time}`,
                        viewingTrip.meeting_terminal && `Terminal: ${viewingTrip.meeting_terminal}`,
                        viewingTrip.meeting_details && `Details: ${viewingTrip.meeting_details}`,
                      ].filter(Boolean).join(' \u00b7 ')}
                    </p>
                  )}
                </div>
              )}
            </div>

            {viewingTrip.description && (
              <div>
                <p className="text-xs font-medium text-dark-muted mb-1">Description</p>
                <p className="text-sm text-dark whitespace-pre-line">{viewingTrip.description}</p>
              </div>
            )}

            {(viewingTrip.highlight_cards?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-medium text-dark-muted mb-1">Highlight Cards</p>
                <div className="grid grid-cols-2 gap-2">
                  {viewingTrip.highlight_cards!.map((c, i) => (
                    <div key={i} className="bg-background-warm/60 rounded-md p-2.5 flex items-start gap-2">
                      {c.icon && <TripHighlightIconDisplay icon={c.icon} index={i} size="sm" />}
                      <div>
                        <p className="text-sm text-dark font-medium">{c.heading}</p>
                        {c.description && <p className="text-dark-muted text-xs mt-0.5">{c.description}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {viewingTrip.itinerary?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-dark-muted mb-1">Itinerary</p>
                <div className="space-y-2">
                  {viewingTrip.itinerary.map((d, i) => (
                    <div key={i} className="text-sm flex items-start gap-2">
                      {d.icon && <TripHighlightIconDisplay icon={d.icon} index={i} size="sm" />}
                      <div className="min-w-0">
                        <p className="font-medium text-dark">Day {d.day || i + 1}: {d.title}</p>
                        {d.description && <p className="text-dark-muted text-xs mt-0.5">{d.description}</p>}
                        {(d.bullets?.length ?? 0) > 0 && (
                          <ul className="text-dark-muted text-xs list-disc list-inside mt-0.5">
                            {d.bullets!.map((bullet, bi) => <li key={bi}>{bullet}</li>)}
                          </ul>
                        )}
                        {d.images && d.images.length > 0 && (
                          <div className="flex gap-1.5 mt-1.5">
                            {d.images.slice(0, 6).map((url, j) => (
                              <img key={j} src={url} alt="" className="w-10 h-10 object-cover rounded" />
                            ))}
                            {d.images.length > 6 && (
                              <span className="w-10 h-10 rounded bg-background-warm text-dark-muted text-xs flex items-center justify-center">
                                +{d.images.length - 6}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(viewingTrip.not_included?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-medium text-dark-muted mb-1">Not Included</p>
                <ul className="text-sm text-dark list-disc list-inside space-y-0.5">
                  {viewingTrip.not_included.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
              </div>
            )}

            {(viewingTrip.included_groups?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-medium text-dark-muted mb-1">What's Included — Grouped</p>
                <div className="space-y-2">
                  {viewingTrip.included_groups!.map((group, gi) => (
                    <div key={gi}>
                      <p className="text-sm font-semibold text-dark flex items-center gap-1.5">
                        {group.icon && <TripHighlightIconDisplay icon={group.icon} index={gi} size="sm" />}
                        {group.heading}
                      </p>
                      <ul className="text-sm text-dark list-disc list-inside ml-1">
                        {group.bullets.map((bullet, bi) => <li key={bi}>{bullet}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {((viewingTrip.included_items?.length ?? 0) > 0 || (viewingTrip.not_included_items?.length ?? 0) > 0) && (
              <div className="grid grid-cols-2 gap-4">
                {(viewingTrip.included_items?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-xs font-medium text-dark-muted mb-1">What's Included (icons)</p>
                    <ul className="text-sm text-dark space-y-1">
                      {viewingTrip.included_items!.map((item, i) => (
                        <li key={i} className="flex items-center gap-1.5">
                          {item.icon && <TripHighlightIconDisplay icon={item.icon} index={i} size="sm" />}
                          {item.description}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(viewingTrip.not_included_items?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-xs font-medium text-dark-muted mb-1">Not Included (icons)</p>
                    <ul className="text-sm text-dark space-y-0.5">
                      {viewingTrip.not_included_items!.map((item, i) => (
                        <li key={i}>{item.icon && <span className="mr-1.5">{item.icon}</span>}{item.description}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {((viewingTrip.things_to_carry_items?.length ?? 0) > 0) && (
              <div>
                <p className="text-xs font-medium text-dark-muted mb-1">Things to Carry</p>
                <ul className="text-sm text-dark space-y-1">
                  {viewingTrip.things_to_carry_items!.map((item, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      {item.icon && <TripHighlightIconDisplay icon={item.icon} index={i} size="sm" />}
                      {item.description}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(viewingTrip.confidence_items?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-medium text-dark-muted mb-1">Travel with Confidence</p>
                {viewingTrip.confidence_description && (
                  <p className="text-sm text-dark whitespace-pre-line mb-1.5">{viewingTrip.confidence_description}</p>
                )}
                <ul className="text-sm text-dark space-y-1">
                  {viewingTrip.confidence_items!.map((item, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      {item.icon && <TripHighlightIconDisplay icon={item.icon} index={i} size="sm" />}
                      {item.description}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {viewingTrip.accommodation_description || (viewingTrip.accommodation_photos?.length ?? 0) > 0 ? (
              <div>
                <p className="text-xs font-medium text-dark-muted mb-1">Accommodation</p>
                {viewingTrip.accommodation_description && (
                  <p className="text-sm text-dark whitespace-pre-line mb-1.5">{viewingTrip.accommodation_description}</p>
                )}
                {(viewingTrip.accommodation_photos?.length ?? 0) > 0 && (
                  <div className="grid grid-cols-4 gap-2">
                    {viewingTrip.accommodation_photos!.slice(0, 8).map((url, i) => (
                      <img key={i} src={url} alt="" className="w-full h-16 object-cover rounded" />
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {viewingTrip.trip_founder && (viewingTrip.trip_founder.name || viewingTrip.trip_founder.photo) && (
              <div>
                <p className="text-xs font-medium text-dark-muted mb-1">Trip Founder</p>
                <div className="flex gap-3 items-start bg-background-warm/60 rounded-md p-3">
                  {viewingTrip.trip_founder.photo && (
                    <img src={viewingTrip.trip_founder.photo} alt="" className="w-14 h-14 rounded-full object-cover flex-shrink-0" />
                  )}
                  <div>
                    {viewingTrip.trip_founder.name && <p className="text-sm font-medium text-dark">{viewingTrip.trip_founder.name}</p>}
                    {viewingTrip.trip_founder.description && (
                      <p className="text-dark-muted text-xs mt-0.5 whitespace-pre-line">{viewingTrip.trip_founder.description}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {viewingTrip.gallery_images?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-dark-muted mb-1">Gallery ({viewingTrip.gallery_images.length})</p>
                <div className="grid grid-cols-4 gap-2">
                  {viewingTrip.gallery_images.slice(0, 8).map((url, i) => (
                    <img key={i} src={url} alt="" className="w-full h-16 object-cover rounded" />
                  ))}
                </div>
              </div>
            )}

            {(viewingTrip.gallery_items?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-medium text-dark-muted mb-1">Places You'll Post ({viewingTrip.gallery_items!.length})</p>
                {viewingTrip.gallery_description && (
                  <p className="text-sm text-dark whitespace-pre-line mb-1.5">{viewingTrip.gallery_description}</p>
                )}
                <div className="grid grid-cols-4 gap-2">
                  {viewingTrip.gallery_items!.slice(0, 8).map((item, i) => (
                    <div key={i}>
                      {item.photo && <img src={item.photo} alt="" className="w-full h-16 object-cover rounded" />}
                      {item.description && <p className="text-dark-muted text-xs mt-0.5 truncate">{item.description}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(viewingTrip.fashion_photos?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-medium text-dark-muted mb-1">Fashion Aesthetics ({viewingTrip.fashion_photos!.length})</p>
                {viewingTrip.fashion_description && (
                  <p className="text-sm text-dark whitespace-pre-line mb-1.5">{viewingTrip.fashion_description}</p>
                )}
                <div className="grid grid-cols-4 gap-2">
                  {viewingTrip.fashion_photos!.slice(0, 8).map((url, i) => (
                    <img key={i} src={url} alt="" className="w-full h-16 object-cover rounded" />
                  ))}
                </div>
              </div>
            )}

            {viewingTrip.end_banner && (viewingTrip.end_banner.heading || viewingTrip.end_banner.image) && (
              <div>
                <p className="text-xs font-medium text-dark-muted mb-1">End Banner</p>
                <div className="flex gap-3 items-start bg-background-warm/60 rounded-md p-3">
                  {viewingTrip.end_banner.image && (
                    <img src={viewingTrip.end_banner.image} alt="" className="w-20 h-14 rounded object-cover flex-shrink-0" />
                  )}
                  <div>
                    {viewingTrip.end_banner.heading && <p className="text-sm font-medium text-dark">{viewingTrip.end_banner.heading}</p>}
                    {viewingTrip.end_banner.description && (
                      <p className="text-dark-muted text-xs mt-0.5">{viewingTrip.end_banner.description}</p>
                    )}
                    {viewingTrip.end_banner.cta_label && (
                      <p className="text-xs text-primary mt-1">{viewingTrip.end_banner.cta_label}{viewingTrip.end_banner.cta_url ? ` → ${viewingTrip.end_banner.cta_url}` : ''}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {(viewingTrip.terms_and_conditions || '').trim() && (
              <details className="group">
                <summary className="text-xs font-medium text-dark-muted mb-1 cursor-pointer select-none list-none flex items-center gap-1">
                  <span className="transition-transform group-open:rotate-90">▶</span> Terms & Conditions
                </summary>
                <div className="mt-2 bg-background rounded-md p-3 max-h-64 overflow-y-auto app-scroll space-y-4">
                  {parseTerms(viewingTrip.terms_and_conditions || '').map(section => (
                    <div key={section.number}>
                      <p className="text-xs font-bold text-dark mb-1">
                        {section.number}. {section.title}
                      </p>
                      <TermsBlocks blocks={section.blocks} />
                    </div>
                  ))}
                </div>
              </details>
            )}

            <details className="group">
              <summary className="text-xs font-medium text-dark-muted mb-1 cursor-pointer select-none list-none flex items-center gap-1">
                <span className="transition-transform group-open:rotate-90">▶</span> Cancellation Policy
              </summary>
              <div className="mt-2 bg-background rounded-md p-3 max-h-80 overflow-y-auto app-scroll">
                <CancellationPolicyDisplay policy={viewingTrip.cancellation_policy || DEFAULT_CANCELLATION_POLICY} />
              </div>
            </details>

            <div className="flex gap-3 pt-2 border-t border-background-warm">
              <Button
                variant="primary"
                size="md"
                onClick={() => { const t = viewingTrip; setViewingTrip(null); openEdit(t); }}
              >
                Edit Trip
              </Button>
              <Button variant="outline" size="md" onClick={() => setViewingTrip(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>
    </AdminLayout>
  );
}
