// AUTO-GENERATED — do not hand-edit.
//
// A small, deliberately narrow set of icons that Rollup's build log
// flags as 'INEFFECTIVE_DYNAMIC_IMPORT' when they're in
// phosphorIconLoaders.generated.ts: each one is ALSO statically imported
// by a genuinely public-facing file (BottomNav, Footer, Navbar, TripCard,
// TripDetailPage, AboutPage, ContactPage, UpdateToast, InstallAppBanner —
// not admin-only editors), so it's already unavoidably part of the same
// bundle as tripHighlightIcons.ts. Referencing that existing binding here
// warning with zero bundle-size cost (verified by comparing chunk sizes
// before/after — main.js is unchanged).
//
// Deliberately NOT extended to every icon that happens to be statically
// imported ANYWHERE in the app: an earlier version of this file did that
// for the full set (~130 icons) and it leaked admin-only editor icons
// (ItineraryEditor, DataTableChrome, TermsEditor, Select, ...) into the
// public bundle, growing main.js by ~300KB. Only add a name here if you've
// confirmed (like the ones above) that a public-facing file already
// statically imports it too.
import {
  ArrowsClockwise,
  CaretDown,
  CaretUp,
  CheckCircle,
  DotsThreeVertical,
  Download,
  House,
  Info,
  List,
  Question,
  Share,
  Warning,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import type { Icon as PhosphorIconType } from '@phosphor-icons/react';

export const PHOSPHOR_ICONS_STATIC: Record<string, PhosphorIconType> = {
  ArrowsClockwise,
  CaretDown,
  CaretUp,
  CheckCircle,
  DotsThreeVertical,
  Download,
  House,
  Info,
  List,
  Question,
  Share,
  Warning,
  WarningCircle,
  X,
};
