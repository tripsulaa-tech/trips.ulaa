import type { UpcomingTrip } from '../types/types-index';
import { formatPrice } from './utils-index';

/** YYYYMMDD, used by both the Google Calendar URL and the .ics file for
 *  all-day events. Google/most calendar apps treat the end date of an
 *  all-day event as exclusive, so callers should pass the day *after*
 *  the trip's actual last day when building the end value. */
function toCalendarDate(dateStr: string): string {
  return dateStr.replaceAll('-', '');
}

function dayAfter(dateStr: string): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Fields shared by the Google Calendar URL builder and the .ics builder
 *  below, regardless of what kind of event (trip dates, offer-ends
 *  reminder, etc.) they were built for. `start`/`end` are already in
 *  YYYYMMDD form. */
interface CalendarEventFields {
  title: string;
  details: string;
  location: string;
  start: string;
  end: string;
}

function buildEventFields(trip: UpcomingTrip): CalendarEventFields {
  const title = `${trip.title} — ULAA Trip`;
  const details = trip.description || `Trip to ${trip.destination} with ULAA.`;
  const location = trip.meeting_point || trip.destination;
  const start = toCalendarDate(trip.start_date);
  const end = toCalendarDate(dayAfter(trip.end_date));
  return { title, details, location, start, end };
}

/** Builds a Google Calendar "add event" prefill URL from already-assembled
 *  fields. Kept generic (not tied to `UpcomingTrip`) so both the trip-dates
 *  event and the offer-reminder event below can share it. */
function buildGoogleCalendarUrl(fields: CalendarEventFields): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: fields.title,
    dates: `${fields.start}/${fields.end}`,
    details: fields.details,
    location: fields.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Builds a standard .ics file (works with Apple Calendar, Outlook, and
 *  most other calendar apps) and triggers a browser download for it. Also
 *  generic over the event fields for the same reason as the Google URL
 *  builder above — `uid`/`filename` are passed in separately since those
 *  need to be unique per event type (a trip booking vs. an offer reminder
 *  for that same trip shouldn't collide as the same calendar entry). */
function downloadIcs(fields: CalendarEventFields, uid: string, filename: string): void {
  const escapeText = (s: string) => s.replace(/([,;])/g, '\\$1').replace(/\n/g, '\\n');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ULAA//Trip Booking//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
    `DTSTART;VALUE=DATE:${fields.start}`,
    `DTEND;VALUE=DATE:${fields.end}`,
    `SUMMARY:${escapeText(fields.title)}`,
    `DESCRIPTION:${escapeText(fields.details)}`,
    `LOCATION:${escapeText(fields.location)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** True on iOS/iPadOS and macOS Safari, where downloading an .ics file
 *  hands off directly to the native Calendar app — a better experience
 *  there than Google Calendar's web prefill screen. */
function prefersIcsDownload(): boolean {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window);
  // iPadOS 13+ reports as "Macintosh" but exposes touch support, unlike real Macs.
  const isIPadOS = ua.includes('Macintosh') && navigator.maxTouchPoints > 1;
  const isMac = /Macintosh/.test(ua) && !isIPadOS;
  return isIOS || isIPadOS || isMac;
}

/** Opens Google Calendar's "add event" screen pre-filled with the trip's
 *  dates, so the admin doesn't need any backend/API integration. */
export function getGoogleCalendarUrl(trip: UpcomingTrip): string {
  return buildGoogleCalendarUrl(buildEventFields(trip));
}

/** Builds a standard .ics file for the trip's dates (works with Apple
 *  Calendar, Outlook, and most other calendar apps) and triggers a browser
 *  download for it. */
export function downloadTripIcs(trip: UpcomingTrip): void {
  downloadIcs(buildEventFields(trip), `${trip.id}@tripsulaa`, `${trip.slug || 'trip'}.ics`);
}

/** One-click "Add to calendar" for a trip's own dates: picks the right
 *  action for the visitor's device automatically, no menu required.
 *  iOS/iPadOS/macOS get an .ics download (opens straight into Apple
 *  Calendar); everyone else gets the Google Calendar prefill link in a new
 *  tab. Used by TripCard's calendar-icon action. */
export function addToCalendar(trip: UpcomingTrip): void {
  if (prefersIcsDownload()) {
    downloadTripIcs(trip);
  } else {
    window.open(getGoogleCalendarUrl(trip), '_blank', 'noopener,noreferrer');
  }
}

/** Same one-click device-aware behaviour as `addToCalendar` above, but for
 *  a special offer's last day rather than the trip's own dates — used by
 *  the "Maybe later" action on the special-offer popup, so dismissing the
 *  popup for now still gets you a reminder before the deal expires,
 *  through the same reliable Apple Calendar / Google Calendar handoff as
 *  the "Add to calendar" icon on TripCard. Returns false and does nothing
 *  if the offer has no known end date to remind about. */
export function addOfferReminderToCalendar(trip: UpcomingTrip, activePrice?: number | null): boolean {
  const endDateStr = trip.special_offer_end_date || trip.special_offer_date;
  if (!endDateStr) return false;

  const end = new Date(endDateStr);
  if (Number.isNaN(end.getTime())) return false;

  const title = `${trip.special_offer_name || 'Special offer'} ends — ${trip.title}`;
  const details = activePrice != null
    ? `Book at ${formatPrice(activePrice)} per person before it's gone.`
    : `Last day to book this offer.`;
  const location = trip.meeting_point || trip.destination;
  const fields: CalendarEventFields = {
    title,
    details,
    location,
    start: toCalendarDate(endDateStr),
    end: toCalendarDate(dayAfter(endDateStr)),
  };

  if (prefersIcsDownload()) {
    downloadIcs(fields, `offer-${trip.id}-${fields.start}@ulaa`, 'special-offer-reminder.ics');
  } else {
    window.open(buildGoogleCalendarUrl(fields), '_blank', 'noopener,noreferrer');
  }
  return true;
}
