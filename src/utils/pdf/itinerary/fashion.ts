import type { PdfCtx } from './context';
import type { PdfTrip } from './shared';
import { MARGIN, CONTENT_W, COLORS } from './shared';

  // =========================================================================
  // SLIDE — Fashion Aesthetics (photo grid)
  // =========================================================================
  // Same shape as `renderGallery` above (optional intro paragraph + a fixed,
  // non-paginated square photo wall via `drawSquarePhotoWall`).
  export async function renderFashion(ctx: PdfCtx, trip: PdfTrip): Promise<void> {
  const { newSlide, slideHeader, drawParagraph, drawSquarePhotoWall } = ctx;

    const allPhotos = trip.fashion_photos ?? [];
    if (allPhotos.length === 0) return;

    newSlide();
    slideHeader(null, 'Fashion Aesthetics');

    let contentTop = 92;
    if (trip.fashion_description) {
      contentTop = drawParagraph(trip.fashion_description, MARGIN, contentTop, CONTENT_W, {
        size: 10,
        color: COLORS.darkMuted,
        lineHeight: 14,
        maxLines: 2,
      }) + 14;
    }

    await drawSquarePhotoWall(allPhotos, contentTop);
  }
