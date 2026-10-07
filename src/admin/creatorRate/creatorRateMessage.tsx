// Message-template logic for the Creator Rate Calculator: the saved template
// shape, its defaults, and how a calculation is turned into the WhatsApp message.
import type { ReactNode } from 'react';
import { formatPrice } from '../../utils/utils-index';
import type { CreatorRateCalculation, CreatorRateAsset } from '../../types/types-index';
import { RATE_CARD_ITEMS, PREVIEW_SAMPLE_RATES } from '../../constants/creatorRate';

export interface TemplateDraft { variants: MessageTemplateVariant[]; defaultVariantId: string }

/** The saved message template as the editor holds it (falling back to the built-in wording). */
export function templateDraftFrom(content: CreatorRateMessageTemplateContent | null): TemplateDraft {
  if (content?.variants?.length) {
    return {
      variants: content.variants,
      defaultVariantId: content.variants.some(v => v.id === content.defaultVariantId) ? content.defaultVariantId : content.variants[0].id,
    };
  }
  if (content?.template) {
    // Pre-variants shape — migrate the single saved template into one "Default" variant.
    return { variants: [{ id: DEFAULT_VARIANT_ID, name: 'Default', template: content.template }], defaultVariantId: DEFAULT_VARIANT_ID };
  }
  return { variants: DEFAULT_MESSAGE_TEMPLATE_VARIANTS, defaultVariantId: DEFAULT_VARIANT_ID };
}

// Turns a saved calculation into a ready-to-send message — this is the
// piece the admin actually hands to the creator (via Copy or WhatsApp
// Share on each saved row), so it stays plain text/emoji only, no app
// jargon like "CPV" or "quality multiplier".
//
// The wording itself comes from one or more named variants stored in the
// site_content table (key RATE_MESSAGE_TEMPLATE_KEY — same generic
// key/value store the rest of the site's editable copy uses, see
// supabase/schema.sql), edited directly in the "Message Template" box
// above the saved-calculations list rather than per saved calculation.
// Saving it there updates that row, so every admin sees the same variants
// for every calculation (new or old), on any device. Copy/Share on a saved
// row use whichever variant is marked default unless the admin picks a
// different one for that send from the row's own variant picker.
export const RATE_MESSAGE_TEMPLATE_KEY = 'creator_rate_message_template';

export interface MessageTemplateVariant {
  id: string;
  name: string;
  template: string;
}

export interface CreatorRateMessageTemplateContent {
  variants: MessageTemplateVariant[];
  defaultVariantId: string;
  /** @deprecated pre-variants shape, read for backward compatibility only */
  template?: string;
}

export const DEFAULT_MESSAGE_TEMPLATE = [
  "{{greeting}} Here's the commercial rate card for your {{niche}} content ({{followers}} followers):",
  '',
  '{{items}}',
  '',
  'These are our suggested ranges — happy to discuss and finalise. Let us know your thoughts!',
  '— Team Ulaa',
].join('\n');

export const DEFAULT_VARIANT_ID = 'default';

export const DEFAULT_MESSAGE_TEMPLATE_VARIANTS: MessageTemplateVariant[] = [
  { id: DEFAULT_VARIANT_ID, name: 'Default', template: DEFAULT_MESSAGE_TEMPLATE },
];

// Fills a template's {{greeting}} / {{niche}} / {{followers}} / {{items}}
// tokens in with one calculation's actual values. Only needs this sliver of
// CreatorRateCalculation, so the live "Preview Template" popup below can
// feed it the in-progress form state without a full saved-row shape.
export type MessageTemplateSource = Pick<CreatorRateCalculation, 'creator_name' | 'niche' | 'follower_count' | 'final_commercials'>;

// The "Final Commercials" asset names carry a leading count for the admin
// table above (e.g. "1 Non-Collab Reel", so a future "2 Story" scales
// cleanly) — but reads oddly in the message sent to the creator, so it's
// stripped here for the {{items}} output only. The table itself keeps
// the count untouched.
function stripLeadingCount(assetName: string): string {
  return assetName.replace(/^1\s+/, '');
}

// A real HTML table can't be sent as a WhatsApp message, but padding each
// row's asset name out to the same width — inside a monospace block, where
// every character is the same width — lines the Max column up into
// something that reads as a table once WhatsApp renders the monospace
// formatting. Used whenever {{items}} sits directly inside a ```…``` block
// (the "Monospace" toolbar button wraps the current selection in exactly
// that), so wrapping {{items}} in Monospace is what turns it into a table.
function formatItemsAsTable(assets: CreatorRateAsset[]): string {
  const names = assets.map(row => stripLeadingCount(row.asset));
  const nameWidth = Math.max(...names.map(name => name.length));
  return assets
    .map((row, i) => `${names[i].padEnd(nameWidth)}  ${formatPrice(row.max)}`)
    .join('\n');
}

export function renderMessageTemplate(template: string, h: MessageTemplateSource): string {
  const greeting = h.creator_name ? `Hi ${h.creator_name.trim().split(/\s+/)[0]}!` : 'Hi!';
  const itemsToken = '{{items}}';
  const tokenIndex = template.indexOf(itemsToken);
  const isTableWrapped =
    tokenIndex !== -1 &&
    template.slice(Math.max(0, tokenIndex - 3), tokenIndex) === '```' &&
    template.slice(tokenIndex + itemsToken.length, tokenIndex + itemsToken.length + 3) === '```';
  const items = isTableWrapped
    ? formatItemsAsTable(h.final_commercials)
    : h.final_commercials.map(row => `- ${stripLeadingCount(row.asset)}: *${formatPrice(row.max)}*`).join('\n');
  return template
    .replace('{{greeting}}', greeting)
    .replace('{{niche}}', h.niche)
    .replace('{{followers}}', h.follower_count.toLocaleString('en-IN'))
    .replace(itemsToken, items);
}

// Renders WhatsApp's own lightweight markup (*bold*, _italic_,
// ~strikethrough~, ```monospace```) as actual formatting for the Preview
// popup, so the admin can see how the message will really look once
// WhatsApp applies that markup on send — the raw asterisks/underscores
// stay in the underlying template text (and in what Copy puts on the
// clipboard); this only affects what's displayed inside the popup itself.
export function renderFormattedPreview(text: string): (string | ReactNode)[] {
  const parts = text.split(/(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|```[^`]+```)/g);
  return parts.map((part, i) => {
    if (/^\*[^*\n]+\*$/.test(part)) return <strong key={i}>{part.slice(1, -1)}</strong>;
    if (/^_[^_\n]+_$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>;
    if (/^~[^~\n]+~$/.test(part)) return <span key={i} className="line-through">{part.slice(1, -1)}</span>;
    if (/^```[^`]+```$/.test(part)) return <code key={i} className="font-mono text-[0.85em] bg-background-warm px-1 py-0.5 rounded">{part.slice(3, -3)}</code>;
    return part;
  });
}

// Sample "Final Commercials" used to fill the {{items}} token in the
// template preview when the calculator above doesn't have a real
// calculation to preview with yet (no follower count / Reel views entered)
// — so Preview always has something concrete to show rather than blank
// placeholders.
export const PREVIEW_SAMPLE_ASSETS: CreatorRateAsset[] = RATE_CARD_ITEMS.map((item, i) => ({
  asset: item.asset,
  ...PREVIEW_SAMPLE_RATES[i],
  pricing_logic: item.logic,
}));
