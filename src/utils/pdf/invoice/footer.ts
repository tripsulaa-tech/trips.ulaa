import type { InvoicePdfCtx } from './context';
import { BRAND, COLORS, MARGIN, PAGE_W, PAGE_H, CONTENT_W, FOOTER_BANNER_LINKS } from './shared';

// =============================================================================
// Footer note + bottom brand bar. The note is pinned just above the banner
// when there's room, and otherwise flows after the table so a long payment
// history never overlaps it. The page-number badge goes on every page.
// =============================================================================

export function renderFooterAndPageNumbers(
  ctx: InvoicePdfCtx,
  footerBanner: { dataUrl: string; ratio: number } | null
): void {
  const { doc, setFill, setText, cursor } = ctx;

  const noteText =
    "This invoice reflects amounts recorded for this booking only. Cancellation and refund amounts, if any, are governed by Ulaa's Terms & Cancellation Policy shared at the time of booking.";
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.5);
  const noteLines: string[] = doc.splitTextToSize(noteText, CONTENT_W - 20);
  const noteH = noteLines.length * 11;

  // Where the brand banner will start (it sits flush on the page bottom).
  const bannerTop = PAGE_H - (footerBanner ? CONTENT_W / footerBanner.ratio : 34);

  // Preferred spot: pinned just above the banner, under a hairline, so the
  // terms sit in the same place on every invoice. If the content already
  // runs too far down for that, fall back to flowing right after it.
  const pinnedRuleY = bannerTop - noteH - 28;
  const pinned = pinnedRuleY >= cursor.y + 8;
  if (pinned) {
    ctx.setDraw(COLORS.grayLine);
    doc.setLineWidth(0.75);
    doc.line(MARGIN, pinnedRuleY, PAGE_W - MARGIN, pinnedRuleY);
    cursor.y = pinnedRuleY + 16;
  } else {
    ctx.checkPageBreak(70);
  }

  setFill(COLORS.gold);
  doc.circle(MARGIN + 5, cursor.y, 5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  setText(COLORS.white);
  doc.text('i', MARGIN + 5, cursor.y + 2.6, { align: 'center' });
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.5);
  setText(COLORS.darkMuted);
  doc.text(noteLines, MARGIN + 16, cursor.y + 3);
  // The info icon and the whole note link to this trip's Cancellation
  // Policy section on the public trip page.
  if (ctx.cancellationUrl) {
    doc.link(MARGIN, cursor.y - 6, 12, 12, { url: ctx.cancellationUrl });
    doc.link(MARGIN + 16, cursor.y - 6, CONTENT_W - 20, noteH + 2, { url: ctx.cancellationUrl });
  }
  cursor.y += noteH + 8;

  // Bottom brand banner — the "Empowering women to explore, together" /
  // "Follow us — Instagram / WhatsApp / website" artwork, dropped in as one
  // full-width image (replaces the old plain-text tagline + link line).
  // The Instagram, WhatsApp, and website spots printed on the artwork are
  // wired up as real clickable regions via doc.link() so the banner behaves
  // like the text version did, just drawn as art rather than type.
  //
  // Flush against the physical bottom edge of the page (not the old
  // FOOTER_RESERVE gap), so a short invoice doesn't leave it stranded
  // mid-page with empty space beneath it. The page-number badge is drawn
  // afterwards (see below) directly on top of the banner's bottom-right
  // corner, rather than in a separate reserved strip under it. If content
  // already runs past where the banner would sit, it's pushed to a fresh
  // page instead of overlapping.
  if (footerBanner) {
    const bannerW = CONTENT_W;
    const bannerH = bannerW / footerBanner.ratio;
    let bannerY = PAGE_H - bannerH;
    if (bannerY < cursor.y) {
      ctx.newPage();
      bannerY = PAGE_H - bannerH;
    }
    const format = footerBanner.dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
    doc.addImage(footerBanner.dataUrl, format, MARGIN, bannerY, bannerW, bannerH);
    FOOTER_BANNER_LINKS.forEach((l) => {
      doc.link(
        MARGIN + l.x1 * bannerW,
        bannerY + l.y1 * bannerH,
        (l.x2 - l.x1) * bannerW,
        (l.y2 - l.y1) * bannerH,
        { url: l.url }
      );
    });
  } else {
    // Best-effort text fallback if the banner image fails to load, so the
    // footer still carries the brand + clickable links either way — also
    // flush to the bottom of the page for the same reason as above.
    const barH = 34;
    let barY = PAGE_H - barH;
    if (barY < cursor.y) {
      ctx.newPage();
      barY = PAGE_H - barH;
    }
    setFill(COLORS.backgroundWarm);
    doc.rect(MARGIN, barY, CONTENT_W, barH, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    setText(COLORS.darkMuted);
    doc.text(BRAND.bottomTagline, MARGIN + 14, barY + 21);

    const instagramUrl = `https://instagram.com/${BRAND.instagram.replace(/^@/, '')}`;
    const websiteUrl = `https://${BRAND.website}`;
    const followSegments: { text: string; link?: string }[] = [
      { text: 'Follow us \u2014 Instagram ' },
      { text: BRAND.instagram, link: instagramUrl },
      { text: '  \u2022  WhatsApp  \u2022  ' },
      { text: BRAND.website, link: websiteUrl },
    ];
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const followTotalW = followSegments.reduce((w, s) => w + doc.getTextWidth(s.text), 0);
    let followX = PAGE_W - MARGIN - 14 - followTotalW;
    followSegments.forEach((s) => {
      if (s.link) {
        doc.setFont('helvetica', 'bold');
        setText(COLORS.primaryDark);
        doc.textWithLink(s.text, followX, barY + 21, { url: s.link });
        doc.setFont('helvetica', 'normal');
      } else {
        setText(COLORS.darkMuted);
        doc.text(s.text, followX, barY + 21);
      }
      followX += doc.getTextWidth(s.text);
    });
  }

  // ---------------------------------------------------------------------
  // Page-number badge on every page, added last (and therefore drawn on
  // top of the footer banner's bottom-right corner) so the final total is
  // known no matter how many pages the payment history needed.
  // ---------------------------------------------------------------------
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const label = `Page ${p} of ${pageCount}`;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    const w = doc.getTextWidth(label) + 16;
    setFill(COLORS.dark);
    doc.roundedRect(PAGE_W - MARGIN - w, PAGE_H - 26, w, 16, 8, 8, 'F');
    setText(COLORS.white);
    doc.text(label, PAGE_W - MARGIN - w / 2, PAGE_H - 15, { align: 'center' });
  }
}
