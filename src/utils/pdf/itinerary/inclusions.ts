import { CheckCircle, XCircle } from 'lucide-react';
import type { PdfCtx } from './context';
import type { RGB, PdfListItem, PdfTrip } from './shared';
import type { TripIncludedGroup } from '../../../types/types-index';
import { MARGIN, CONTENT_W, CONTENT_BOTTOM, COLORS, CONFIDENCE_PALETTE } from './shared';
import { getTripHighlightIcon } from '../../../constants/tripHighlightIcons';

/** Renders "What's Included" / "What's Not Included". Extracted from
 *  tripItineraryPdf.ts. */
export async function renderInclusions(ctx: PdfCtx, trip: PdfTrip): Promise<void> {
  const { doc, setFill, setText, newSlide, clampLines, slideHeader, drawLucideIcon, drawBulletList } = ctx;

  // =========================================================================
  // SLIDE — What's Included / What's Not Included, matching the live trip
  // page's own layout:
  //   - What's Included: when the trip has grouped content (included_groups
  //     — icon + heading + bulleted sub-items), draw those as 2-up cards.
  //     Falls back to a plain icon-card grid of included_items when the
  //     trip has no groups.
  //   - What's Not Included: wrapped pill chips (icon + label), same as the
  //     flex-wrap chip row on the site.
  // "What's Included" renders first, "What's Not Included" directly below
  // it, on the same slide when both fit — otherwise each section paginates
  // onto its own slide(s) independently.
  // =========================================================================
  const SECTION_TITLE_H = 26;
  const SECTION_GAP = 18;

  function drawSectionHeading(title: string, y: number) {
    setText(COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(title, MARGIN, y + 11);
  }

  // ---- "What's Included" — grouped cards (heading + bullets, no icon) ----
  const GROUP_COLS = 2;
  const GROUP_COL_GAP = 16;
  const GROUP_ROW_GAP = 10;
  const GROUP_CARD_PAD = 12;

  function groupCardW(): number {
    return (CONTENT_W - GROUP_COL_GAP * (GROUP_COLS - 1)) / GROUP_COLS;
  }

  function measureGroupCardH(group: TripIncludedGroup, cardW: number): number {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.8);
    const bulletsW = cardW - GROUP_CARD_PAD * 2 - 10;
    const bulletsH = group.bullets.reduce((sum, item) => sum + doc.splitTextToSize(item, bulletsW).length * 12, 0);
    const headingBlockH = 28;
    return GROUP_CARD_PAD * 2 + headingBlockH + bulletsH;
  }

  async function drawGroupCard(group: TripIncludedGroup, x: number, y: number, w: number, h: number, index: number): Promise<void> {
    setFill(COLORS.backgroundWarm);
    doc.roundedRect(x, y, w, h, 10, 10, 'F');

    // Admin-picked group icon (same TripHighlightIconDisplay pastel circle
    // the site shows next to the heading) — only drawn when the group
    // actually has one set, matching the site's `group.icon &&` guard.
    const meta = group.icon ? getTripHighlightIcon(group.icon) : undefined;
    const headingX = meta ? x + GROUP_CARD_PAD + 26 : x + GROUP_CARD_PAD;

    setText(COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.text(group.heading, headingX, y + GROUP_CARD_PAD + 10);

    const bulletsTop = y + GROUP_CARD_PAD + 28;
    drawBulletList(group.bullets, x + GROUP_CARD_PAD, bulletsTop, w - GROUP_CARD_PAD * 2, {
      size: 8.8,
      color: COLORS.darkMuted,
      lineHeight: 12,
    });

    if (!meta) return;
    const { bg, fg } = CONFIDENCE_PALETTE[index % CONFIDENCE_PALETTE.length];
    const iconCx = x + GROUP_CARD_PAD + 10;
    const iconCy = y + GROUP_CARD_PAD + 5;
    setFill(bg);
    doc.circle(iconCx, iconCy, 11, 'F');
    await drawLucideIcon(meta.Icon, iconCx - 8, iconCy + 8, 16, fg);
  }

  type GroupPos = { group: TripIncludedGroup; x: number; y: number; w: number; h: number; index: number };

  /** True masonry packing, not fixed row-pairs: each card keeps its own
   *  natural height (never stretched to match a neighbour), and each group
   *  in turn drops into whichever column currently has the most room used
   *  up the least — so a short card and a tall card don't get force-paired
   *  into one row (wasting space under the short one), and a later short
   *  card can backfill space next to an earlier tall one. Places as many
   *  groups as fit under `maxBottom` starting from `top`; the caller
   *  continues anything left over on a fresh page. Pass `maxBottom =
   *  Infinity` to lay out (or just measure) a whole list with no page
   *  break, which is what `groupGridH`/`drawGroupGrid` below do for the
   *  common case where everything already fits on one slide. */
  function packGroupsMasonry(
    groups: TripIncludedGroup[],
    cardW: number,
    top: number,
    maxBottom: number,
    indexOffset: number,
  ): { positions: GroupPos[]; placed: number; bottom: number } {
    const colX = Array.from({ length: GROUP_COLS }, (_, c) => MARGIN + c * (cardW + GROUP_COL_GAP));
    const colY = Array.from({ length: GROUP_COLS }, () => top);
    const positions: GroupPos[] = [];
    let placed = 0;
    for (let i = 0; i < groups.length; i++) {
      const h = measureGroupCardH(groups[i], cardW);
      const col = colY.indexOf(Math.min(...colY));
      const y = colY[col];
      if (y + h > maxBottom) break;
      positions.push({ group: groups[i], x: colX[col], y, w: cardW, h, index: indexOffset + i });
      colY[col] = y + h + GROUP_ROW_GAP;
      placed++;
    }
    const bottom = groups.length ? Math.max(...colY) - GROUP_ROW_GAP : top;
    return { positions, placed, bottom };
  }

  function groupGridH(groups: TripIncludedGroup[]): number {
    if (groups.length === 0) return 0;
    const { bottom } = packGroupsMasonry(groups, groupCardW(), 0, Infinity, 0);
    return bottom;
  }

  /** Draws a masonry-packed list that's already known to fit in the space
   *  available (no page breaks) — used both for the common single-slide
   *  case and for each already-sliced page in the paginated path below. */
  async function drawGroupGrid(groups: TripIncludedGroup[], top: number, indexOffset = 0): Promise<number> {
    const { positions, bottom } = packGroupsMasonry(groups, groupCardW(), top, Infinity, indexOffset);
    for (const pos of positions) {
      await drawGroupCard(pos.group, pos.x, pos.y, pos.w, pos.h, pos.index);
    }
    return bottom;
  }

  /** Multi-page version: masonry-packs groups starting at `top` on the
   *  current slide, spilling onto additional "(continued)" slides for
   *  whatever doesn't fit — each page independently packed to its own
   *  actual content, not a size borrowed from elsewhere in the list. */
  /** Returns the y position immediately below the last group placed, so the
   *  caller can pack "What's Not Included" onto the same trailing page
   *  instead of always starting a fresh one. */
  async function drawGroupsMasonryPaginated(groups: TripIncludedGroup[], top: number): Promise<number> {
    const cardW = groupCardW();
    let remaining = groups;
    let indexCursor = 0;
    let pageNum = 0;
    let lastBottom = top;
    while (remaining.length > 0) {
      newSlide();
      slideHeader(null, pageNum === 0 ? "What's Included" : "What's Included (continued)");
      const { positions, placed, bottom } = packGroupsMasonry(remaining, cardW, top, CONTENT_BOTTOM, indexCursor);
      if (placed === 0) {
        // A single group taller than a whole page — place it alone rather
        // than looping forever; it'll simply run past the page bottom.
        const h = measureGroupCardH(remaining[0], cardW);
        await drawGroupCard(remaining[0], MARGIN, top, cardW, h, indexCursor);
        lastBottom = top + h;
        remaining = remaining.slice(1);
        indexCursor += 1;
      } else {
        for (const pos of positions) {
          await drawGroupCard(pos.group, pos.x, pos.y, pos.w, pos.h, pos.index);
        }
        lastBottom = bottom;
        remaining = remaining.slice(placed);
        indexCursor += placed;
      }
      pageNum++;
    }
    return lastBottom;
  }

  // ---- "What's Included" fallback — flat icon-card grid, used only when
  // the trip has no included_groups (just included_items) ----
  const FLAT_CARD_H = 78;
  const FLAT_ROW_GAP = 10;
  const FLAT_PER_ROW = 3;

  async function drawFlatIncludedCard(item: PdfListItem, x: number, y: number, w: number, h: number, index: number) {
    setFill(COLORS.backgroundWarm);
    doc.roundedRect(x, y, w, h, 10, 10, 'F');

    const cx = x + w / 2;
    const iconCy = y + 22;
    // Mirrors the site exactly: an admin-picked icon (in its pastel
    // TripHighlightIconDisplay circle) when the item has one, else the
    // plain green CheckCircle fallback.
    const meta = item.icon ? getTripHighlightIcon(item.icon) : undefined;
    if (meta) {
      const { bg, fg } = CONFIDENCE_PALETTE[index % CONFIDENCE_PALETTE.length];
      setFill(bg);
      doc.circle(cx, iconCy, 11, 'F');
      await drawLucideIcon(meta.Icon, cx - 8, iconCy + 8, 16, fg);
    } else {
      // Matches the site's exact fallback styling: a pale green-100 circle
      // with a green-600 CheckCircle icon (not solid green/white).
      setFill(GREEN_100);
      doc.circle(cx, iconCy, 11, 'F');
      await drawLucideIcon(CheckCircle, cx - 8, iconCy + 8, 16, GREEN_600);
    }

    setText(COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.2);
    const lines = clampLines(item.description, w - 20, 3);
    doc.text(lines, cx, iconCy + 22, { align: 'center', lineHeightFactor: 1.3 });
  }

  function flatGridH(count: number): number {
    if (count === 0) return 0;
    const rows = Math.ceil(count / FLAT_PER_ROW);
    return rows * FLAT_CARD_H + Math.max(0, rows - 1) * FLAT_ROW_GAP;
  }

  async function drawFlatGrid(items: PdfListItem[], top: number, indexOffset = 0): Promise<number> {
    const colGap = 20;
    const cardW = (CONTENT_W - colGap * (FLAT_PER_ROW - 1)) / FLAT_PER_ROW;
    for (let i = 0; i < items.length; i++) {
      const row = Math.floor(i / FLAT_PER_ROW);
      const col = i % FLAT_PER_ROW;
      const x = MARGIN + col * (cardW + colGap);
      const y = top + row * (FLAT_CARD_H + FLAT_ROW_GAP);
      await drawFlatIncludedCard(items[i], x, y, cardW, FLAT_CARD_H, indexOffset + i);
    }
    const rows = Math.ceil(items.length / FLAT_PER_ROW);
    return top + rows * FLAT_CARD_H + Math.max(0, rows - 1) * FLAT_ROW_GAP;
  }

  // ---- "What's Not Included" — wrapped pill chips ----
  const CHIP_H = 24;
  const CHIP_GAP_X = 8;
  const CHIP_GAP_Y = 8;
  const CHIP_PAD_X = 12;
  const CHIP_ICON_R = 5.5;

  function chipWidth(text: string): number {
    return doc.getTextWidth(text) + CHIP_PAD_X * 2 + CHIP_ICON_R * 2 + 6;
  }

  function measureChipRowH(items: string[]): number {
    if (items.length === 0) return 0;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    let x = 0;
    let rows = 1;
    items.forEach(item => {
      const w = chipWidth(item);
      if (x > 0 && x + w > CONTENT_W) {
        rows++;
        x = 0;
      }
      x += w + CHIP_GAP_X;
    });
    return rows * CHIP_H + Math.max(0, rows - 1) * CHIP_GAP_Y;
  }

  // Not-included items always use XCircle (red-400), regardless of any
  // per-item icon field — the site never wires an icon picker into this
  // section either (see the "What's Not Included" chip row in
  // TripDetailPage.tsx), so this is already a faithful match.
  const NOT_INCLUDED_RED: RGB = [248, 113, 113];
  // Tailwind green-100 / green-600 — matches the site's exact fallback
  // styling for an included item with no admin-picked icon.
  const GREEN_100: RGB = [220, 252, 231];
  const GREEN_600: RGB = [22, 163, 74];

  async function drawChipRow(items: string[], top: number): Promise<number> {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    let x = MARGIN;
    let y = top;
    for (const item of items) {
      const w = chipWidth(item);
      if (x > MARGIN && x + w > MARGIN + CONTENT_W) {
        x = MARGIN;
        y += CHIP_H + CHIP_GAP_Y;
      }
      setFill(COLORS.backgroundWarm);
      doc.roundedRect(x, y, w, CHIP_H, CHIP_H / 2, CHIP_H / 2, 'F');

      const iconCx = x + CHIP_PAD_X + CHIP_ICON_R;
      const iconCy = y + CHIP_H / 2;
      await drawLucideIcon(XCircle, iconCx - CHIP_ICON_R, iconCy + CHIP_ICON_R, CHIP_ICON_R * 2, NOT_INCLUDED_RED);

      setText(COLORS.dark);
      doc.text(item, iconCx + CHIP_ICON_R + 8, iconCy + 3.2);
      x += w + CHIP_GAP_X;
    }
    return y + CHIP_H;
  }

  async function run() {
    const hasGroups = trip.included_groups.length > 0;
    const hasFlatIncluded = !hasGroups && trip.included.length > 0;
    const hasIncluded = hasGroups || hasFlatIncluded;
    const hasNotIncluded = trip.not_included.length > 0;
    if (!hasIncluded && !hasNotIncluded) return;

    const top = 92;
    const availH = CONTENT_BOTTOM - top;
    const includedH = hasIncluded
      ? SECTION_TITLE_H + (hasGroups ? groupGridH(trip.included_groups) : flatGridH(trip.included.length))
      : 0;
    const notIncludedH = hasNotIncluded ? SECTION_TITLE_H + measureChipRowH(trip.not_included) : 0;
    const gapBetween = hasIncluded && hasNotIncluded ? SECTION_GAP : 0;

    // Both sections fit stacked on one slide — the common case.
    if (includedH + gapBetween + notIncludedH <= availH) {
      newSlide();
      slideHeader(null, "What's Included & Not Included");
      let y = top;
      if (hasIncluded) {
        drawSectionHeading("What's Included", y);
        y += SECTION_TITLE_H;
        y = hasGroups ? await drawGroupGrid(trip.included_groups, y) : await drawFlatGrid(trip.included, y);
        y += gapBetween;
      }
      if (hasNotIncluded) {
        drawSectionHeading("What's Not Included", y);
        y += SECTION_TITLE_H;
        await drawChipRow(trip.not_included, y);
      }
      return;
    }

    // Too tall for one slide — paginate each section independently, each
    // getting its own slide(s), so long lists never overflow or get cut off.
    // Whichever section's pagination runs last tracks how much room is left
    // on its trailing page, so "What's Not Included" can reuse it instead
    // of always claiming a fresh slide.
    let lastBottom = top;
    if (hasGroups) {
      // True masonry packing across as many "(continued)" slides as needed
      // — see drawGroupsMasonryPaginated / packGroupsMasonry above. Each
      // card keeps its own natural height and flows into whichever column
      // has room, rather than being force-paired into equal-height rows.
      lastBottom = await drawGroupsMasonryPaginated(trip.included_groups, top);
    } else if (hasFlatIncluded) {
      const rowsPerPage = Math.max(1, Math.floor((availH - SECTION_TITLE_H) / (FLAT_CARD_H + FLAT_ROW_GAP)));
      const perPage = rowsPerPage * FLAT_PER_ROW;
      for (let i = 0; i < trip.included.length; i += perPage) {
        newSlide();
        slideHeader(null, i === 0 ? "What's Included" : "What's Included (continued)");
        lastBottom = await drawFlatGrid(trip.included.slice(i, i + perPage), top, i);
      }
    }

    if (hasNotIncluded) {
      const chipsH = SECTION_TITLE_H + measureChipRowH(trip.not_included);
      // Reuse the leftover space at the bottom of the included list's last
      // page when it fits, instead of unconditionally starting a fresh
      // slide just for the not-included chips.
      if (hasIncluded && lastBottom + SECTION_GAP + chipsH <= CONTENT_BOTTOM) {
        let y = lastBottom + SECTION_GAP;
        drawSectionHeading("What's Not Included", y);
        y += SECTION_TITLE_H;
        await drawChipRow(trip.not_included, y);
      } else {
        newSlide();
        slideHeader(null, "What's Not Included");
        await drawChipRow(trip.not_included, top);
      }
    }
  }

  await run();
}
