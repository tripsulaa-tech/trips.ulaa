import { Check, Users } from '@phosphor-icons/react';
import { glass } from './gameUi';
import { MIN_PLAYERS, SPECIALS, SPECIAL_BLURB, maxSpecials } from './yaaruAvanSpecials';
import type { SpecialId } from './yaaruAvanSpecials';

const SPECIAL_TONE: Record<SpecialId, string> = {
  clown: 'from-amber-300 to-orange-400',
  rivals: 'from-rose-300 to-red-400',
  returnTicket: 'from-emerald-300 to-teal-400',
  tripLeader: 'from-[#F0CE7A] to-gold',
  backseatRider: 'from-sky-300 to-blue-400',
  payback: 'from-fuchsia-300 to-pink-400',
  luckyDip: 'from-yellow-200 to-amber-300',
  lovers: 'from-pink-300 to-rose-400',
};

/**
 * The role checklist: title, the exact description, and a tick box on the right.
 * Every role can be ticked at any time. A role whose minimum group size is not met yet
 * (Lovers 5+, Falafel Vendor 4+ ...) is flagged "Needs N players", and the deal skips it
 * until enough people are in, so the host can tick it now and it joins in later.
 */
export default function SpecialList({ on, onToggle, players }: { on: ReadonlySet<SpecialId>; onToggle: (id: SpecialId) => void; players?: number }) {
  const short = (id: SpecialId) => players !== undefined && players < (MIN_PLAYERS[id] ?? 0);
  const ticked = SPECIALS.filter(d => on.has(d.id));
  const waiting = ticked.filter(d => short(d.id)).length;
  const active = ticked.length - waiting;
  return (
    <>
      {players !== undefined && (
        <p className="text-[12px] leading-snug text-cream/70 mb-2" aria-live="polite">
          <span className="font-bold text-white">{players} players:</span>{' '}
          {ticked.length === 0
            ? 'no special roles ticked.'
            : `${active} ticked ${active === 1 ? 'role is' : 'roles are'} ready${waiting > 0 ? `, ${waiting} waiting for more players` : ''}. Up to ${maxSpecials(players)} dealt each round.`}
        </p>
      )}
    <ul className={`${glass} divide-y divide-white/10 mb-4`}>
      {SPECIALS.map(def => {
        const checked = on.has(def.id);
        const needs = MIN_PLAYERS[def.id] ?? 0;
        const isShort = short(def.id);
        return (
          <li key={def.id}>
            <button type="button" role="checkbox" aria-checked={checked} onClick={() => onToggle(def.id)}
              className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-white/[0.04] transition-colors">
              <span className={`w-11 h-11 rounded-xl bg-gradient-to-br ${SPECIAL_TONE[def.id]} text-2xl leading-none flex items-center justify-center shrink-0 shadow-md`} aria-hidden="true">
                {def.emoji}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-white leading-tight">{def.name}</span>
                <span className={`block text-[12px] leading-snug mt-0.5 ${isShort ? 'text-cream/45' : 'text-cream/60'}`}>{SPECIAL_BLURB[def.id]}</span>
                {isShort && (
                  <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber-300/15 border border-amber-200/30 px-2 py-0.5 text-[10px] font-bold text-amber-100">
                    <Users size={11} weight="bold" aria-hidden="true" />
                    Needs {needs}+ players · you have {players}{checked ? ' · joins in once there are enough' : ''}
                  </span>
                )}
              </span>
              <span className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-primary border-primary text-white' : 'border-white/30 text-transparent'}`} aria-hidden="true">
                <Check size={14} weight="bold" />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
    </>
  );
}
