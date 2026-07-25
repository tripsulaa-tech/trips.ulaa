import type { UpcomingTrip } from '../types';

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

function buildEventFields(trip: UpcomingTrip) {
  const title = `${trip.title} — ULAA Trip`;
  const details = trip.description || `Trip to ${trip.destination} with ULAA.`;
  const location = trip.meeting_point || trip.destination;
  const start = toCalendarDate(trip.start_date);
  const end = toCalendarDate(dayAfter(trip.end_date));
  return { title, details, location, start, end };
}

/** Opens Google Calendar's "add event" screen pre-filled with the trip's
 *  dates, so the admin doesn't need any backend/API integration. */
export function getGoogleCalendarUrl(trip: UpcomingTrip): string {
  const { title, details, location, start, end } = buildEventFields(trip);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${start}/${end}`,
    details,
    location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Builds a standard .ics file (works with Apple Calendar, Outlook, and
 *  most other calendar apps) and triggers a browser download for it. */
export function downloadTripIcs(trip: UpcomingTrip): void {
  const { title, details, location, start, end } = buildEventFields(trip);
  const escapeText = (s: string) => s.replace(/([,;])/g, '\\$1').replace(/\n/g, '\\n');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ULAA//Trip Booking//EN',
    'BEGIN:VEVENT',
    `UID:${trip.id}@tripsulaa`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${escapeText(title)}`,
    `DESCRIPTION:${escapeText(details)}`,
    `LOCATION:${escapeText(location)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${trip.slug || 'trip'}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
