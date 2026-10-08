import { useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { UsersThree, MagnifyingGlass, ChatCircleDots, Heart, DeviceMobile, Play, SpeakerHigh, SpeakerSlash } from '@phosphor-icons/react';
import Modal from './Modal';
import { useSynth } from './gameAudio';
import { GameTile, BrandMark } from './gameParts';
import { primaryBtn, ghostBtn, glass } from './gameUi';
import FindMyTwinOnline from './FindMyTwinOnline';
import { loadTwinSession } from './findMyTwinApi';

// "Find My Twin": a get-to-know-each-other game for a group in the same place.
// Everyone answers 5 quick this-or-that questions on their own phone. The
// database secretly scores every pair, then each phone says "You + Kavya, 92%
// match. Find Kavya!". When two twins find each other a conversation prompt
// unlocks; when every pair has talked, the next round unlocks. Each round
// pairs people with someone new, so the game builds connections step by step.
// Needs the Supabase tables in supabase/migration/add_find_my_twin.sql.

const MUTE_KEY = 'ulaa:packbag:muted'; // one sound setting for all the games

interface FindMyTwinGameProps {
  tripId: string;
  tripSlug: string;
  tripTitle: string;
  className?: string;
  compact?: boolean;
  thumb?: boolean;
}

export default function FindMyTwinGame({ tripTitle, className = '', compact = false, thumb = false }: FindMyTwinGameProps) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [online, setOnline] = useState(false);
  const [savedRoom, setSavedRoom] = useState<string | null>(null);
  const [muted, setMuted] = useState<boolean>(() => {
    try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
  });
  const mutedRef = useRef(muted);
  const { ensure, onPressCapture } = useSynth(mutedRef);

  const toggleMute = () => {
    const next = !muted;
    mutedRef.current = next;
    setMuted(next);
    try { localStorage.setItem(MUTE_KEY, next ? '1' : '0'); } catch { /* not remembered */ }
  };

  const close = () => { setOpen(false); setOnline(false); };

  return (
    <div className={className}>
      <GameTile
        onClick={() => { setSavedRoom(loadTwinSession()?.code ?? null); setOnline(false); setOpen(true); }}
        compact={compact}
        thumb={thumb}
        Icon={UsersThree}
        accent="gold"
        title="Find My Twin"
        subtitle="Who is your travel match?"
        chip="New · Group game"
      />

      <Modal isOpen={open} onClose={close} ariaLabel="Find My Twin group game" size="sm" flush fullScreen>
        <div onPointerDownCapture={onPressCapture} className="[-webkit-tap-highlight-color:transparent] touch-manipulation relative overflow-hidden bg-gradient-to-b from-dark via-footer to-[#1B130E] text-cream px-4 pt-[max(4rem,calc(env(safe-area-inset-top)+3.5rem))] pb-[max(1.5rem,env(safe-area-inset-bottom))] min-h-[100dvh] flex justify-center">
          <div className="relative w-full max-w-md">
            <span className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-72 rounded-full bg-primary/35 blur-3xl pointer-events-none" aria-hidden="true" />
            <span className="absolute -top-10 -right-16 w-56 h-56 rounded-full bg-gold/20 blur-3xl pointer-events-none" aria-hidden="true" />

            {!online ? (
              <div className="relative text-center pt-3">
                <BrandMark />
                <motion.div
                  className="w-20 h-20 mx-auto mb-4 rounded-[28px] bg-gradient-to-br from-[#F0CE7A] to-gold text-dark flex items-center justify-center shadow-[0_14px_36px_rgba(200,150,42,0.45)]"
                  animate={reduce ? undefined : { y: [0, -6, 0], rotate: [-3, 3, -3] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  aria-hidden="true"
                >
                  <UsersThree size={46} weight="duotone" />
                </motion.div>
                <span className="inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-[#F0CE7A] bg-gold/15 border border-gold/30 rounded-full px-3 py-1 mb-2">Group game · 2 to 24 players</span>
                <h2 className="font-display text-4xl font-extrabold text-white leading-tight">Find My Twin</h2>
                <p className="text-sm text-cream/60 mt-1 mb-4 px-4">Answer 5 quick questions. ULAA secretly matches you with a travel twin. Then you have to find them!</p>

                <ul className={`${glass} text-left divide-y divide-white/10 mb-4`}>
                  {[
                    { I: Heart, c: 'bg-primary/25 text-[#F4B183]', t: <>Pick <strong className="text-white">Beach or Mountain, Tea or Coffee</strong> and 3 more.</> },
                    { I: MagnifyingGlass, c: 'bg-gold/20 text-[#F0CE7A]', t: <>ULAA says <strong className="text-white">"You + Kavya, 92% match. Find Kavya!"</strong></> },
                    { I: ChatCircleDots, c: 'bg-secondary/25 text-[#F4B183]', t: <>Meet, answer a question together, and <strong className="text-white">unlock the next round</strong>.</> },
                  ].map((r, i) => (
                    <li key={i} className="flex items-center gap-3 px-3 py-2.5 text-[13px] text-cream/75">
                      <span className={`w-7 h-7 shrink-0 rounded-lg flex items-center justify-center ${r.c}`}><r.I size={16} weight="duotone" /></span>
                      <span>{r.t}</span>
                    </li>
                  ))}
                </ul>

                <div className="space-y-2.5">
                  {savedRoom && (
                    <button type="button" onClick={() => { ensure(); setOnline(true); }} className={primaryBtn}><Play size={18} weight="fill" /> Rejoin room {savedRoom}</button>
                  )}
                  <button type="button" onClick={() => { ensure(); setOnline(true); }} className={savedRoom ? ghostBtn : primaryBtn}>
                    <DeviceMobile size={18} weight="duotone" /> Host or join a room
                  </button>
                </div>
                <p className="mt-3 text-[11px] text-cream/40 px-4">Best played together in the same place, each on their own phone.</p>
                <button type="button" onClick={toggleMute} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-cream/50 hover:text-cream transition-colors">
                  {muted ? <SpeakerSlash size={14} /> : <SpeakerHigh size={14} />} Sound {muted ? 'off' : 'on'}
                </button>
              </div>
            ) : (
              <FindMyTwinOnline tripTitle={tripTitle} onExit={() => { setSavedRoom(loadTwinSession()?.code ?? null); setOnline(false); }} />
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
