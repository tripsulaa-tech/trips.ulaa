import Button from '../components/ui/Button';

// Sticky Save/Reset footer shared by the single-item admin content editors
// (About, Why ULAA, Founder, Home Hero, Bottom Nav, Button Labels) — pinned
// to the bottom of the card's own scroll area, same pattern as the Add Trip
// modal's footer.
//
// `secondaryLabel`/`onSecondaryAction` default to the "Reset to Default"
// behavior used by every editor except Home Hero, which instead offers a
// "Cancel" action — pass both explicitly there. `responsiveFlex` defaults
// to true (`sm:flex-1`, matching every editor but Home Hero, which used a
// plain `flex-1`).
export default function AdminEditorFooter({
  onSave,
  saving,
  saved,
  onSecondaryAction,
  secondaryLabel = 'Reset to Default',
  responsiveFlex = true,
}: {
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  onSecondaryAction: () => void;
  secondaryLabel?: string;
  responsiveFlex?: boolean;
}) {
  const flexClass = responsiveFlex ? 'sm:flex-1' : 'flex-1';
  return (
    <div className="sticky bottom-0 flex items-center gap-3 bg-white border-t border-background-warm px-6 py-4 rounded-b-md">
      <Button variant="primary" size="md" className={`${flexClass} max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]`} onClick={onSave} loading={saving}>
        <span className="hidden sm:inline">Save Changes</span>
        <span className="sm:hidden">Save</span>
      </Button>
      <Button variant="outline" size="md" className={`${flexClass} max-sm:!px-4 max-sm:!py-2.5 max-sm:!text-sm max-sm:!min-h-[44px]`} onClick={onSecondaryAction}>
        {secondaryLabel}
      </Button>
      {saved && <span role="status" className="text-sm text-green-600 font-medium">Saved!</span>}
    </div>
  );
}
