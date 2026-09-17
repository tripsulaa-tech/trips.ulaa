import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import Button from './Button';
import SectionTitle from './SectionTitle';

interface NotFoundStateProps {
  /** A phosphor icon element, e.g. `<Compass size={28} />`. */
  icon: ReactNode;
  /** Small eyebrow above the title, matching the app's other section headers. Defaults to '404'. */
  label?: string;
  title: string;
  message: string;
  actionLabel: string;
  actionTo: string;
  /** e.g. flagging scroll restoration before navigating back to a listing page. */
  onActionClick?: () => void;
}

// Full-page "not found" state (wrong/removed slug) — shares the same
// heading treatment, copy structure, and CTA button as the trips-listing
// pages' empty/no-results states, instead of a single bare line of text.
export default function NotFoundState({ icon, label = '404', title, message, actionLabel, actionTo, onActionClick }: NotFoundStateProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-4 py-20">
      <span
        className="w-16 h-16 rounded-full bg-background-warm flex items-center justify-center text-primary mb-5"
        aria-hidden="true"
      >
        {icon}
      </span>
      <SectionTitle variant="plain" align="center" size="xl" label={label} title={title} subtitle={message} />
      <Link to={actionTo} onClick={onActionClick} className="mt-7">
        <Button variant="primary">{actionLabel}</Button>
      </Link>
    </div>
  );
}
