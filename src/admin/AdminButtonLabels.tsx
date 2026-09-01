import AdminLayout from './AdminLayout';
import AdminEditorFooter from './AdminEditorFooter';
import { useSiteContentEditor } from './useSiteContentEditor';
import { DEFAULT_BUTTON_LABELS } from '../constants/buttonLabels';
import type { ButtonLabelsConfig } from '../types/types-index';
import { FORM_INPUT_CLASS as inputClass } from '../constants/formStyles';

// Editable copies of the trip-page CTA buttons. Saved to site_content under
// the "button_labels" key — read by TripDetailPage.tsx (the live buttons)
// and by tripItineraryPdf.ts (the matching CTA button drawn on the
// generated PDF), so a change here shows up in both places.
export default function AdminButtonLabels() {
  const {
    content: labels, setContent: setLabels, loading, saving, saved,
    hasUnsavedChanges, handleSave, resetToDefault,
  } = useSiteContentEditor<ButtonLabelsConfig>({
    contentKey: 'button_labels',
    defaultContent: DEFAULT_BUTTON_LABELS,
    resolveLoaded: data => (data && data.primaryCta ? data : DEFAULT_BUTTON_LABELS),
    validate: content => (!content.primaryCta.trim() || !content.waitlistCta.trim())
      ? 'Both button names are required.'
      : null,
  });

  if (loading) {
    return (
      <AdminLayout title="Button Naming">
        <div className="text-center py-16 text-dark-muted">Loading...</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Button Naming"
      subtitle="Rename the booking CTA button shown on trip detail pages and on the generated trip PDF."
      hasUnsavedChanges={hasUnsavedChanges}
    >
      <div className="max-w-xl bg-white rounded-md shadow-warm-lg border border-background-warm max-h-[calc(100vh-160px)] overflow-hidden flex flex-col">
        <div className="app-scroll overflow-y-auto flex-1 min-h-0">
          <div className="p-6 space-y-5">
            <div>
              <label htmlFor="btn-label-primary" className="block text-xs font-medium text-dark-muted mb-1">
                Booking button (seats available)
              </label>
              <input
                id="btn-label-primary"
                value={labels.primaryCta}
                onChange={e => setLabels(l => ({ ...l, primaryCta: e.target.value }))}
                className={inputClass}
                placeholder="e.g. Pack Your Bags"
              />
              <p className="text-xs text-dark-muted mt-1">
                Shown on the trip detail page's booking button and on the matching button in the trip PDF, whenever seats are open.
              </p>
            </div>

            <div>
              <label htmlFor="btn-label-waitlist" className="block text-xs font-medium text-dark-muted mb-1">
                Booking button (trip full)
              </label>
              <input
                id="btn-label-waitlist"
                value={labels.waitlistCta}
                onChange={e => setLabels(l => ({ ...l, waitlistCta: e.target.value }))}
                className={inputClass}
                placeholder="e.g. Join Waitlist"
              />
              <p className="text-xs text-dark-muted mt-1">
                Shown instead, in both places, once a trip has no seats left.
              </p>
            </div>
          </div>

          <AdminEditorFooter onSave={handleSave} saving={saving} saved={saved} onSecondaryAction={resetToDefault} />
        </div>
      </div>
    </AdminLayout>
  );
}
