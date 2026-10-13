import NotFoundScene from './NotFoundScene';

interface NotFoundStateProps {
  /** Script line above the title. Defaults to "Off the map". */
  label?: string;
  title: string;
  message: string;
  actionLabel: string;
  actionTo: string;
  /** e.g. flagging scroll restoration before navigating back to a listing page. */
  onActionClick?: () => void;
}

// "Not found" for a page that exists but whose record doesn't (wrong or
// removed trip/album slug). Shares NotFoundScene with the catch-all 404 page,
// so both look the same; callers only supply the specific wording and where
// the main button goes.
export default function NotFoundState({ label, title, message, actionLabel, actionTo, onActionClick }: NotFoundStateProps) {
  return (
    <NotFoundScene
      label={label}
      title={title}
      message={message}
      primary={{ label: actionLabel, to: actionTo, onClick: onActionClick }}
    />
  );
}
