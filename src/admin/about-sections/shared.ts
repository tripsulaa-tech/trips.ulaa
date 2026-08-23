// Shared Tailwind classes used by every section editor in this folder —
// split out of AdminAbout.tsx so each section can import the same input/label
// styling without duplicating the class strings.

export const inputClass =
  'w-full px-3 py-2 rounded-md border-2 border-background-warm bg-background font-body text-dark text-sm focus:border-primary outline-none transition-colors';
export const labelClass = 'block text-sm font-medium text-dark mb-1';
