import { Check, Users } from '@phosphor-icons/react';
import { glass } from './gameUi';
import { MIN_PLAYERS, SPECIALS, SPECIAL_BLURB, maxSpecials, roleLocked } from './yaaruAvanSpecials';
import type { SpecialId } from './yaaruAvanSpecials';

const SPECIAL_TONE: Record<SpecialId, string> = {
  retriever: 'from-emerald-300 to-teal-400',
  joyFool: 'from-amber-300 to-orange-400',
  duelists: 'from-rose-300 to-red-400',
  boomerang: 'from-emerald-300 to-teal-400',
  goddess: 'from-gold-300 to-gold',
  ghost: 'from-sky-300 to-blue-400',
  revenger: 'from-fuchsia-300 to-pink-400',
  falafelVendor: 'from-yellow-200 to-amber-300',
  lovers: 'from-pink-300 to-rose-400',
};

/**
 * The role checklist: title, the exact description, and a tick box on the right.
 * Retriever is disabled below 2 Strangers. Other roles whose minimum group size is not met yet
 * (Lovers 5+, Falafel Vendor 4+ ...) is flagged "Needs N players", and the deal skips it
 * until enough people are in, so the host can tick it now and it joins in later.
 */
export default function SpecialList({ on, onToggle, onSetAll, players, strangers = 0 }: { on: ReadonlySet<SpecialId>; onToggle: (id: SpecialId) => void; onSetAll?: (ids: SpecialId[]) => void; players?: number; strangers?: number }) {
  const short = (id: SpecialId) => roleLocked(id, players, strangers);
  // Roles whose condition is not met are locked and never count as ticked.
  const available = SPECIALS.filter(d => !short(d.id));
  const ticked = available.filter(d => on.has(d.id));
  const active = ticked.length;
  return (
    <>
      {players !== undefined && (
        <p className="text-[12px] leading-snug text-cream/70 mb-2" aria-live="polite">
          <span className="font-bold text-white">{players} players:</span>{' '}
          {ticked.length === 0
            ? 'no special roles ticked.'
            : `${active} ticked ${active === 1 ? 'role is' : 'roles are'} ready. Up to ${maxSpecials(players)} dealt each round.`}
        </p>
      )}
      {onSetAll && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-cream/50 tabular-nums">{ticked.length} of {available.length} selected</span>
          <span className="flex gap-3 text-xs font-bold">
            <button type="button" onClick={() => onSetAll(available.map(d => d.id))} disabled={ticked.length === available.length} className="text-gold-300 hover:underline disabled:opacity-40 disabled:no-underline">Select all</button>
            <button type="button" onClick={() => onSetAll([])} disabled={ticked.length === 0} className="text-cream/60 hover:underline disabled:opacity-40 disabled:no-underline">Unselect all</button>
          </span>
        </div>
      )}
    <ul className={`${glass} divide-y divide-white/10 mb-4`}>
      {SPECIALS.map(def => {
        const needs = MIN_PLAYERS[def.id] ?? 0;
        const unavailable = short(def.id);
        const checked = on.has(def.id) && !unavailable;
        const isShort = unavailable;
        const lackStrangers = def.id === 'retriever' && strangers < 2;
        return (
          <li key={def.id}>
            <button type="button" role="checkbox" aria-checked={checked} disabled={unavailable} onClick={() => onToggle(def.id)}
              className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-white/[0.04] transition-colors disabled:cursor-not-allowed disabled:hover:bg-transparent">
              <span className={`w-11 h-11 rounded-xl bg-gradient-to-br ${SPECIAL_TONE[def.id]} text-2xl leading-none flex items-center justify-center shrink-0 shadow-md ${unavailable ? 'opacity-50' : ''}`} aria-hidden="true">
                {def.emoji}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-white leading-tight">{def.name}</span>
                <span className={`block text-[12px] leading-snug mt-0.5 text-cream/60`}>{SPECIAL_BLURB[def.id]}</span>
                {isShort && (
                  <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber-300/15 border border-warning-border/30 px-2 py-0.5 text-[10px] font-bold text-amber-100">
                    <Users size={11} weight="bold" aria-hidden="true" />
                    {lackStrangers ? `Needs 2+ Strangers · you have ${strangers} (Pickpockets do not count)` : `Needs ${needs}+ players · you have ${players}`}
                  </span>
                )}
              </span>
              <span className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-primary border-primary text-white' : 'border-white/30 text-transparent'} ${unavailable ? 'opacity-40' : ''}`} aria-hidden="true">
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
