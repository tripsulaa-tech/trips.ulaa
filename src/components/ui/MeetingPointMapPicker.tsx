import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
// Vite-friendly fix for Leaflet's default marker icon paths, which are
// hard-coded relative URLs that break once the library is bundled — see
// https://github.com/Leaflet/Leaflet/issues/4968. Importing the three PNGs
// as static assets and re-pointing the default icon at them means the pin
// always renders, no CDN dependency required.
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import {
  MagnifyingGlass as Search,
  MapPin,
  Spinner,
} from '@phosphor-icons/react';
import Modal from './Modal';
import Button from './Button';

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

/** Falls back to India's rough geographic centre so the map opens on
 *  a sensible view before the admin has searched or clicked anything —
 *  every ULAA trip so far departs from somewhere in India. */
const DEFAULT_CENTER: [number, number] = [22.3511, 78.6677];
const DEFAULT_ZOOM = 5;
const SELECTED_ZOOM = 15;

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  name?: string;
  address?: Record<string, string>;
}

export interface MeetingPointSelection {
  /** Short label for the "Location Name" field — the place's own name if
   *  Nominatim has one, otherwise its street. */
  name: string;
  /** Full formatted address for the "Address" field. */
  address: string;
  lat: number;
  lng: number;
  /** A Google Maps link built from the exact coordinates, so it always
   *  points at the pin the admin actually placed — not a text search that
   *  might resolve somewhere else. */
  mapUrl: string;
}

interface MeetingPointMapPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (selection: MeetingPointSelection) => void;
  /** Pre-fills the search box the first time the picker opens (e.g. the
   *  trip's existing meeting point or destination), so the admin usually
   *  just has to confirm a result instead of typing from scratch. */
  initialQuery?: string;
}

function shortNameFromResult(result: NominatimResult): string {
  if (result.name) return result.name;
  const addr = result.address;
  return addr?.amenity || addr?.road || result.display_name.split(',')[0].trim();
}

function buildMapUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export default function MeetingPointMapPicker({ isOpen, onClose, onSelect, initialQuery }: MeetingPointMapPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reverseGeocodeTokenRef = useRef(0);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolvingPin, setResolvingPin] = useState(false);
  const [selected, setSelected] = useState<MeetingPointSelection | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    const token = ++reverseGeocodeTokenRef.current;
    setResolvingPin(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`
      );
      const data: NominatimResult = await res.json();
      if (token !== reverseGeocodeTokenRef.current) return; // a newer pin drop superseded this one
      const name = data ? shortNameFromResult(data) : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      const address = data?.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      setSelected({ name, address, lat, lng, mapUrl: buildMapUrl(lat, lng) });
    } catch {
      // Reverse geocoding failed (offline, rate-limited, etc.) — still let
      // the admin confirm the pin's raw coordinates rather than blocking them.
      if (token !== reverseGeocodeTokenRef.current) return;
      setSelected({ name: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, address: '', lat, lng, mapUrl: buildMapUrl(lat, lng) });
    } finally {
      if (token === reverseGeocodeTokenRef.current) setResolvingPin(false);
    }
  }, []);

  const placeMarker = useCallback((lat: number, lng: number) => {
    const map = mapRef.current;
    if (!map) return;
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else {
      markerRef.current = L.marker([lat, lng], { draggable: true }).addTo(map);
      markerRef.current.on('dragend', () => {
        const pos = markerRef.current?.getLatLng();
        if (pos) reverseGeocode(pos.lat, pos.lng);
      });
    }
  }, [reverseGeocode]);

  const dropPinAt = useCallback((lat: number, lng: number, zoom = SELECTED_ZOOM) => {
    placeMarker(lat, lng);
    mapRef.current?.setView([lat, lng], zoom);
    reverseGeocode(lat, lng);
  }, [placeMarker, reverseGeocode]);

  // Set up the map once, the first time the modal opens. Left alive across
  // re-opens (rather than torn down on close) so re-opening the picker
  // doesn't need to re-fetch tiles for the same view.
  useEffect(() => {
    if (!isOpen || mapRef.current || !mapContainerRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    map.on('click', (e: L.LeafletMouseEvent) => dropPinAt(e.latlng.lat, e.latlng.lng, map.getZoom()));
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // dropPinAt intentionally omitted — it's stable enough for this one-time
    // setup and re-running this effect would tear down/rebuild the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Leaflet sizes its tiles against the container's dimensions at the
  // moment it initializes; since the modal fades/scales in via framer
  // motion, the container can report a stale size a frame early, so nudge
  // it once more right after the modal is actually visible.
  useEffect(() => {
    if (!isOpen) return;
    const id = window.setTimeout(() => mapRef.current?.invalidateSize(), 150);
    return () => window.clearTimeout(id);
  }, [isOpen]);

  const runSearch = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&q=${encodeURIComponent(trimmed)}`
      );
      const data: NominatimResult[] = await res.json();
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
      setHasSearched(true);
    }
  }, []);

  // Fresh run each time the picker opens: reset any previous pick and try
  // to jump straight to the trip's existing meeting point/destination so
  // the admin usually lands on roughly the right spot immediately.
  useEffect(() => {
    if (!isOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting picker state for a newly-opened modal, not syncing an external system
    setSelected(null);
    setResults([]);
    setHasSearched(false);
    markerRef.current?.remove();
    markerRef.current = null;
    const seed = initialQuery?.trim() ?? '';
    setQuery(seed);
    mapRef.current?.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    if (seed) runSearch(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  function handleQueryChange(value: string) {
    setQuery(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => runSearch(value), 400);
  }

  function handlePickResult(result: NominatimResult) {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    setResults([]);
    setSelected({ name: shortNameFromResult(result), address: result.display_name, lat, lng, mapUrl: buildMapUrl(lat, lng) });
    placeMarker(lat, lng);
    mapRef.current?.setView([lat, lng], SELECTED_ZOOM);
  }

  function handleConfirm() {
    if (!selected) return;
    onSelect(selected);
    onClose();
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Pick Meeting Point"
      size="lg"
      footer={
        <div className="flex gap-3">
          <Button variant="outline" size="md" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="md" onClick={handleConfirm} disabled={!selected || resolvingPin}>
            Use This Location
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-muted pointer-events-none" aria-hidden="true" />
          <input
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            placeholder="Search for a place, address, or landmark…"
            className="w-full pl-9 pr-9 py-2 rounded-md border-2 border-background-warm bg-background font-body text-dark text-sm focus:border-primary outline-none transition-colors"
            aria-label="Search for a meeting point"
          />
          {searching && (
            <Spinner size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-muted animate-spin" aria-hidden="true" />
          )}

          {results.length > 0 && (
            <ul className="absolute z-[1000] left-0 right-0 mt-1 bg-white border-2 border-background-warm rounded-md shadow-warm-lg max-h-56 overflow-y-auto app-scroll">
              {results.map(result => (
                <li key={result.place_id}>
                  <button
                    type="button"
                    onClick={() => handlePickResult(result)}
                    className="w-full text-left px-3 py-2 hover:bg-background-warm transition-colors flex items-start gap-2"
                  >
                    <MapPin size={15} className="text-primary shrink-0 mt-0.5" aria-hidden="true" />
                    <span className="text-sm text-dark leading-snug">{result.display_name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {hasSearched && !searching && results.length === 0 && query.trim() && (
            <p className="text-xs text-dark-muted mt-1.5">No matches found — try a different search, or click straight on the map below.</p>
          )}
        </div>

        <div
          ref={mapContainerRef}
          className="w-full h-[340px] rounded-md border-2 border-background-warm overflow-hidden"
        />
        <p className="text-xs text-dark-muted">Click anywhere on the map to drop a pin, or drag the pin once it's placed. Search results above jump straight there.</p>

        <div className="rounded-md bg-background border-2 border-background-warm p-3 min-h-[64px] flex items-center gap-3">
          {resolvingPin ? (
            <>
              <Spinner size={18} className="text-primary animate-spin shrink-0" aria-hidden="true" />
              <span className="text-sm text-dark-muted">Looking up this spot…</span>
            </>
          ) : selected ? (
            <>
              <MapPin size={18} className="text-primary shrink-0" weight="fill" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-dark truncate">{selected.name}</p>
                {selected.address && <p className="text-xs text-dark-muted truncate">{selected.address}</p>}
              </div>
            </>
          ) : (
            <span className="text-sm text-dark-muted">No location picked yet — search above or click the map.</span>
          )}
        </div>
      </div>
    </Modal>
  );
}
