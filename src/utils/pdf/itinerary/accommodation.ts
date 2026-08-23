import type { PdfCtx } from './context';
import type { PdfTrip } from './shared';
import { MARGIN, CONTENT_W, COLORS } from './shared';

  // =========================================================================
  // SLIDE — Accommodation (photo grid) — "Stay. Relax. Repeat."
  // =========================================================================
  // Same shape/theme as `renderFashion` below (square photo wall via
  // `drawSquarePhotoWall`) but for the trip's handpicked accommodation
  // photos. Sits right before "What's Included" in the slide order. Falls
  // back to a default tagline when the trip has no admin-entered
  // accommodation_description.
  export async function renderAccommodation(ctx: PdfCtx, trip: PdfTrip): Promise<void> {
  const { newSlide, slideHeader, drawParagraph, drawSquarePhotoWall } = ctx;

    const allPhotos = trip.accommodation_photos ?? [];
    if (allPhotos.length === 0) return;

    newSlide();
    slideHeader(null, 'Stay. Relax. Repeat.');

    const description = trip.accommodation_description
      || 'More than just a place to stay—these handpicked accommodations are where you\'ll relax, laugh, share stories, and create unforgettable memories with your travel sisters.';

    const contentTop = drawParagraph(description, MARGIN, 92, CONTENT_W, {
      size: 10,
      color: COLORS.darkMuted,
      lineHeight: 14,
      maxLines: 2,
    }) + 14;

    await drawSquarePhotoWall(allPhotos, contentTop);
  }
