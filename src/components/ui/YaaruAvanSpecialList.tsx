import { Check } from '@phosphor-icons/react';
import { glass } from './gameUi';
import { SPECIALS, SPECIAL_BLURB } from './yaaruAvanSpecials';
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

/** The role checklist: title, the exact description, and a tick box on the right. */
export default function SpecialList({ on, onToggle }: { on: ReadonlySet<SpecialId>; onToggle: (id: SpecialId) => void }) {
  return (
    <ul className={`${glass} divide-y divide-white/10 mb-4`}>
      {SPECIALS.map(def => {
        const checked = on.has(def.id);
        return (
          <li key={def.id}>
            <button type="button" role="checkbox" aria-checked={checked} onClick={() => onToggle(def.id)}
              className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-white/[0.04] transition-colors">
              <span className={`w-11 h-11 rounded-xl bg-gradient-to-br ${SPECIAL_TONE[def.id]} text-2xl leading-none flex items-center justify-center shrink-0 shadow-md`} aria-hidden="true">
                {def.emoji}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-white leading-tight">{def.name}</span>
                <span className="block text-[12px] leading-snug text-cream/60 mt-0.5">{SPECIAL_BLURB[def.id]}</span>
              </span>
              <span className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-primary border-primary text-white' : 'border-white/30 text-transparent'}`} aria-hidden="true">
                <Check size={14} weight="bold" />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
