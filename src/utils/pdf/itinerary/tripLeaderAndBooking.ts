import {
  Calendar, Clock, Users, UserCheck, Phone, Mail, Globe, MessageSquare, Headphones,
  ShieldCheck, BadgeCheck,
} from 'lucide-react';
import type { PdfCtx } from './context';
import type { AnyIcon, RGB, PdfTrip } from './shared';
import type { ButtonLabelsConfig } from '../../../types/types-index';
import { BRAND, MARGIN, CONTENT_W, COLORS, money, heroMoneyRupee, rgbToHex, loadCoverCroppedImage } from './shared';
import { formatDateRange, formatAgeRange, formatDate, getActivePrice, getStrikeThroughPrice, publicSeatsLeft } from '../../utils-index';

/** Renders "Trip Leader & Booking" — founder bio, booking-form summary
 *  card, and the "Need Help?" contact bar. Extracted from
 *  tripItineraryPdf.ts. */
  // =========================================================================
  // SLIDE — Trip Leader & Booking: a plain, generic page (same slideHeader
  // treatment as FAQs/Cancellation Policy) covering "Meet Your Trip Leader",
  // a "Booking Form" summary card, and the "Need Help?" contact bar. All
  // content is read straight off `trip`/`BRAND`, same as the closing slide's
  // versions of these — this page exists as an earlier, easy-to-find stop
  // for that same info, ahead of the decorative closing slide.
  // =========================================================================
  export async function renderTripLeaderAndBooking(ctx: PdfCtx, trip: PdfTrip, buttonLabels: ButtonLabelsConfig): Promise<void> {
  const { doc, setFill, setText, setDraw, newSlide, clampLines, slideHeader, icons, drawLucideIcon, drawArrowRight, drawMixedLine, mixedLineWidth } = ctx;

    newSlide();
    slideHeader(null, 'Trip Leader & Booking', 'Meet your host, then reserve your seat below');

    const CARDS_TOP = 108;
    const CARDS_BOTTOM = 450;
    const PAD = 20;
    const leftW = 470;
    const colGapCards = 20;
    const leftX = MARGIN;
    const rightX = leftX + leftW + colGapCards;
    const rightW = CONTENT_W - leftW - colGapCards;
    const cardCX = rightX + rightW / 2; // horizontal center of the booking card, for the centered layout below

    // The booking card sits a little higher than the left column (shifted up
    // by BOOK_CARD_RAISE), giving it a touch more breathing room above
    // "Secure Your Spot Soon" without disturbing the "Meet Your Trip Leader"
    // side, which still anchors to CARDS_TOP/CARDS_BOTTOM directly.
    const BOOK_CARD_RAISE = 10;
    const RIGHT_TOP = CARDS_TOP - BOOK_CARD_RAISE;
    const RIGHT_BOTTOM = CARDS_BOTTOM - BOOK_CARD_RAISE;

    function cardShell(x: number, w: number, top: number, bottom: number) {
      setFill(COLORS.white);
      doc.roundedRect(x, top, w, bottom - top, 8, 8, 'F');
      setDraw(COLORS.grayLine);
      doc.setLineWidth(1);
      doc.roundedRect(x, top, w, bottom - top, 8, 8, 'S');
    }
    // Only the booking card gets the bordered/filled card shell — the
    // "Meet Your Trip Leader" side sits directly on the page background now.
    cardShell(rightX, rightW, RIGHT_TOP, RIGHT_BOTTOM);

    // -- Left: Meet Your Trip Leader (from trip.trip_founder) --
    // "Meet Your Trip Leader" sits above the name column (not the photo),
    // right-shifted to align with the founder's name/title below it.
    const photoD = 150;
    const photoX = leftX + PAD;
    const photoY = CARDS_TOP + PAD + 22;
    const headingX = photoX + photoD + 14;
    setText(COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14.5);
    doc.text('Meet Your Trip Leader', headingX, CARDS_TOP + PAD + 6);
    // Underline only "Meet" (not the full heading), with a little more
    // breathing room between the text baseline and the rule below it.
    const meetW = doc.getTextWidth('Meet');
    setDraw(COLORS.secondary);
    doc.setLineWidth(2);
    doc.line(headingX, CARDS_TOP + PAD + 13, headingX + meetW, CARDS_TOP + PAD + 13);

    const founder = trip.trip_founder;
    if (founder && (founder.name || founder.photo)) {
      let photoDrawn = false;
      if (founder.photo) {
        const cropped = await loadCoverCroppedImage(founder.photo, photoD, photoD, photoD / 2, rgbToHex(COLORS.background));
        if (cropped) {
          try {
            doc.addImage(cropped, 'JPEG', photoX, photoY, photoD, photoD);
            photoDrawn = true;
          } catch {
            photoDrawn = false;
          }
        }
      }
      if (!photoDrawn) {
        setFill(COLORS.backgroundWarm);
        doc.circle(photoX + photoD / 2, photoY + photoD / 2, photoD / 2, 'F');
        setText(COLORS.primary);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(46);
        doc.text((founder.name || '?').charAt(0).toUpperCase(), photoX + photoD / 2, photoY + photoD / 2 + 16, { align: 'center' });
      }
      // Two-tone frame: a white/background ring sits right against the
      // photo (the gap/padding effect), then a slightly larger orange
      // accent ring sits just outside it — so the photo reads as
      // white-matted with an orange frame, not one or the other.
      setDraw(COLORS.background);
      doc.setLineWidth(4);
      doc.circle(photoX + photoD / 2, photoY + photoD / 2, photoD / 2, 'S');
      setDraw(COLORS.secondary);
      doc.setLineWidth(2.5);
      doc.circle(photoX + photoD / 2, photoY + photoD / 2, photoD / 2 + 3, 'S');

      const textX = photoX + photoD + 14;
      const textW = leftX + leftW - PAD - textX;
      let ny = photoY + 18;
      setText(COLORS.dark);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      const nameLines = clampLines(founder.name || '', textW, 2);
      doc.text(nameLines, textX, ny);
      ny += nameLines.length * 16 + 2;
      setText(COLORS.secondary);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.text('Founder & Trip Leader', textX, ny);
      ny += 7;
      setDraw(COLORS.grayLineSoft);
      doc.setLineWidth(1);
      doc.line(textX, ny, leftX + leftW - PAD, ny);

      // Wrap the founder's bio as one continuous flow that runs in the
      // narrow column beside the photo while there's room, then
      // automatically widens to the full card width once it passes below
      // the photo's bottom edge — a magazine-style "text wraps around the
      // image" effect, rather than being split into separate fixed blocks.
      const paragraphs = (founder.description || '').split(/\n+/).map(p => p.trim()).filter(Boolean);
      const paraFontSize = 10.5;
      const paraLineHeight = 18; // more spacing between lines
      const paraGap = 6; // extra breathing room between paragraphs
      const rightColTop = ny + 22; // more breathing room below the divider line
      const rightColBottom = photoY + photoD + 16; // clears the photo's border rings and the next line's ascenders
      const fullX = leftX + PAD;
      const fullW = leftW - PAD * 2;
      const bottomLimit = CARDS_BOTTOM - PAD;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(paraFontSize);
      setText(COLORS.darkMuted);

      let dy = rightColTop;
      for (const para of paragraphs) {
        if (dy > bottomLimit) break;
        const words = para.split(/\s+/).filter(Boolean);
        let wi = 0;
        while (wi < words.length && dy <= bottomLimit) {
          const inColumn = dy < rightColBottom;
          const lineX = inColumn ? textX : fullX;
          const lineW = inColumn ? textW : fullW;
          const lineWords: string[] = [];
          let lineText = '';
          while (wi < words.length) {
            const candidate = lineWords.length ? `${lineText} ${words[wi]}` : words[wi];
            if (doc.getTextWidth(candidate) > lineW && lineWords.length > 0) break;
            lineWords.push(words[wi]);
            lineText = candidate;
            wi++;
          }
          doc.text(lineText, lineX, dy);
          dy += paraLineHeight;
        }
        dy += paraGap;
      }
    } else {
      setText(COLORS.darkMuted);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text('Trip leader details coming soon.', leftX + PAD, CARDS_TOP + PAD + 40);
    }

    // -- Right: Booking Form — a centered, single-column layout matching the
    // live site's <BookingForm> widget exactly (price, per-person, savings
    // badges, offer countdown, a full-width reserve/status box, a stacked
    // trip-facts list, the CTA button, quick links and a reassurance note). --
    setText(COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14.5);
    doc.text('Secure Your Spot Soon', cardCX, RIGHT_TOP + PAD + 6, { align: 'center' });

    const { activePrice, isEarlyBird, deadlinePassed } = getActivePrice(trip.price, trip.early_bird_price, trip.early_bird_deadline);
    const strikeThroughPrice = getStrikeThroughPrice(activePrice, trip.price, isEarlyBird, trip.strike_through_price);
    const remaining = publicSeatsLeft(trip.total_seats, trip.seats_booked, trip.waitlist_reserved || 0);
    const isFull = remaining === 0;
    const isAlmostFull = remaining > 0 && remaining <= 5;
    const remainingAfterAdvance =
      activePrice != null && trip.advance_amount != null ? Math.max(0, activePrice - trip.advance_amount) : null;

    const BOOK_TOP = RIGHT_TOP + PAD + 34; // clears the "Secure Your Spot Soon" heading above
    const innerLeft = rightX + PAD;
    const innerRight = rightX + rightW - PAD;
    const innerW = innerRight - innerLeft;

    let ry = BOOK_TOP;

    // Price row: main price + strikethrough, centered as one group. Uses the
    // embedded RupeeSans subset (see rupeeFont.ts) so the real ₹ glyph shows
    // here, matching TripDetailPage's <BookingForm> — helvetica can't render
    // it (see money()/formatPrice()), which is why every other price on this PDF still
    // falls back to the "Rs."/"RS" text form.
    if (activePrice != null) {
      doc.setFont('RupeeSans', 'bold');
      doc.setFontSize(24);
      const priceStr = heroMoneyRupee(activePrice);
      const priceW = doc.getTextWidth(priceStr);

      let strikeStr = '';
      let strikeW = 0;
      if (strikeThroughPrice != null) {
        doc.setFont('RupeeSans', 'normal');
        doc.setFontSize(12);
        strikeStr = heroMoneyRupee(strikeThroughPrice);
        strikeW = doc.getTextWidth(strikeStr);
      }
      const gap1 = strikeStr ? 10 : 0;
      let px = cardCX - (priceW + gap1 + strikeW) / 2;

      setText(COLORS.primary);
      doc.setFont('RupeeSans', 'bold');
      doc.setFontSize(24);
      doc.text(priceStr, px, ry);
      px += priceW + gap1;

      if (strikeStr) {
        setText(COLORS.darkMuted);
        doc.setFont('RupeeSans', 'normal');
        doc.setFontSize(12);
        doc.text(strikeStr, px, ry);
        setDraw(COLORS.darkMuted);
        doc.setLineWidth(1);
        doc.line(px, ry - 4, px + strikeW, ry - 4);
      }
      ry += 15;

      setText(COLORS.darkMuted);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.6);
      doc.text('per person', cardCX, ry, { align: 'center' });
      ry += 16;

      // Savings / Early Bird badges, centered as a row
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.6);
      const saveLabel = strikeThroughPrice != null ? `Save ${money(strikeThroughPrice - activePrice)}` : null;
      const saveW = saveLabel ? doc.getTextWidth(saveLabel) + 16 : 0;
      const earlyLabel = isEarlyBird ? 'Early Bird' : null;
      const earlyW = earlyLabel ? doc.getTextWidth(earlyLabel) + 16 : 0;
      const badgeGap = saveLabel && earlyLabel ? 8 : 0;
      const badgesTotalW = saveW + badgeGap + earlyW;
      if (badgesTotalW > 0) {
        let bx = cardCX - badgesTotalW / 2;
        const badgeY = ry;
        if (saveLabel) {
          setFill([232, 247, 237] as RGB);
          doc.roundedRect(bx, badgeY - 12, saveW, 17, 5, 5, 'F');
          setText(COLORS.green);
          doc.text(saveLabel, bx + 8, badgeY + 1);
          bx += saveW + badgeGap;
        }
        if (earlyLabel) {
          setFill(COLORS.secondary);
          doc.roundedRect(bx, badgeY - 12, earlyW, 17, 5, 5, 'F');
          setText(COLORS.white);
          doc.text(earlyLabel, bx + 8, badgeY + 1);
        }
        ry += 15;
      }

      // Offer countdown / expiry note, centered (icon + text as one group)
      if (isEarlyBird && trip.early_bird_deadline) {
        const label = `Offer ends ${formatDate(trip.early_bird_deadline, { day: 'numeric', month: 'long', year: 'numeric' })}`;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.4);
        const w = doc.getTextWidth(label);
        const gx = cardCX - (14 + w) / 2;
        icons.clock(gx, ry + 6, 11, COLORS.secondary);
        setText(COLORS.secondary);
        doc.text(label, gx + 14, ry + 5);
        ry += 13;
      } else if (deadlinePassed) {
        setText(COLORS.darkMuted);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.4);
        doc.text('Early-bird offer has ended', cardCX, ry + 5, { align: 'center' });
        ry += 13;
      }
    }

    // Full-width divider before the reserve/status box
    const dividerY = ry + 6;
    setDraw(COLORS.grayLineSoft);
    doc.setLineWidth(1);
    doc.line(innerLeft, dividerY, innerRight, dividerY);
    ry = dividerY + 10;

    // Reserve / status box — full width, matching the live site's green
    // "Reserve today" panel (or the sold-out / almost-full variants)
    const boxTop = ry;
    // Every branch below sets its own boxH — no default needed up front.
    let boxH: number;
    if (isFull) {
      boxH = 36;
      setFill([253, 235, 234] as RGB);
      doc.roundedRect(innerLeft, boxTop, innerW, boxH, 10, 10, 'F');
      setText(COLORS.red);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.text('Sold Out', cardCX, boxTop + boxH / 2 + 4, { align: 'center' });
    } else if (isAlmostFull) {
      boxH = 36;
      setFill([254, 243, 226] as RGB);
      doc.roundedRect(innerLeft, boxTop, innerW, boxH, 10, 10, 'F');
      setText([180, 120, 20] as RGB);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.6);
      doc.text(`Only ${remaining} seats left \u2014 almost full!`, cardCX, boxTop + boxH / 2 + 4, { align: 'center' });
    } else if (trip.advance_amount != null) {
      boxH = 40;
      setFill([232, 247, 237] as RGB);
      doc.roundedRect(innerLeft, boxTop, innerW, boxH, 10, 10, 'F');

      // Line 1 (check icon + "Reserve today with only <amount>") and line 2
      // ("Remaining ... payable before the trip.") are both centered as
      // groups within the box, rather than left-anchored after the icon.
      const line1Parts: { text: string; color: RGB; bold?: boolean }[] = [
        { text: 'Reserve today with only ', color: COLORS.dark, bold: true },
        { text: money(trip.advance_amount), color: COLORS.green, bold: true },
      ];
      const line1IconGap = 22;
      const line1TextW = mixedLineWidth(line1Parts, 9.4);
      const line1GroupW = line1IconGap + line1TextW;
      const line1StartX = cardCX - line1GroupW / 2;
      // Green circle + white ShieldCheck glyph — same combo TripDetailPage's
      // <BookingForm> uses for this box (w-9 h-9 bg-green-600 circle behind
      // a white ShieldCheck), instead of the hand-drawn check mark.
      const shieldCX = line1StartX - 6 + 9;
      const shieldCY = boxTop + boxH / 2 - 7.2;
      setFill(COLORS.green);
      doc.circle(shieldCX, shieldCY, 7.2, 'F');
      await drawLucideIcon(ShieldCheck, shieldCX - 5, shieldCY + 5, 10, COLORS.white);
      drawMixedLine(line1StartX + line1IconGap - 6, boxTop + 16, line1Parts, 9.4);

      if (remainingAfterAdvance != null) {
        const line2Parts: { text: string; color: RGB; bold?: boolean }[] = [
          { text: 'Remaining ', color: COLORS.darkMuted },
          { text: money(remainingAfterAdvance), color: COLORS.dark, bold: true },
          { text: ' payable before the trip.', color: COLORS.darkMuted },
        ];
        const line2W = mixedLineWidth(line2Parts, 7.8);
        drawMixedLine(cardCX - line2W / 2, boxTop + 29, line2Parts, 7.8);
      }
    } else {
      boxH = 28;
      setFill([232, 247, 237] as RGB);
      doc.roundedRect(innerLeft, boxTop, innerW, boxH, 8, 8, 'F');
      setText(COLORS.green);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.6);
      doc.text('Seats available', cardCX, boxTop + boxH / 2 + 4, { align: 'center' });
    }
    ry = boxTop + boxH + 12;

    // Trip-facts list: label+icon on the left, value right-aligned
    ry += 15;

    const metaItems: { icon: AnyIcon; label: string; value: string }[] = [
      { icon: Calendar, label: 'Dates', value: formatDateRange(trip.start_date, trip.end_date) },
      { icon: Clock, label: 'Duration', value: trip.duration },
      { icon: Users, label: 'Group Size', value: `Max ${trip.total_seats}` },
      { icon: UserCheck, label: 'Age Range', value: formatAgeRange(trip.min_age, trip.max_age) },
    ];
    const rowH = 18;
    for (const item of metaItems) {
      // Real lucide-react icons (same Calendar/Clock/Users/UserCheck the
      // live booking widget uses), not the hand-drawn `icons.*` set — those
      // were coming out visually cramped/misaligned at this small size.
      await drawLucideIcon(item.icon, innerLeft + 6, ry + 4, 12, COLORS.primary);
      setText(COLORS.darkMuted);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(item.label, innerLeft + 20, ry);
      setText(COLORS.dark);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.text(item.value, innerRight, ry, { align: 'right' });
      ry += rowH;
    }
    ry += 6;

    // CTA button — full width, label + arrow icon (no lock glyph, per the
    // live site's button), whole area stays clickable
    const showAdvance = trip.advance_amount != null && !isFull;
    const btnH = showAdvance ? 36 : 32;
    const btnY = ry;
    setFill(COLORS.primary);
    doc.roundedRect(innerLeft, btnY, innerW, btnH, 5, 5, 'F');
    setText(COLORS.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    const ctaLabel = isFull ? buttonLabels.waitlistCta : buttonLabels.primaryCta;
    const ctaLabelW = doc.getTextWidth(ctaLabel);
    const ctaGroupW = ctaLabelW + 8 + 12;
    const ctaTextY = showAdvance ? btnY + 16 : btnY + btnH / 2 + 4;
    const ctaStartX = cardCX - ctaGroupW / 2;
    doc.text(ctaLabel, ctaStartX, ctaTextY);
    drawArrowRight(ctaStartX + ctaLabelW + 14, ctaTextY - 4, 12, COLORS.white);
    if (showAdvance) {
      setText(COLORS.white);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.4);
      doc.text(`At only ${money(trip.advance_amount as number)} today`, cardCX, btnY + 29, { align: 'center' });
    }
    // Whole button is clickable — opens this trip's page with its booking
    // form pre-opened (TripDetailPage watches for "?book=1").
    doc.link(innerLeft, btnY, innerW, btnH, {
      url: `https://${BRAND.website.replace('www.', '')}/trips/${trip.slug}?book=1`,
    });
    ry = btnY + btnH + 16;

    // Reassurance note, centered with a small check icon before the first
    // line — BadgeCheck, same glyph TripDetailPage uses next to this note.
    setText(COLORS.darkMuted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.6);
    const noteLines: string[] = doc.splitTextToSize("No payment required to enquire. We'll contact you within 24 hours.", innerW - 20);
    const firstLineW = doc.getTextWidth(noteLines[0]);
    await drawLucideIcon(BadgeCheck, cardCX - firstLineW / 2 - 12, ry + 3, 10, COLORS.green);
    noteLines.forEach((line, i) => {
      doc.text(line, cardCX, ry + i * 10, { align: 'center' });
    });

    // ---- Contact bar (from BRAND — the site's existing contact info) ----
    const CONTACT_TOP = 456;
    const CONTACT_BOTTOM = 506;
    setFill(COLORS.cream);
    doc.roundedRect(MARGIN, CONTACT_TOP, CONTENT_W, CONTACT_BOTTOM - CONTACT_TOP, 6, 6, 'F');
    setDraw(COLORS.grayLine);
    doc.setLineWidth(1);
    doc.roundedRect(MARGIN, CONTACT_TOP, CONTENT_W, CONTACT_BOTTOM - CONTACT_TOP, 6, 6, 'S');

    const siteDomain = BRAND.website.replace('www.', '');
    const contactItems: { icon: AnyIcon; title: string; value: string; url?: string }[] = [
      { icon: Headphones, title: 'Need Help?', value: "We're just a message away!", url: `https://${siteDomain}/contact` },
      { icon: Phone, title: 'Call / WhatsApp', value: BRAND.phone, url: `https://wa.me/${BRAND.phone.replace(/\D/g, '')}` },
      { icon: Mail, title: 'Email Us', value: BRAND.email, url: `mailto:${BRAND.email}` },
      { icon: Globe, title: 'Website', value: BRAND.website, url: `https://${siteDomain}` },
      // `icon` here is unused for this entry — see the "Follow Us" special
      // case below, which draws the hand-drawn `icons.instagram` glyph
      // instead. Kept as a placeholder only to satisfy the array's type.
      { icon: MessageSquare, title: 'Follow Us', value: BRAND.instagram, url: `https://instagram.com/${BRAND.instagram.replace('@', '')}` },
    ];
    const contactColW = CONTENT_W / contactItems.length;
    const contactMidY = CONTACT_TOP + (CONTACT_BOTTOM - CONTACT_TOP) / 2;
    for (let i = 0; i < contactItems.length; i++) {
      const item = contactItems[i];
      const colX = MARGIN + contactColW * i;
      const cx0 = colX + 18;
      setFill(COLORS.backgroundWarm);
      doc.circle(cx0 + 12, contactMidY, 15, 'F');
      // Real lucide-react icons, not the hand-drawn `icons.*` set — those
      // were coming out visually messy/misaligned inside this circle. The
      // one exception is Instagram: lucide dropped brand icons a few
      // versions back, so "Follow Us" uses the hand-drawn `icons.instagram`
      // glyph instead, at matching size/position.
      // Icon glyph is slightly smaller than the circle behind it (16 vs the
      // circle's radius-15 background), centered within it.
      const contactIconS = 16;
      if (item.title === 'Follow Us') {
        icons.instagram(cx0 + 12 - contactIconS / 2, contactMidY + contactIconS / 2, contactIconS, COLORS.primary);
      } else {
        await drawLucideIcon(item.icon, cx0 + 12 - contactIconS / 2, contactMidY + contactIconS / 2, contactIconS, COLORS.primary);
      }

      const tx = cx0 + 30;
      setText(COLORS.dark);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.2);
      doc.text(item.title, tx, contactMidY - 3);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.4);
      if (item.url) {
        setText(COLORS.primary);
        doc.text(item.value, tx, contactMidY + 10);
        // Whole card (icon + title + value) is clickable, not just the value line.
        doc.link(colX, CONTACT_TOP, contactColW, CONTACT_BOTTOM - CONTACT_TOP, { url: item.url });
      } else {
        setText(COLORS.darkMuted);
        doc.text(item.value, tx, contactMidY + 10);
      }

      if (i < contactItems.length - 1) {
        setDraw(COLORS.grayLineSoft);
        doc.line(MARGIN + contactColW * (i + 1), CONTACT_TOP + 8, MARGIN + contactColW * (i + 1), CONTACT_BOTTOM - 8);
      }
    }
  }
