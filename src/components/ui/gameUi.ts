// Shared styling + share helper for the Coming Soon mini-games.

export const GOLD_GRAD_TEXT = 'bg-gradient-to-b from-[#FFF6CC] via-[#F0CE7A] to-gold bg-clip-text text-transparent';

export const primaryBtn = 'w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-primary-light to-primary hover:brightness-110 active:scale-[0.98] text-white font-button font-semibold py-3.5 shadow-[0_10px_24px_rgba(168,90,42,0.45)] transition';
export const ghostBtn = 'w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-white/10 hover:bg-white/15 active:scale-[0.98] border border-white/15 text-cream font-button font-semibold py-3 transition disabled:opacity-60';
export const iconBtn = 'w-10 h-10 rounded-full bg-white/10 border border-white/15 text-cream/80 hover:text-white hover:bg-white/15 flex items-center justify-center transition-colors';
export const glass = 'rounded-2xl bg-white/[0.06] border border-white/10';
export const eyebrow = 'text-[10px] font-bold uppercase tracking-[0.18em] text-cream/50';

/** Shares the score-card PNG (native share sheet where files are supported,
 *  otherwise saves it so it can be posted). Falls back to plain text. */
export async function shareCardImage(
  blob: Blob | null,
  opts: { filename: string; title: string; text: string; fallbackLink: string },
) {
  if (blob) {
    const file = new File([blob], opts.filename, { type: 'image/png' });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: opts.title, text: opts.text });
        return;
      }
    } catch { return; /* user closed the share sheet */ }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = opts.filename;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return;
  }
  try {
    if (navigator.share) { await navigator.share({ title: opts.title, text: opts.text }); return; }
  } catch { return; }
  window.open(opts.fallbackLink, '_blank', 'noopener,noreferrer');
}

// ── Player name (kept on this device only; shown on the score card the player shares) ──
const PLAYER_KEY = 'ulaa:games:player';
export const MAX_NAME = 18;

/** Trims, collapses spaces and strips control characters. */
export function cleanName(raw?: string | null): string {
  const noControl = [...(raw ?? '')].filter(ch => {
    const c = ch.charCodeAt(0);
    return c > 31 && c !== 127;
  }).join('');
  return noControl.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
}

export function loadPlayerName(): string {
  try { return cleanName(localStorage.getItem(PLAYER_KEY)); } catch { return ''; }
}

export function savePlayerName(name: string) {
  try {
    const n = cleanName(name);
    if (n) localStorage.setItem(PLAYER_KEY, n); else localStorage.removeItem(PLAYER_KEY);
  } catch { /* not remembered */ }
}
