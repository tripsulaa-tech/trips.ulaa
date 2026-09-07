import Button from '../components/ui/Button';

// Sticky Save/Reset footer shared by the single-item admin content editors
// (About, Why ULAA, Founder, Home Hero, Bottom Nav, Button Labels) — pinned
// to the bottom of the card's own scroll area, same pattern as the Add Trip
// modal's footer. Save and Reset always split the row 50/50 (`flex-1` on
// both, `min-w-0` so the label truncates instead of forcing the flex item
// wider) so they read as a matched pair on every screen size, not just
// desktop — a floating action next to them (like the "Saved!" status) is
// `shrink-0` so it can't eat into that shared space.
//
// `secondaryLabel`/`onSecondaryAction` default to the "Reset to Default"
// behavior used by every editor except Home Hero, which instead offers a
// "Cancel" action — pass both explicitly there.
export default function AdminEditorFooter({
  onSave,
  saving,
  saved,
  onSecondaryAction,
  secondaryLabel = 'Reset to Default',
  secondaryLabelMobile = 'Reset',
}: {
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  onSecondaryAction: () => void;
  secondaryLabel?: string;
  /** Shorter label shown below the `sm` breakpoint so it stays comfortably
   *  inside its half of the row alongside "Save" — pass a short override
   *  for a custom `secondaryLabel` (e.g. "Cancel" already fits, so Home
   *  Hero can just leave this at the default). */
  secondaryLabelMobile?: string;
}) {
  return (
    <div className="sticky bottom-0 flex items-center gap-2 sm:gap-3 bg-white border-t border-background-warm px-4 py-3 sm:px-6 sm:py-4 rounded-b-md">
      <Button variant="primary" size="md" className="flex-1 min-w-0 max-sm:!px-3 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]" onClick={onSave} loading={saving}>
        <span className="hidden sm:inline">Save Changes</span>
        <span className="sm:hidden">Save</span>
      </Button>
      <Button variant="outline" size="md" className="flex-1 min-w-0 max-sm:!px-3 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]" onClick={onSecondaryAction}>
        <span className="hidden sm:inline">{secondaryLabel}</span>
        <span className="sm:hidden truncate">{secondaryLabelMobile}</span>
      </Button>
      {saved && <span role="status" className="shrink-0 whitespace-nowrap text-sm text-green-600 font-medium">Saved!</span>}
    </div>
  );
}
