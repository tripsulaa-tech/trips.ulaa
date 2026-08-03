import type { ReactNode } from 'react';
import Navbar from './Navbar';
import Footer from './Footer';
import FloatingWhatsApp from './FloatingWhatsApp';
import ScrollToTopButton from './ScrollToTopButton';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div
      className="min-h-screen flex flex-col view-only-images"
      // Right-click "Save image as / Copy image / Search with Google Lens"
      // all come from the browser's own image context menu — blocking it
      // here (it bubbles up from any <img>) covers every image on the
      // public site in one place instead of touching every page/component
      // that renders one. Paired with the .view-only-images CSS in
      // globals.css, which stops drag-out saving and the mobile long-press
      // callout menu too.
      onContextMenu={e => {
        if ((e.target as HTMLElement).closest('img')) e.preventDefault();
      }}
    >
      <Navbar />
      <main className="flex-1">
        {children}
      </main>
      <Footer />
      <FloatingWhatsApp />
      <ScrollToTopButton />
    </div>
  );
}
