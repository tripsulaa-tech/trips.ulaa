import type { PdfCtx } from './context';
import type { RGB, PdfTrip } from './shared';
import { MARGIN, CONTENT_W, CONTENT_BOTTOM, COLORS, CONFIDENCE_PALETTE, resolveIcon, getThingsToCarryFallbackIcon } from './shared';
import { getTripHighlightIcon } from '../../../constants/tripHighlightIcons';
import { formatAgeRange } from '../../utils-index';

  // =========================================================================
  // SLIDE — Travel with Confidence (left) | Things to Carry (right), with
  // compact Meeting Point / Eligibility cards anchored along the bottom.
  // =========================================================================
  // A single split slide rather than several separate ones — divided by a
  // vertical rule down the middle, matching the reference screenshot. Falls
  // back to a single full-width column if only one side has content, and to
  // nothing at all if none of the four sections have data. Icon circles on
  // the left rotate through CONFIDENCE_PALETTE, mirroring the site's own
  // rotating pastel circles for these items (see TripHighlightIconDisplay's
  // base/unfilled state). The two checklist/chip columns don't paginate —
  // if a list is too long to fit above the bottom cards, drawing simply
  // stops rather than overflowing the slide.
  export async function renderConfidenceAndCarry(ctx: PdfCtx, trip: PdfTrip): Promise<void> {
  const { doc, setFill, setText, setDraw, newSlide, clampLines, icons, drawLucideIcon, drawParagraph } = ctx;

    const confidenceItems = trip.confidence_items ?? [];
    const hasConfidence = confidenceItems.length > 0;
    const hasCarry = trip.things_to_carry.length > 0;
    const hasMeetingPoint = !!trip.meeting_point;
    const hasEligibility = trip.min_age != null || trip.max_age != null;
    if (!hasConfidence && !hasCarry && !hasMeetingPoint && !hasEligibility) return;

    newSlide();
    const top = 92;
    const colGap = 40;
    // Either row (checklist/chips up top, or the two info cards along the
    // bottom) can independently need a two-column split, so the shared
    // column geometry reacts to whichever row actually needs it — keeping
    // the vertical rule and column edges aligned across the whole slide.
    const topTwoCol = hasConfidence && hasCarry;
    const cardsTwoCol = hasMeetingPoint && hasEligibility;
    const twoCol = topTwoCol || cardsTwoCol;
    const leftW = twoCol ? (CONTENT_W - colGap) / 2 : CONTENT_W;
    const rightW = leftW;
    const rightX = MARGIN + leftW + colGap;

    // Bottom info cards reserve their own band; the checklist/chip content
    // above is capped to whatever's left so nothing overlaps.
    const hasCards = hasMeetingPoint || hasEligibility;
    const cardH = 116;
    const cardGap = 22;
    const listBottom = hasCards ? CONTENT_BOTTOM - cardH - cardGap : CONTENT_BOTTOM;

    if (hasConfidence) {
      setText(COLORS.dark);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(19);
      doc.text('Travel with Confidence', MARGIN, 46);
      setDraw(COLORS.grayLine);
      doc.setLineWidth(1);
      doc.line(MARGIN, 66, MARGIN + leftW, 66);

      let y = top;
      if (trip.confidence_description) {
        y = drawParagraph(trip.confidence_description, MARGIN, y, leftW, {
          size: 9.5,
          color: COLORS.darkMuted,
          lineHeight: 13.5,
          maxLines: 3,
        }) + 16;
      }

      const circleR = 14;
      const itemGap = 8;
      const textX = MARGIN + circleR * 2 + 14;
      const textW = leftW - (circleR * 2 + 14);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      for (let i = 0; i < confidenceItems.length; i++) {
        // Mirrors the site's `item.icon && <TripHighlightIconDisplay .../>`
        // guard — an item with no icon set gets no icon circle at all, and
        // its text starts flush left instead of indented past one.
        const meta = confidenceItems[i].icon ? getTripHighlightIcon(confidenceItems[i].icon) : undefined;
        const itemTextX = meta ? textX : MARGIN;
        const itemTextW = meta ? textW : leftW;
        const lines: string[] = doc.splitTextToSize(confidenceItems[i].description, itemTextW);
        const rowH = Math.max(meta ? circleR * 2 : 0, lines.length * 13);
        if (y + rowH > listBottom) break;

        const cy = y + rowH / 2;
        if (meta) {
          const { bg, fg } = CONFIDENCE_PALETTE[i % CONFIDENCE_PALETTE.length];
          const cx = MARGIN + circleR;
          setFill(bg);
          doc.circle(cx, cy, circleR, 'F');
          await drawLucideIcon(meta.Icon, cx - circleR * 0.72, cy + circleR * 0.72, circleR * 1.44, fg);
        }

        setText(COLORS.dark);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.text(lines, itemTextX, cy - ((lines.length - 1) * 13) / 2 + 3.5);

        y += rowH + itemGap;
      }
    }

    if (twoCol) {
      setDraw(COLORS.grayLine);
      doc.setLineWidth(1);
      doc.line(rightX - colGap / 2, top - 26, rightX - colGap / 2, CONTENT_BOTTOM);
    }

    if (hasCarry) {
      const carryX = twoCol ? rightX : MARGIN;
      const carryW = twoCol ? rightW : CONTENT_W;
      setText(COLORS.dark);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(19);
      doc.text('Things to Carry', carryX, 46);
      setDraw(COLORS.grayLine);
      doc.setLineWidth(1);
      doc.line(carryX, 66, carryX + carryW, 66);

      // Subtitle sits below the divider line, same as "Travel with
      // Confidence"'s description on the left column.
      setText(COLORS.darkMuted);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.text('Pack smart. Travel light. Stay ready.', carryX, top);

      // Auto-width, single-line wrapped pill chips — mirrors the site's
      // exact "Things to Carry" chip markup (inline-flex, bg-background-warm/60,
      // rounded-lg, icon + whitespace-nowrap label sized to its own content)
      // instead of a fixed equal-width grid with 2-line wrapped text, so
      // short and long items size and wrap exactly like TripDetailPage.tsx.
      const chipH = 25;
      const padX = 10;
      const iconSize = 13;
      const iconGap = 6;
      const chipGapX = 8;
      const chipGapY = 8;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      let x = carryX;
      let y = top + 26;
      for (const item of trip.things_to_carry) {
        const w = doc.getTextWidth(item.description) + padX * 2 + iconSize + iconGap;
        if (x > carryX && x + w > carryX + carryW) {
          x = carryX;
          y += chipH + chipGapY;
        }
        if (y + chipH > listBottom) break;

        setFill(COLORS.backgroundWarm);
        doc.roundedRect(x, y, w, chipH, 6, 6, 'F');

        // Mirrors TripDetailPage.tsx exactly: the admin-picked icon when
        // set, else the same keyword-matched fallback (getThingsToCarryIcon),
        // drawn inline in the primary color — not boxed in a filled circle.
        const itemIcon = resolveIcon(item.icon, getThingsToCarryFallbackIcon(item.description));
        const iconX = x + padX;
        const iconCy = y + chipH / 2;
        await drawLucideIcon(itemIcon, iconX, iconCy + iconSize / 2, iconSize, COLORS.primary);

        setText(COLORS.dark);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(item.description, iconX + iconSize + iconGap, iconCy + 3.2);

        x += w + chipGapX;
      }
    }

    if (!hasCards) return;

    // ---------------------------------------------------------------------
    // Bottom band — compact Meeting Point / Eligibility cards. Each sits in
    // its own column slot (left under "Travel with Confidence", right under
    // "Things to Carry") when both are present; a lone card takes the full
    // slot width it would otherwise share.
    // ---------------------------------------------------------------------
    const cardTop = CONTENT_BOTTOM - cardH;
    const cardPad = 18;

    function drawInfoCard(x: number, w: number, icon: (px: number, py: number, s?: number, c?: RGB) => void, title: string, drawBody: (bx: number, by: number, bw: number) => void) {
      setFill(COLORS.backgroundWarm);
      doc.roundedRect(x, cardTop, w, cardH, 10, 10, 'F');
      setDraw(COLORS.grayLineSoft);
      doc.setLineWidth(0.75);
      doc.roundedRect(x, cardTop, w, cardH, 10, 10, 'S');

      const tx = x + cardPad;
      let ty = cardTop + cardPad + 4;
      icon(tx, ty + 13, 18);
      setText(COLORS.dark);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text(title, tx + 26, ty + 10);
      ty += 30;

      drawBody(tx, ty, w - cardPad * 2);
    }

    if (hasMeetingPoint) {
      const w = cardsTwoCol ? leftW : (hasEligibility ? leftW : CONTENT_W);
      drawInfoCard(MARGIN, w, icons.navigation, 'Meeting Point', (bx, by, bw) => {
        setText(COLORS.dark);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11.5);
        const lines = clampLines(trip.meeting_point!, bw, 2);
        doc.text(lines, bx, by);
        const linkY = by + lines.length * 15 + 6;

        if (trip.meeting_point_map_url) {
          const label = 'View on map';
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9.5);
          icons.pin(bx, linkY + 7, 12, COLORS.secondary);
          setText(COLORS.secondary);
          doc.text(label, bx + 16, linkY + 4);
          doc.link(bx, linkY - 8, doc.getTextWidth(label) + 16, 16, { url: trip.meeting_point_map_url });
        }
      });
    }

    if (hasEligibility) {
      const x = cardsTwoCol ? rightX : (hasMeetingPoint ? rightX : MARGIN);
      const w = cardsTwoCol ? rightW : (hasMeetingPoint ? rightW : CONTENT_W);
      drawInfoCard(x, w, icons.userCheck, 'Eligibility', (bx, by, bw) => {
        drawParagraph(`This trip is open to travelers aged ${formatAgeRange(trip.min_age, trip.max_age)}.`, bx, by, bw, {
          size: 10,
          color: COLORS.darkMuted,
          lineHeight: 14,
          maxLines: 3,
        });
      });
    }
  }
