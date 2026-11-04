import {
  ArmchairIcon,
  BookOpenIcon,
  DicesIcon,
  ImageIcon,
  LibraryIcon,
  MapIcon,
  MusicIcon,
  ScrollTextIcon,
  SpadeIcon,
  SquareTerminalIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react';

/** The side panel has tabs, like a VTT sidebar: the log, journal and macros for everyone, and cards once some are shared; for the GM the scenes, Actors, Compendium, tables, music, assets and packs, and the seats; the Compendium for trusted players. */
export const TABS = [
  'Adventure log',
  'Journal',
  'Scenes',
  'Actors',
  'Compendium',
  'Tables',
  'Macros',
  'Cards',
  'Music',
  'Assets',
  'Players',
] as const;
export type Tab = (typeof TABS)[number];
export const PLAYER_TABS: readonly Tab[] = ['Adventure log', 'Journal', 'Macros'];

/** Each tab is an icon in one slim row; its name is the panel's title and the icon's tooltip. */
export const TAB_ICONS: Record<Tab, LucideIcon> = {
  'Adventure log': ScrollTextIcon,
  Journal: BookOpenIcon,
  Scenes: MapIcon,
  Actors: UsersIcon,
  Compendium: LibraryIcon,
  Tables: DicesIcon,
  Macros: SquareTerminalIcon,
  Cards: SpadeIcon,
  Music: MusicIcon,
  Assets: ImageIcon,
  Players: ArmchairIcon,
};
