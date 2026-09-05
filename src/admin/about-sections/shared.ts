// Shared Tailwind classes used by every section editor in this folder —
// split out of AdminAbout.tsx so each section can import the same input/label
// styling without duplicating the class strings.

export { FORM_INPUT_CLASS as inputClass } from '../../constants/formStyles';
export const labelClass = 'block text-sm font-medium text-dark mb-1';
export const iconLabelClass = 'flex items-center gap-1.5 text-sm font-medium text-dark mb-1';
export const helperTextClass = 'text-[11px] text-dark-muted leading-snug mb-1.5';

// Repeatable-item card shell — mirrors the "pro" card treatment applied to
// the Home Page editor's Why ULAA cards (see home-sections/WhyUlaaSection.tsx):
// a numbered header bar instead of a bare "Card N" label, with a soft
// hover-highlight border so the list doesn't read as a flat stack of boxes.
export const itemCardClass = 'rounded-xl border-2 border-background-warm bg-white overflow-hidden hover:border-primary/30 transition-colors';
export const itemCardHeaderClass = 'flex items-center gap-2 px-4 py-2.5 bg-background-warm/40 border-b border-background-warm';
export const itemNumberBadgeClass = 'flex items-center justify-center w-5 h-5 rounded-full bg-primary text-white text-[11px] font-bold flex-shrink-0';

// Live-preview box used under a heading/eyebrow/subheading trio so an admin
// can see roughly how the text will read on the public page without leaving
// the panel — same treatment as the Home Page editor's "Why ULAA" preview.
export const previewLabelClass = 'text-[10px] font-medium text-dark-muted uppercase tracking-wide mb-1.5';
export const previewBoxClass = 'rounded-lg bg-cream border border-background-warm px-5 py-6 flex flex-col items-center text-center gap-2';
