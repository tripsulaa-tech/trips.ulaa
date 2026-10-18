import { ArrowLeft } from '@phosphor-icons/react';
import { eyebrow, ghostBtn, glass } from './gameUi';
import { MIN_PLAYERS, MAX_PLAYERS, POINTS, maxPickpockets, recommendedRoles } from './yaaruAvanEngine';
import {
  CLOWN_POINTS, RIVAL_POINTS, SPECIALS, SPECIAL_BLURB,
} from './yaaruAvanSpecials';

// "How to play": the rules, roles, points and special roles in one scrolling page.
// The numbers and the special-role texts are read from the game's own files
// (yaaruAvanEngine.ts and yaaruAvanSpecials.ts), so this page cannot drift from the game.

const h = 'font-display text-lg font-extrabold text-white mb-2';
const p = 'text-[13px] leading-relaxed text-cream/75';

function Section({ kicker, title, children }: { kicker: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <p className={eyebrow}>{kicker}</p>
      <h3 className={h}>{title}</h3>
      {children}
    </section>
  );
}

const CORE_ROLES = [
  { name: 'Tourist', tone: 'text-emerald-300', body: 'Gets the real word. Describe it without giving it away, and find who is bluffing.' },
  { name: 'Stranger', tone: 'text-amber-300', body: 'Gets a similar but different word, and does not know it is different. Blend in and avoid being voted off.' },
  { name: 'Pickpocket', tone: 'text-rose-300', body: 'Gets no word at all. Listen, bluff, and if you are voted off, you get one last guess at the Tourists\' word.' },
];

export default function YaaruAvanRules({ onBack }: { onBack: () => void }) {
  const rec = (n: number) => recommendedRoles(n);
  return (
    <div className="relative">
      <div className="pr-12 mb-4">
        <p className={eyebrow}>Rules</p>
        <h2 className="font-display text-2xl font-extrabold text-white leading-tight">How to play</h2>
      </div>

      <Section kicker="The idea" title="Find who is bluffing">
        <p className={p}>
          {MIN_PLAYERS} to {MAX_PLAYERS} players. Everyone is secretly given a role and, usually, a word. Each stop,
          every player says one word or a short phrase about their word. Then the group talks it out and votes one
          person offboard. Their role is revealed, and the next stop begins.
        </p>
      </Section>

      <Section kicker="Each round" title="Step by step">
        <ol className={`${glass} divide-y divide-white/10 text-left`}>
          {[
            'Each player privately looks at their boarding pass: their role and word.',
            'Going round the table, everyone says one word or short phrase about their word. Do not say the word itself.',
            'Talk it out, then everyone votes for who they think is bluffing. The most votes goes offboard and their role is shown.',
            'If a Pickpocket goes offboard, they get one last guess at the Tourists\' word. The group judges it.',
            'Repeat from step 2 with the players still aboard, until a side wins.',
          ].map((t, i) => (
            <li key={i} className="flex gap-3 px-3 py-2.5 text-[13px] text-cream/75">
              <span className="w-5 shrink-0 font-bold text-gold-300 tabular-nums">{i + 1}</span>
              <span>{t}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section kicker="Normal roles" title="Tourist, Stranger, Pickpocket">
        <div className="space-y-2">
          {CORE_ROLES.map(r => (
            <div key={r.name} className={`${glass} px-3 py-2.5`}>
              <p className={`font-display font-extrabold ${r.tone}`}>{r.name}</p>
              <p className={p}>{r.body}</p>
            </div>
          ))}
        </div>
        <p className={`${p} mt-2`}>
          Tourists always outnumber the sneaky side (Strangers plus Pickpockets). There is at least one Stranger or one
          Pickpocket. Pickpockets: up to 1, or up to {maxPickpockets(10)} with 10 or more players. Suggested split:
          {' '}{MIN_PLAYERS} to 4 players {rec(4).strangers} Stranger; 5 to 7 players {rec(5).strangers} Stranger and {rec(5).pickpockets} Pickpocket;
          {' '}8 to 10 players {rec(8).strangers} Strangers and {rec(8).pickpockets} Pickpocket; 11 or more players {rec(11).strangers} Strangers and {rec(11).pickpockets} Pickpocket.
        </p>
      </Section>

      <Section kicker="Winning" title="Who wins the round">
        <ul className="space-y-1.5 text-[13px] text-cream/75 list-disc pl-5">
          <li><strong className="text-white">Tourists win</strong> when every Stranger and Pickpocket has been voted offboard.</li>
          <li><strong className="text-white">The sneaky side wins</strong> when only one Tourist is left aboard.</li>
          <li><strong className="text-white">A Pickpocket wins on the spot</strong> by correctly guessing the Tourists&apos; word after being voted off.</li>
        </ul>
      </Section>

      <Section kicker="Ties" title="When the vote is tied">
        <ul className="space-y-1.5 text-[13px] text-cream/75 list-disc pl-5">
          <li>If the Goddess of Justice is in the game, she decides who goes, even if she is already offboard.</li>
          <li>Otherwise the tied players each describe once more, then the others vote again among them. The tied players sit that vote out.</li>
          <li>If it is still tied, the host decides.</li>
        </ul>
      </Section>

      <Section kicker="Points" title="How points are shared">
        <div className={`${glass} divide-y divide-white/10`}>
          {[
            ['Tourists win', `Every Tourist +${POINTS.touristWin}`],
            ['Stranger still aboard when the sneaky side wins', `+${POINTS.strangerSurvive}`],
            ['Pickpocket still aboard when the sneaky side wins', `+${POINTS.pickpocketSurvive}`],
            ['Pickpocket guesses the Tourists\' word', `+${POINTS.pickpocketSteal}`],
            ['Everyone else that round', '0'],
          ].map(([a, b]) => (
            <div key={a} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
              <span className="text-cream/75">{a}</span>
              <span className="font-bold text-gold-300 tabular-nums shrink-0">{b}</span>
            </div>
          ))}
        </div>
        <p className={`${p} mt-2`}>
          Points add up across rounds. At the end, awards go to the Best Bluffer (most rounds survived as a Stranger),
          the Sharpest Detective (most correct votes), the Silent Assassin (most Pickpocket steals) and Lost in
          Translation (most wrong votes).
        </p>
      </Section>

      <Section kicker="Special roles" title="Optional extras">
        <p className={`${p} mb-2`}>
          The host can switch these on. A special role sits on top of a normal role, so a Tourist, Stranger or Pickpocket
          can have one. Each player gets at most one, and there is at most one special per 3 players (5 players gives 1,
          9 players gives 3). A pair, like the Lovers, counts as one. The Joy Fool and the Revenger are never given to a Pickpocket. The Retriever is Tourist-only and needs 2+ Strangers at the deal; Pickpockets do not count. They stay secret, except the Goddess of Justice,
          who is announced to everyone once the words are dealt, and the Retriever, who is revealed once the power is used.
        </p>
        <div className="space-y-2">
          {SPECIALS.map(s => (
            <div key={s.id} className={`${glass} px-3 py-2.5`}>
              <p className="font-display font-extrabold text-white">
                <span aria-hidden="true">{s.emoji}</span> {s.name}
                {s.pair && <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-cream/50">two players</span>}
              </p>
              <p className={p}>{SPECIAL_BLURB[s.id]}</p>
            </div>
          ))}
        </div>
        <p className={`${p} mt-2`}>
          Bonus points from specials: the Joy Fool gets +{CLOWN_POINTS} if they are the first player voted out. Of the
          Duelists, the first one voted out loses {RIVAL_POINTS} and the other gains {RIVAL_POINTS}. These are added on
          top of the normal round points. A retrieved elimination no longer counts for either bonus.
        </p>
        <p className={`${p} mt-2`}>
          A round runs from dealing words until one side wins; a game can contain several rounds.
          The Retriever can bring back only the Tourist just voted out, never an earlier player,
          a revenge victim or a Lover who left with their partner. A returned Lover comes back alone.
          The returned Tourist keeps their word and can describe and vote again. A fresh round resets the power.
          If the Retriever leaves, everyone sees their role and that the power is lost.
        </p>
      </Section>

      <button type="button" onClick={onBack} className={ghostBtn}><ArrowLeft size={16} weight="bold" /> Back</button>
    </div>
  );
}
