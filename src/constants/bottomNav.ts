import { Calendar, GameController, Headphones, Heart, House, ImageSquare, type Icon } from '@phosphor-icons/react';

export interface BottomNavItem {
  /** Stable identifier: used as the React key and framer-motion layoutId anchor. */
  id: string;
  label: string;
  /** Route path, e.g. "/trips". */
  to: string;
  Icon: Icon;
}

// Names, routes and icons below are fixed in code (nothing is fetched from the database):
// to rename a tab or change its icon, edit it here and redeploy. Icons are imported directly,
// so only these few are bundled.
const HOME: BottomNavItem = { id: 'home', label: 'Home', to: '/', Icon: House };
const UPCOMING: BottomNavItem = { id: 'upcoming', label: 'Upcoming', to: '/trips', Icon: Calendar };
const JOURNEY: BottomNavItem = { id: 'journey', label: 'Journey', to: '/completed-trips', Icon: ImageSquare };
const GAMES: BottomNavItem = { id: 'games', label: 'Games', to: '/games', Icon: GameController };
const ABOUT: BottomNavItem = { id: 'about', label: 'About', to: '/about', Icon: Heart };
const CONTACT: BottomNavItem = { id: 'contact', label: 'Contact', to: '/contact', Icon: Headphones };

/** The mobile bottom bar (5 tabs, Home in the centre). Also read by the Upcoming / Journey pages for their
 *  "Showing N trips" label. */
export const BOTTOM_NAV_ITEMS: BottomNavItem[] = [UPCOMING, JOURNEY, HOME, ABOUT, CONTACT];

/** The footer's quick links: the bottom-bar tabs plus Games, so Games stays reachable on
 *  mobile even though it is not in the bottom bar. */
export const FOOTER_NAV_ITEMS: BottomNavItem[] = [HOME, UPCOMING, JOURNEY, GAMES, ABOUT, CONTACT];
