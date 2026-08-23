import type { PdfCtx } from './context';
import type { PdfTrip } from './shared';
import { MARGIN, CONTENT_W, CONTENT_BOTTOM, COLORS, loadCoverCroppedImage } from './shared';

  // =========================================================================
  // SLIDE — Places You'll Definitely Post (photo grid)
  // =========================================================================
  // Falls back to the plain `gallery_images` string list when the richer
  // `gallery_items` (photo + caption) field is empty, matching the same
  // fallback TripDetailPage.tsx uses for this section on the public site.
  // Only the first 8 photos are shown — the reference layout is a fixed
  // 4-across, 2-row wall of square photos, not a paginated list.
  export async function renderGallery(ctx: PdfCtx, trip: PdfTrip): Promise<void> {
  const { doc, setFill, setDraw, newSlide, slideHeader, drawParagraph, centeredTop } = ctx;

    const allPhotos: string[] =
      (trip.gallery_items?.length ?? 0) > 0
        ? trip.gallery_items!.map(item => item.photo)
        : trip.gallery_images;
    if (allPhotos.length === 0) return;

    newSlide();
    slideHeader(null, "Places You'll Definitely Post");

    let contentTop = 92;
    if (trip.gallery_description) {
      contentTop = drawParagraph(trip.gallery_description, MARGIN, contentTop, CONTENT_W, {
        size: 10,
        color: COLORS.darkMuted,
        lineHeight: 14,
        maxLines: 2,
      }) + 14;
    }

    const cols = 4;
    const rows = 2;
    const colGap = 14;
    const rowGap = 14;
    const photos = allPhotos.slice(0, cols * rows);

    // Square size is whichever of width- or height-driven fits smaller, so
    // the grid always stays made of true squares. The grid itself is left-
    // aligned to MARGIN (not centered) — when height is the binding
    // constraint, any leftover width just sits to the right of the grid
    // rather than splitting evenly on both sides.
    const squareByWidth = (CONTENT_W - colGap * (cols - 1)) / cols;
    const availH = CONTENT_BOTTOM - contentTop;
    const squareByHeight = (availH - rowGap * (rows - 1)) / rows;
    const square = Math.min(squareByWidth, squareByHeight);

    const gridH = rows * square + rowGap * (rows - 1);
    const gridX = MARGIN;
    const gridY = centeredTop(contentTop, CONTENT_BOTTOM, gridH);

    const crops = await Promise.all(photos.map(url => loadCoverCroppedImage(url, square, square, 8)));

    crops.forEach((cropped, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const x = gridX + col * (square + colGap);
      const y = gridY + row * (square + rowGap);
      if (cropped) {
        try {
          doc.addImage(cropped, 'JPEG', x, y, square, square);
          return;
        } catch {
          /* fall through to placeholder */
        }
      }
      setFill(COLORS.backgroundWarm);
      doc.roundedRect(x, y, square, square, 8, 8, 'F');
      setDraw(COLORS.grayLineSoft);
      doc.setLineWidth(0.75);
      doc.roundedRect(x, y, square, square, 8, 8, 'S');
    });
  }
