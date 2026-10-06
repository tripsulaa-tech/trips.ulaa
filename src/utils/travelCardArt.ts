// Travel Cards artwork chosen in Logo Studio → Site logos → Travel cards. Each piece is
// optional: when nothing is chosen the renderers keep using the files in /public/travel-card.
import { ensureBrandingFresh, getBrandingState } from '../hooks/useBranding';

export interface TravelCardArt {
  /** Full badge artwork (square, drawn inside the round badge). */
  badge: string;
  /** Full card front artwork; the name and role label are drawn on top. */
  front: string;
  /** Full card back artwork; the back-card text lines are drawn on top. */
  back: string;
}

export async function getTravelCardArt(): Promise<TravelCardArt> {
  await ensureBrandingFresh().catch(() => {});
  const b = getBrandingState();
  return { badge: b.badge_art, front: b.card_front_art, back: b.card_back_art };
}

const images = new Map<string, Promise<HTMLImageElement>>();

/** Loads a stored artwork image so it can be drawn on a canvas without tainting it. */
export function loadArtImage(url: string): Promise<HTMLImageElement> {
  let p = images.get(url);
  if (!p) {
    p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not load the Travel Cards artwork from Logo Studio.'));
      img.src = url;
    });
    images.set(url, p);
    p.catch(() => images.delete(url));
  }
  return p;
}

/** Draws `img` to fill the whole canvas (centred, cropped like CSS object-fit: cover). */
export function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const k = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * k;
  const dh = img.naturalHeight * k;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}
