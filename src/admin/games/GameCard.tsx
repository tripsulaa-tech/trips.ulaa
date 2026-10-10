import type { ReactNode } from 'react';
import { ShareNetwork, Copy, WhatsappLogo } from '@phosphor-icons/react';
import { useToast } from '../../components/ui/useToast';

// One game under Admin -> Games -> Play: the game's tile (tap to play here),
// a one-line status, then a share row. The share buttons share the row equally
// so they are easy to hit on a phone; on desktop the card simply sits in the grid.
interface GameCardProps {
  /** The game's tile (use its `row` look), or a short message when it can't start yet. */
  game: ReactNode;
  /** The link to share. Omit while there is none yet. */
  url?: string;
  shareText?: string;
  shareTitle: string;
  /** Shown in the button row before the link exists (e.g. "Make share link"). */
  action?: ReactNode;
  /** A short state under the tile, e.g. "14 players ready". */
  status?: { tone: 'ok' | 'warn' | 'idle'; text: string };
  /** One small line under the buttons. */
  note?: ReactNode;
  /** Under the note (e.g. "Update link"). */
  footer?: ReactNode;
}

export const smallBtn = 'inline-flex items-center justify-center gap-1.5 text-xs font-button font-semibold px-3 h-10 sm:h-9 rounded-lg border-2 border-background-warm text-dark hover:border-primary/40 active:bg-background-warm/60 transition-colors disabled:opacity-50';
export const primaryBtn = 'inline-flex items-center justify-center gap-1.5 text-xs font-button font-semibold px-3 h-10 sm:h-9 rounded-lg bg-primary text-white hover:opacity-90 active:opacity-80 transition-opacity disabled:opacity-50';

const TONE: Record<NonNullable<GameCardProps['status']>['tone'], { chip: string; dot: string }> = {
  ok: { chip: 'bg-green-50 text-green-800', dot: 'bg-green-600' },
  warn: { chip: 'bg-amber-50 text-amber-800', dot: 'bg-amber-500' },
  idle: { chip: 'bg-background-warm/70 text-dark-muted', dot: 'bg-dark-muted/50' },
};

/** Shown in place of a game's tile while it can't start yet (no trip picked, too few players). */
export const EmptyGame = ({ children }: { children: ReactNode }) => (
  <p className="rounded-2xl border border-dashed border-background-warm bg-background-warm/30 px-4 py-5 text-center text-sm text-dark-muted">{children}</p>
);

export default function GameCard({ game, url, shareText = '', shareTitle, action, status, note, footer }: GameCardProps) {
  const toast = useToast();
  const copyLink = async () => {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); toast.success('Link copied.'); }
    catch { toast.error("Couldn't copy the link. Please try again."); }
  };
  const shareNative = async () => {
    if (!url) return;
    try { await navigator.share({ title: shareTitle, text: shareText, url }); }
    catch { /* cancelled */ }
  };
  const canNativeShare = typeof navigator.share === 'function';
  const hasShare = !!(action || url);

  return (
    <div className="h-full bg-white rounded-2xl shadow-card p-3 sm:p-4 flex flex-col gap-3">
      {game}
      {status && (
        <p role="status" className={`self-start inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${TONE[status.tone].chip}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${TONE[status.tone].dot}`} aria-hidden="true" />
          {status.text}
        </p>
      )}
      {hasShare && (
        <div className="border-t border-background-warm pt-3 space-y-2">
          <div className="flex items-center gap-2">
            {action && <span className="flex-1 flex [&>button]:flex-1">{action}</span>}
            {url && (
              <>
                <button type="button" onClick={() => void copyLink()} className={`${smallBtn} flex-1`}><Copy size={15} aria-hidden="true" /> Copy link</button>
                <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" className={`${primaryBtn} flex-1`}><WhatsappLogo size={15} weight="fill" aria-hidden="true" /> WhatsApp</a>
                {canNativeShare && (
                  <button type="button" onClick={() => void shareNative()} className={`${smallBtn} w-10 sm:w-9 !px-0 shrink-0`} aria-label="More sharing options"><ShareNetwork size={16} aria-hidden="true" /></button>
                )}
              </>
            )}
          </div>
          {note && <p className="text-xs text-dark-muted leading-snug">{note}</p>}
        </div>
      )}
      {!hasShare && note && <p className="text-xs text-dark-muted leading-snug">{note}</p>}
      {footer}
    </div>
  );
}
