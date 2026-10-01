import type { ButtonLabelsConfig } from '../../types/types-index';
import { FORM_INPUT_CLASS as inputClass } from '../../constants/formStyles';

export default function ButtonNamingSection({
  content,
  setContent,
  sectionRef,
}: {
  content: ButtonLabelsConfig;
  setContent: React.Dispatch<React.SetStateAction<ButtonLabelsConfig>>;
  sectionRef: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div ref={sectionRef} data-section={8} className="scroll-mt-4 space-y-5">
      <div>
        <h2 className="font-display text-lg font-bold text-dark pb-3 border-b border-background-warm">Button Naming</h2>
        <p className="text-xs text-dark-muted mt-2">Rename the booking CTA button shown on trip detail pages and on the generated trip PDF.</p>
      </div>

      <div>
        <label htmlFor="btn-label-primary" className="block text-xs font-medium text-dark-muted mb-1">
          Booking button (seats available)
        </label>
        <input
          id="btn-label-primary"
          value={content.primaryCta}
          onChange={e => setContent(l => ({ ...l, primaryCta: e.target.value }))}
          className={inputClass}
          placeholder="e.g. Pack Your Bags"
        />
        <p className="text-xs text-dark-muted mt-1">
          Booking button text on the trip page and PDF while seats are open.
        </p>
      </div>

      <div>
        <label htmlFor="btn-label-waitlist" className="block text-xs font-medium text-dark-muted mb-1">
          Booking button (trip full)
        </label>
        <input
          id="btn-label-waitlist"
          value={content.waitlistCta}
          onChange={e => setContent(l => ({ ...l, waitlistCta: e.target.value }))}
          className={inputClass}
          placeholder="e.g. Join Waitlist"
        />
        <p className="text-xs text-dark-muted mt-1">
          Shown instead once the trip has no seats left.
        </p>
      </div>
    </div>
  );
}
