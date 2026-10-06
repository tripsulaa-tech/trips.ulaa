import Button from '../components/ui/Button';

interface DraftConflictNoticeProps {
  /** What the draft is about, e.g. "the About page" or "this album". */
  subject: string;
  onRestore: () => void;
  onDiscard: () => void;
  className?: string;
}

/** Shown when a kept draft started from an older saved version than the one now in the
 *  database. The newer saved version is on screen; the draft waits here until the admin picks,
 *  so pressing Save can never overwrite newer data without that being a deliberate choice. */
export default function DraftConflictNotice({ subject, onRestore, onDiscard, className = '' }: DraftConflictNoticeProps) {
  return (
    <div role="alert" className={`rounded-lg border-2 border-amber-300 bg-amber-50 px-4 py-3 ${className}`}>
      <p className="text-sm text-dark">
        <strong>The saved version of {subject} changed</strong> after you started editing it, so your unsaved
        draft is on hold. You are looking at the newer saved version.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onRestore}>Restore my draft (replaces what's on screen)</Button>
        <Button variant="outline" size="sm" onClick={onDiscard}>Discard my draft</Button>
      </div>
    </div>
  );
}
