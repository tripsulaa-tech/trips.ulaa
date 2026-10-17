import type { ReactNode } from 'react';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';
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
  ok: { chip: 'bg-success-bg text-success-fg', dot: 'bg-green-600' },
  warn: { chip: 'bg-warning-bg text-warning-fg', dot: 'bg-amber-500' },
  idle: { chip: 'bg-background-warm/70 text-dark-muted', dot: 'bg-dark-muted/50' },
};

/** Shown in place of a game's tile while it can't start yet (no trip picked, too few players). */
/** Looks like the game's own tile (same dark card, medallion and rounded Play pill) but dimmed and not tappable. */
export const EmptyGame = ({ title, iconSrc, Icon, children }: { title: string; iconSrc?: string; Icon?: PhosphorIcon; children: ReactNode }) => (
  <div aria-disabled="true" className="relative w-full rounded-md overflow-hidden text-left text-cream bg-gradient-to-br from-dark to-footer border border-gold/30 p-2.5 flex items-center gap-3 opacity-60 select-none">
    <span className="relative w-11 h-11 shrink-0 rounded-xl bg-gradient-to-br from-gold-300 to-gold text-dark flex items-center justify-center" aria-hidden="true">
      {iconSrc ? <img src={iconSrc} alt="" className="w-6 h-6 object-contain" draggable={false} /> : Icon && <Icon size={24} weight="duotone" />}
    </span>
    <span className="relative block min-w-0 flex-1">
      <span className="block font-display text-[15px] font-extrabold leading-tight text-white">{title}</span>
      <span className="block text-[11px] text-cream/60 truncate">{children}</span>
    </span>
    <span className="relative shrink-0 rounded-full bg-white/10 border border-white/20 px-3.5 py-1.5 text-xs font-bold text-gold-300">Play</span>
  </div>
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
    <div className="h-full bg-white rounded-md shadow-card p-3 sm:p-4 flex flex-col gap-3">
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
