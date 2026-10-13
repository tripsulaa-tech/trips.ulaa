import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import NotFoundScene from '../components/ui/NotFoundScene';
import type { NotFoundAction } from '../components/ui/NotFoundScene';
import { usePageMeta } from '../hooks/usePageMeta';
import { pageTitle } from '../constants/site';

type Copy = {
  title: string;
  message: string;
  primary: NotFoundAction;
  secondary?: NotFoundAction;
};

// Most 404s on a travel site are old links: a trip that sold out or already
// ran, an album that moved, a game room whose code expired. Say so, and put
// the right next step first, instead of one generic line for everything.
function copyFor(pathname: string): Copy {
  if (pathname.startsWith('/admin')) {
    return {
      title: "That admin page doesn't exist",
      message: 'Check the address, or head back to the dashboard.',
      primary: { label: 'Back to dashboard', to: '/admin/dashboard' },
    };
  }
  if (pathname.startsWith('/completed-trips/')) {
    return {
      title: "We couldn't find that album",
      message: 'The link may be out of date. All our past trips live in one place.',
      primary: { label: 'See all past trips', to: '/completed-trips' },
      secondary: { label: 'See upcoming trips', to: '/trips' },
    };
  }
  if (pathname.startsWith('/trips/')) {
    return {
      title: "That trip isn't here anymore",
      message: "It may have sold out, already set off, or the link is slightly off. See what's open right now, or browse the adventures we've already done.",
      primary: { label: 'See upcoming trips', to: '/trips' },
      secondary: { label: 'Browse past trips', to: '/completed-trips' },
    };
  }
  if (pathname.startsWith('/play/')) {
    return {
      title: "That game room isn't open",
      message: 'Game codes stop working once the host closes the room. Ask your host for a fresh link, or start a game of your own.',
      primary: { label: 'Go to games', to: '/games' },
      secondary: { label: 'Back to home', to: '/' },
    };
  }
  return {
    title: "We couldn't find that page",
    message: "The link may be old or mistyped. Here's where you can go next.",
    primary: { label: 'See upcoming trips', to: '/trips' },
    secondary: { label: 'Back to home', to: '/' },
  };
}

/** Catch-all route. Public URLs get the normal site chrome; unknown /admin
 *  URLs get the same page on its own, since the public navbar and footer
 *  don't belong in the admin area. Marked noindex so a stale link never
 *  shows up in search results. */
export default function NotFoundPage() {
  const { pathname } = useLocation();
  const isAdmin = pathname.startsWith('/admin');

  // Canonical/og:url point at the home page rather than at the missing URL.
  usePageMeta({ title: pageTitle('Page not found'), path: '/' });

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  const copy = copyFor(pathname);
  const scene = <NotFoundScene title={copy.title} message={copy.message} primary={copy.primary} secondary={copy.secondary} showHelp={!isAdmin} />;

  if (isAdmin) return <main className="bg-background">{scene}</main>;
  return <Layout>{scene}</Layout>;
}
