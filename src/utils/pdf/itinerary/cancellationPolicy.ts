import {
  Users, ShieldCheck, Clock3, CalendarClock, UserX, PackageX, Building2, CheckCircle2,
} from 'lucide-react';
import type { PdfCtx } from './context';
import type { AnyIcon, PdfTrip } from './shared';
import { MARGIN, CONTENT_W, CONTENT_BOTTOM, COLORS, tierLabel } from './shared';
import { CANCELLATION_POLICY_STATIC_SECTIONS as STATIC } from '../../../constants/cancellationPolicy';

  // =========================================================================
  // SLIDES — Cancellation Policy (icon-badged clauses, 2-column, paginated)
  // -----------------------------------------------------------------------
  // Mirrors CancellationPolicyDisplay.tsx exactly: same 8 clauses in the
  // same order (including "Minimum Group Size", previously missing here)
  // with the same lucide-react icon per clause instead of a plain number
  // badge, plus the same closing acceptance disclaimer the site shows below
  // all the cards.
  // =========================================================================
  export async function renderCancellationPolicy(ctx: PdfCtx, trip: PdfTrip): Promise<void> {
  const { doc, setFill, setText, newSlide, slideHeader, drawLucideIcon, drawParagraph, measureParagraphHeight, paginateTwoColumns, centeredTop } = ctx;

    const policy = trip.cancellation_policy;
    if (!policy) return;

    type Clause = { title: string; body: string[]; icon: AnyIcon };
    const clauses: Clause[] = [
      { title: 'Booking Confirmation', body: STATIC.bookingConfirmation, icon: ShieldCheck },
      {
        title: 'Payment Schedule',
        body: [
          `The remaining trip balance must be paid at least ${policy.payment_due_days} days before the departure date, unless otherwise communicated. Failure to complete the payment by the due date may result in automatic cancellation of your booking without prior notice.`,
        ],
        icon: Clock3,
      },
      {
        title: 'Cancellation by Participant',
        body: policy.tiers.map(tier => `${tierLabel(tier)}: ${tier.description}`),
        icon: CalendarClock,
      },
      { title: 'No Show', body: [STATIC.noShow], icon: UserX },
      { title: 'Missed Services', body: [STATIC.missedServices], icon: PackageX },
      { title: 'Trip Cancellation by Organizer', body: STATIC.organizerCancellation, icon: Building2 },
      {
        title: 'Minimum Group Size',
        body: [STATIC.minimumGroupSize.intro, ...STATIC.minimumGroupSize.options.map(o => `\u2022 ${o}`)],
        icon: Users,
      },
      {
        title: 'Refund Timeline',
        body: [
          `Where applicable, approved refunds will be processed within ${policy.refund_min_days}\u2013${policy.refund_max_days} working days, subject to the receipt of refunds from the respective third-party service providers.`,
        ],
        icon: CheckCircle2,
      },
    ];

    const colGap = 36;
    const colW = (CONTENT_W - colGap) / 2;
    const top = 92;
    // Reserve a band on every page for the closing acceptance note so its
    // box sits at the same fixed spot regardless of which page turns out
    // to be last — only that page actually draws text into it.
    const footerReserve = 46;
    const footerTop = CONTENT_BOTTOM - footerReserve + 10;
    const availH = CONTENT_BOTTOM - footerReserve - top;

    // All 8 clauses are meant to read as one policy, so this tries to keep
    // them on a single slide by shrinking type size/line-height/spacing in
    // small steps — same clauses, same order, just more compact — rather
    // than spilling onto a "(continued)" slide. Only falls back to a
    // second slide at the smallest (still-readable) scale if it genuinely
    // doesn't fit even then.
    const SCALES = [1, 0.94, 0.88, 0.82, 0.76, 0.7];
    let scale = SCALES[SCALES.length - 1];
    let balanced: ReturnType<typeof paginateTwoColumns<Clause>> = [];
    for (const s of SCALES) {
      const measureAtScale = (c: Clause) => {
        const titleH = 17 * s;
        const bodySize = 9.3 * s;
        const bodyLineH = 13.2 * s;
        const bodyGap = 3 * s;
        const trailingGap = 16 * s;
        const bodyH = c.body.reduce((sum, line) => sum + measureParagraphHeight(line, colW - 26, bodySize, bodyLineH) + bodyGap, 0);
        return titleH + bodyH + trailingGap;
      };
      const attempt = paginateTwoColumns(clauses, measureAtScale, availH);
      scale = s;
      balanced = attempt;
      if (attempt.length === 1) break;
    }

    async function drawColumn(x: number, startY: number, items: Clause[]) {
      let y = startY;
      for (const clause of items) {
        const badgeSize = Math.max(15, 21 * scale);
        const badgeCx = x + badgeSize / 2 - 0.5;
        const badgeCy = y - 5 * scale;
        setFill(COLORS.backgroundWarm);
        doc.roundedRect(badgeCx - badgeSize / 2, badgeCy - badgeSize / 2, badgeSize, badgeSize, 5, 5, 'F');
        await drawLucideIcon(clause.icon, badgeCx - badgeSize / 2 + 2, badgeCy + badgeSize / 2 - 2, badgeSize - 4, COLORS.primary);

        const textX = x + badgeSize + 5;
        const textW = colW - (badgeSize + 5);
        setText(COLORS.dark);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11.5 * scale);
        doc.text(clause.title, textX, y);
        y += 17 * scale;

        clause.body.forEach(line => {
          y = drawParagraph(line, textX, y, textW, { size: 9.3 * scale, color: COLORS.darkMuted, lineHeight: 13.2 * scale });
          y += 3 * scale;
        });
        y += 16 * scale;
      }
    }

    for (let p = 0; p < balanced.length; p++) {
      const page = balanced[p];
      newSlide();
      slideHeader(null, p === 0 ? 'Cancellation Policy' : 'Cancellation Policy (continued)');
      const startY = centeredTop(top, CONTENT_BOTTOM - footerReserve, Math.max(page.leftH, page.rightH));
      if (page.left.length) await drawColumn(MARGIN, startY, page.left);
      if (page.right.length) await drawColumn(MARGIN + colW + colGap, startY, page.right);

      // Closing acceptance disclaimer — only on the final Cancellation
      // Policy slide, same as the single note at the bottom of the site's
      // CancellationPolicyDisplay (below all the section cards).
      if (p === balanced.length - 1) {
        setFill(COLORS.backgroundWarm);
        doc.roundedRect(MARGIN, footerTop, CONTENT_W, footerReserve - 14, 6, 6, 'F');
        drawParagraph(STATIC.acceptance, MARGIN + 16, footerTop + 15, CONTENT_W - 32, {
          size: 8.5,
          color: COLORS.darkMuted,
          lineHeight: 12,
          maxLines: 2,
        });
      }
    }
  }
