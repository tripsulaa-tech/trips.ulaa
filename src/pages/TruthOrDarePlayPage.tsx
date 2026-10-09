import { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Sparkle } from '@phosphor-icons/react';
import Layout from '../components/layout/Layout';
import TruthOrDareGame from '../components/ui/TruthOrDareGame';
import { cleanName } from '../components/ui/gameUi';
import { getTodShare } from '../services/api/todShare';
import { usePageMeta } from '../hooks/usePageMeta';
import { pageTitle } from '../constants/site';

// The link an admin shares from Admin -> Games -> "Play Truth or Dare".
// Not listed on /games: only people who are sent the link land here. It is
// pass-and-play on one phone. The admin's chosen players are saved under a short
// code (/play/truth-or-dare/k7x2, see services/api/todShare.ts), so the setup
// screen opens already filled in. Older links carried the names in the URL
// fragment (#p=Anu,Bala_K,...) and still work; a link with neither opens a
// blank game to type names into.
const MAX_SHARED_PLAYERS = 40;

function playersFromHash(hash: string): string[] | undefined {
  try {
    const m = /^#p=(.*)$/.exec(hash);
    if (!m || !m[1]) return undefined;
    // Short form: "Anu,Bala_K,Chitra" (comma-separated, _ for a space). Links
    // shared earlier used a JSON array, so that form is still understood.
    const raw = m[1];
    const list: unknown[] = raw.startsWith('%5B') || raw.startsWith('[')
      ? JSON.parse(decodeURIComponent(raw))
      : raw.split(',').map(n => decodeURIComponent(n).replace(/_/g, ' '));
    const names = list.filter((n): n is string => typeof n === 'string').map(cleanName).filter(Boolean).slice(0, MAX_SHARED_PLAYERS);
    return names.length >= 2 ? names : undefined;
  } catch {
    return undefined;
  }
}

export default function TruthOrDarePlayPage() {
  const reduce = useReducedMotion();
  const { hash } = useLocation();
  const { code } = useParams<{ code: string }>();
  const hashPlayers = useMemo(() => playersFromHash(hash), [hash]);

  // Players saved under the code; `shared.code` is the code we have an answer for.
  const [shared, setShared] = useState<{ code: string; players: string[] | null } | null>(null);
  useEffect(() => {
    if (!code) return;
    let alive = true;
    getTodShare(code)
      .then(sh => { if (alive) setShared({ code, players: sh ? sh.players.map(cleanName).filter(Boolean).slice(0, MAX_SHARED_PLAYERS) : null }); })
      .catch(err => { console.error(err); if (alive) setShared({ code, players: null }); });
    return () => { alive = false; };
  }, [code]);
  const loading = !!code && shared?.code !== code;
  const codeMissing = !!code && !loading && !shared?.players;
  const players = code ? (shared?.code === code ? shared.players ?? undefined : undefined) : hashPlayers;

  usePageMeta({
    title: pageTitle('Truth or Dare'),
    description: 'Play Truth or Dare with your Ulaa trip group: spin the bottle, flip a card, earn points.',
    path: '/play/truth-or-dare',
  });

  return (
    <Layout>
      <section className="relative overflow-hidden bg-gradient-to-b from-dark via-footer to-[#1B130E] text-cream min-h-[70vh]">
        <span className="absolute -top-24 left-1/2 -translate-x-1/2 w-[28rem] h-72 rounded-full bg-primary/35 blur-3xl pointer-events-none" aria-hidden="true" />
        <div className="relative max-w-md mx-auto px-4 sm:px-6 pt-36 pb-16 sm:pt-44 text-center">
          <motion.span
            className="w-16 h-16 mx-auto mb-4 rounded-[22px] bg-gradient-to-br from-secondary to-primary text-white flex items-center justify-center shadow-[0_14px_36px_rgba(168,90,42,0.5)]"
            animate={reduce ? undefined : { y: [0, -6, 0], rotate: [-3, 3, -3] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            aria-hidden="true"
          >
            <Sparkle size={36} weight="duotone" />
          </motion.span>
          <h1 className="font-display text-4xl font-extrabold text-white">Truth or Dare</h1>
          <p className="mt-3 mb-8 text-cream/70 text-sm">Pass the phone around, spin to pick who is next, and flip a card if you dare.{players ? ` ${players.length} players are ready.` : ''}</p>
          {loading ? (
            <p role="status" className="text-sm text-cream/70">Getting your game ready…</p>
          ) : (
            <>
              {codeMissing && (
                <p role="status" className="mb-4 text-sm text-[#F0CE7A]">This link has expired or isn't right, so type your names in to play.</p>
              )}
              {/* Opens on the setup screen; closing it leaves this tile to start again. */}
              <TruthOrDareGame key={`${code ?? ''}${hash}`} defaultOpen players={players} maxPlayers={MAX_SHARED_PLAYERS} />
            </>
          )}
        </div>
      </section>
    </Layout>
  );
}
