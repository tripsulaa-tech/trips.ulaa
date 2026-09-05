import type { BottomNavItemConfig } from '../types/types-index';

// Used until an admin saves custom tabs via the Home Page admin's "Bottom Nav
// Bar" tab (site_content
// key "bottom_nav"), and as the fallback if that fetch fails or returns
// nothing. Icon keys must match an entry in constants/tripHighlightIcons.ts.
export const DEFAULT_BOTTOM_NAV_ITEMS: BottomNavItemConfig[] = [
  { id: 'home', label: 'Home', to: '/', icon: 'home' },
  { id: 'upcoming', label: 'Upcoming', to: '/trips', icon: 'calendar' },
  { id: 'journey', label: 'Journey', to: '/completed-trips', icon: 'mountain-snow' },
  { id: 'about', label: 'About', to: '/about', icon: 'heart' },
  { id: 'contact', label: 'Contact', to: '/contact', icon: 'headphones' },
];
