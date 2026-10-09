import { useState } from 'react';
import { Users, Check, CaretDown } from '@phosphor-icons/react';
import Select from '../../components/ui/Select';
import { formatDateRange } from '../../utils/utils-index';
import { isInProgress } from './hostShared';
import type { TripRoster } from './useTripRoster';

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(w => w.charAt(0).toUpperCase()).join('');

// Admin -> Games -> Play: "who is playing". One card with the trip, a live
// present count and the traveller list.
//  - Phone: the list is folded behind one button (a stack of initials + "Choose who's
//    playing") so the games are on screen straight away; the count and All / None stay visible.
//  - Desktop (lg and up): this card is the left rail. The list is always open, one name
//    per row, and scrolls on its own when the group is big.
export default function TripRosterPanel({ roster }: { roster: TripRoster }) {
  const { trips, tripsError, tripId, trip, today, loadingPeople, bookedError, people, anyCheckedIn, presentIds, present } = roster;
  const [open, setOpen] = useState(false);
  const options = (trips ?? []).map(t => ({
    value: t.id,
    label: `${t.title} · ${formatDateRange(t.start_date, t.end_date)}${isInProgress(t, today) ? ' · In progress' : ''}`,
  }));
  const pct = people.length ? Math.round((present.length / people.length) * 100) : 0;
  const preview = present.slice(0, 5);

  return (
    <div className="bg-white rounded-2xl shadow-card overflow-hidden">
      <div className="p-3 sm:p-4">
        {tripsError ? (
          <p role="alert" className="text-sm text-dark">Couldn't load the trips. Please refresh the page.</p>
        ) : trips === null ? (
          <p role="status" className="text-sm text-dark-muted">Loading trips…</p>
        ) : trips.length === 0 ? (
          <p className="text-sm text-dark-muted">There are no upcoming or in-progress trips right now.</p>
        ) : (
          <div>
            <label htmlFor="games-trip" className="block text-[11px] font-bold uppercase tracking-[0.14em] text-dark-muted mb-1.5">Trip <span className="font-medium normal-case tracking-normal">· upcoming and in progress</span></label>
            <Select inputId="games-trip" size="sm" value={tripId} onChange={roster.pickTrip} options={options} placeholder="Select a trip…" />
          </div>
        )}
      </div>

      {tripId && (
        <div className="border-t border-background-warm p-3 sm:p-4 space-y-3">
          {loadingPeople ? (
            <p role="status" className="text-sm text-dark-muted">Loading booked travellers…</p>
          ) : bookedError ? (
            <p role="alert" className="text-sm text-dark">Couldn't load the booked travellers. Pick the trip again to retry.</p>
          ) : people.length === 0 ? (
            <p className="text-sm text-dark-muted">No one is booked on {trip?.title ?? 'this trip'} yet, so there is nobody to play with.</p>
          ) : (
            <>
              <div className="flex items-start gap-3">
                <span className="w-10 h-10 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center" aria-hidden="true">
                  <Users size={22} weight="duotone" />
                </span>
                <div className="min-w-0 flex-1" role="status">
                  <p className="font-display text-lg font-extrabold leading-tight text-dark tabular-nums">
                    {present.length}<span className="font-semibold text-dark-muted text-sm"> of {people.length} present</span>
                  </p>
                  <p className="text-xs text-dark-muted leading-snug mt-0.5">
                    {anyCheckedIn ? 'Checked-in travellers are ticked.' : 'Nobody is checked in yet, so everyone is ticked.'}
                  </p>
                </div>
                <div className="shrink-0 inline-flex rounded-lg bg-background-warm/60 p-0.5 text-xs font-button font-semibold">
                  <button type="button" onClick={() => roster.setAll(true)} className="min-h-[36px] px-3 rounded-md text-primary hover:bg-white transition-colors">All</button>
                  <button type="button" onClick={() => roster.setAll(false)} className="min-h-[36px] px-3 rounded-md text-primary hover:bg-white transition-colors">None</button>
                </div>
              </div>

              <div className="h-1.5 rounded-full bg-background-warm overflow-hidden" aria-hidden="true">
                <div className="h-full rounded-full bg-gradient-to-r from-primary-light to-primary transition-[width] duration-300" style={{ width: `${pct}%` }} />
              </div>

              {/* Phone only: fold the list away. */}
              <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
                aria-controls="games-roster-list"
                className="lg:hidden w-full flex items-center gap-3 min-h-[48px] px-3 rounded-xl border border-background-warm bg-background-warm/30 text-left active:bg-background-warm/60 transition-colors"
              >
                <span className="flex -space-x-2 shrink-0" aria-hidden="true">
                  {preview.length === 0 && <span className="w-7 h-7 rounded-full border-2 border-white bg-background-warm" />}
                  {preview.map(p => (
                    <span key={p.id} className="w-7 h-7 rounded-full border-2 border-white bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center">{initials(p.full_name)}</span>
                  ))}
                  {present.length > preview.length && (
                    <span className="w-7 h-7 rounded-full border-2 border-white bg-dark text-white text-[10px] font-bold flex items-center justify-center tabular-nums">+{present.length - preview.length}</span>
                  )}
                </span>
                <span className="flex-1 min-w-0 text-sm font-semibold text-dark truncate">{open ? 'Hide the list' : 'Choose who’s playing'}</span>
                <CaretDown size={16} className={`shrink-0 text-dark-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>

              <ul
                id="games-roster-list"
                aria-label="Travellers present"
                className={`${open ? 'grid' : 'hidden'} grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:flex-col lg:gap-1 lg:max-h-[calc(100vh-24rem)] lg:min-h-[8rem] lg:overflow-y-auto lg:-mx-1 lg:px-1 lg:pb-1`}
              >
                {people.map(p => {
                  const on = presentIds.has(p.id);
                  return (
                    <li key={p.id} className="min-w-0 lg:w-full">
                      <label title={p.full_name} className={`flex items-center gap-2 h-11 lg:h-10 pl-2 pr-2.5 rounded-xl border text-sm cursor-pointer select-none transition-colors focus-within:ring-2 focus-within:ring-primary/40 ${on ? 'bg-primary/10 border-primary/40 text-dark font-medium' : 'bg-white border-background-warm text-dark-muted hover:border-primary/30'}`}>
                        <input type="checkbox" checked={on} onChange={() => roster.toggle(p.id)} className="sr-only" />
                        <span className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center transition-colors ${on ? 'bg-primary text-white' : 'border border-dark-muted/40'}`} aria-hidden="true">
                          {on && <Check size={12} weight="bold" />}
                        </span>
                        <span className="truncate min-w-0 lg:flex-1">{p.full_name}</span>
                        {p.checked_in_at && <span className="shrink-0 text-[10px] font-semibold text-green-700 bg-green-50 rounded px-1 leading-4" title="Checked in">In</span>}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
