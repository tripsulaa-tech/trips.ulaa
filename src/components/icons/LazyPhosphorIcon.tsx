import { useEffect, useState, type ComponentType } from 'react';
import type { Icon as PhosphorIconType, IconProps } from '@phosphor-icons/react';
import { PHOSPHOR_ICON_LOADERS } from './phosphorIconLoaders.generated';
import { PHOSPHOR_ICONS_STATIC } from './phosphorIconsStatic.generated';

// Shared across every LazyPhosphorIcon instance for the app's lifetime — once
// an icon has been fetched once (by any card, nav item, or the admin
// picker), every other place rendering the same icon reuses it instantly
// with no extra network request.
const resolvedCache = new Map<string, ComponentType<IconProps>>();

// One lazy wrapper component per icon name, reused across every call site
// that renders it — avoids creating a fresh component (and a fresh piece of
// loading state) each time the same icon is looked up.
const lazyIconCache = new Map<string, PhosphorIconType>();

/**
 * Resolves a Phosphor icon by name for the trip-highlight icon library.
 *
 * A narrow, explicit set of icons (see phosphorIconsStatic.generated.ts)
 * are already statically imported by a public-facing file, so that binding
 * is returned directly — nothing to lazy-load, no redundant fetch. Every
 * other icon falls back to createLazyPhosphorIcon, fetched on demand the
 * first time it actually renders.
 */
export function resolvePhosphorIcon(name: string): PhosphorIconType {
  const staticIcon = PHOSPHOR_ICONS_STATIC[name];
  if (staticIcon) return staticIcon;
  return createLazyPhosphorIcon(name);
}

/**
 * Wraps a single Phosphor icon (by name) in a component that fetches its
 * implementation — SVG path data for all 6 weight variants — on demand via
 * a per-icon dynamic import, instead of eagerly bundling the entire
 * ~1500-icon library. See phosphorIconLoaders.generated.ts: each icon name
 * maps to its own literal `import()`, so Vite/Rollup gives it its own tiny
 * chunk that's only fetched the first time this icon actually renders.
 *
 * Deliberately NOT built on React.lazy/Suspense: these icons render in many
 * places (trip cards, footer nav, bottom nav, the admin icon picker grid)
 * that aren't wrapped in a Suspense boundary today, and wiring one up
 * everywhere would be a much bigger change than this fix calls for.
 * Managing the loading state locally means every existing `<Icon ... />`
 * call site (TripCard, TripHighlightIconDisplay, BottomNav, Footer,
 * AboutPage, TripDetailPage, TripHighlightIconPicker) keeps working with no
 * changes at all.
 */
function createLazyPhosphorIcon(name: string): PhosphorIconType {
  const cached = lazyIconCache.get(name);
  if (cached) return cached;

  const loader = PHOSPHOR_ICON_LOADERS[name];

  const LazyIcon = (props: IconProps) => {
    const [Resolved, setResolved] = useState<ComponentType<IconProps> | null>(
      () => resolvedCache.get(name) ?? null
    );

    useEffect(() => {
      if (Resolved || !loader) return;
      let cancelled = false;
      loader()
        .then((Comp) => {
          resolvedCache.set(name, Comp);
          if (!cancelled) setResolved(() => Comp);
        })
        .catch((err) => {
          // Missing/renamed icon (e.g. stale key from an old library
          // version) — fail quietly rather than crashing the page; the
          // placeholder span below just stays empty.
          console.error(`[LazyPhosphorIcon] failed to load "${name}"`, err);
        });
      return () => {
        cancelled = true;
      };
    }, [Resolved]);

    if (!Resolved) {
      // Reserve the icon's footprint so surrounding layout doesn't shift
      // once the chunk arrives and the real glyph pops in.
      const size = props.size ?? '1em';
      return (
        <span
          aria-hidden
          className={props.className}
          style={{ display: 'inline-block', width: size, height: size }}
        />
      );
    }

    return <Resolved {...props} />;
  };

  LazyIcon.displayName = `LazyPhosphorIcon(${name})`;
  const result = LazyIcon as unknown as PhosphorIconType;
  lazyIconCache.set(name, result);
  return result;
}
