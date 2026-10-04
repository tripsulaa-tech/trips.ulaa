import { useEffect } from 'react';
import { useBranding } from '../../hooks/useBranding';

// Points the browser-tab icon at the admin-uploaded favicon (Admin → Branding).
// Only touches the public site's <link id="app-favicon"> from index.html —
// the admin panel's own admin.html has no such element, so it keeps its own
// icon. When the upload is removed, the original href/type/sizes are restored.
export default function BrandingFavicon() {
  const { custom } = useBranding();
  const favicon = custom.favicon;

  useEffect(() => {
    const link = document.getElementById('app-favicon') as HTMLLinkElement | null;
    if (!link) return;

    if (link.dataset.originalHref === undefined) {
      link.dataset.originalHref = link.getAttribute('href') ?? '';
      link.dataset.originalType = link.getAttribute('type') ?? '';
      link.dataset.originalSizes = link.getAttribute('sizes') ?? '';
    }

    if (favicon) {
      // The uploaded file may be PNG/SVG/ICO/WebP at any size, so drop the
      // hard-coded type/sizes hints and let the browser sniff it.
      link.removeAttribute('type');
      link.removeAttribute('sizes');
      link.setAttribute('href', favicon);
    } else {
      link.setAttribute('href', link.dataset.originalHref);
      if (link.dataset.originalType) link.setAttribute('type', link.dataset.originalType);
      if (link.dataset.originalSizes) link.setAttribute('sizes', link.dataset.originalSizes);
    }
  }, [favicon]);

  return null;
}
