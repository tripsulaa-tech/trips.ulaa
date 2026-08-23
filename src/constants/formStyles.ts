// Shared Tailwind input class strings, extracted from ~14 files that each
// hand-copied one of these two identical strings as a local `inputClass`
// const. Two distinct variants exist in the wild (differing only in
// border-radius), so both are kept rather than forced into one:
//   - FORM_INPUT_CLASS: rounded-md, used across most admin panel forms.
//   - EDITOR_INPUT_CLASS: rounded-lg, used by the JSON-array field editors
//     (FAQEditor, ItineraryEditor, TermsEditor, CancellationPolicyEditor).
// Importing files typically alias this back to `inputClass` at the import
// site (`import { FORM_INPUT_CLASS as inputClass } from ...`) so the rest
// of each file's JSX is unchanged.
export const FORM_INPUT_CLASS = 'w-full px-3 py-2 rounded-md border-2 border-background-warm bg-background font-body text-dark text-sm focus:border-primary outline-none transition-colors';

export const EDITOR_INPUT_CLASS = 'w-full px-3 py-2 rounded-lg border-2 border-background-warm bg-background font-body text-dark text-sm focus:border-primary outline-none transition-colors';
