import { WarningCircle } from '@phosphor-icons/react';
import Button from './Button';

interface LoadErrorStateProps {
  /** What failed to load, in lower case: "trips", "the waitlist". */
  what: string;
  onRetry: () => void;
  className?: string;
}

/** Shown in place of a list when it couldn't be loaded, so a failed load is
 *  never mistaken for "there is no data". Pair it with a toast.error() where
 *  the failure is caught. */
export default function LoadErrorState({ what, onRetry, className = '' }: LoadErrorStateProps) {
  return (
    <div role="alert" className={`bg-white rounded-lg shadow-card p-8 text-center space-y-3 ${className}`}>
      <WarningCircle size={32} weight="duotone" className="mx-auto text-red-500" aria-hidden="true" />
      <p className="font-display text-xl text-dark">Couldn't load {what}.</p>
      <p className="text-sm text-dark-muted">Check your connection and try again.</p>
      <Button variant="primary" size="sm" onClick={onRetry}>Try again</Button>
    </div>
  );
}
