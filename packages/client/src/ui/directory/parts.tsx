import { cn } from '@/lib/utils';
import { FilterIcon, LayoutGridIcon, ListIcon, Rows3Icon, SearchIcon } from 'lucide-react';
import type * as React from 'react';
import { t } from '../../i18n/index.ts';
import { Input } from '../kit/input.tsx';
import { Toggle } from '../kit/toggle.tsx';
import { ToggleGroup, ToggleGroupItem } from '../kit/toggle-group.tsx';
import { Pressable } from '../kit/pressable.tsx';

// The pieces every sidebar list is made of, the Compendium's too: the search
// field, the filter switch, the view modes, and an entry drawn as a row
// (picture, name, the line under it), a compact line, or a tile in a grid.

export type ViewMode = 'list' | 'compact' | 'grid';
export const VIEW_MODES: readonly ViewMode[] = ['list', 'compact', 'grid'];

const VIEW_ICON = { list: ListIcon, compact: Rows3Icon, grid: LayoutGridIcon } as const;

export function SearchField({
  value,
  onChange,
  label,
}: Readonly<{ value: string; onChange: (q: string) => void; label: string }>) {
  return (
    <div className="relative min-w-0 flex-1">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        className="lib-search pl-7"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={label}
        aria-label={label}
      />
    </div>
  );
}

/** Shows or hides the filters; the number of filters set while they are hidden. */
export function FilterToggle({
  pressed,
  onPressedChange,
  picked,
  className,
}: Readonly<{ pressed: boolean; onPressedChange: (on: boolean) => void; picked: number; className?: string }>) {
  return (
    <Toggle
      className={className}
      variant="plate"
      pressed={pressed}
      onPressedChange={onPressedChange}
      aria-label={t('list.filters')}
      title={t('list.filters')}
    >
      <FilterIcon />
      {picked > 0 && picked}
    </Toggle>
  );
}

export function ViewModes({
  value,
  onChange,
  modes = VIEW_MODES,
}: Readonly<{ value: ViewMode; onChange: (v: ViewMode) => void; modes?: readonly ViewMode[] }>) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as ViewMode)}
      aria-label={t('list.view')}
    >
      {modes.map((m) => {
        const Icon = VIEW_ICON[m];
        return (
          <ToggleGroupItem key={m} value={m} aria-label={t(`list.view.${m}`)} title={t(`list.view.${m}`)}>
            <Icon />
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}

/** What an entry looks like, however it is drawn. */
export interface EntryLook {
  /** Its picture, filling the frame it is given. */
  picture: React.ReactNode;
  name: string;
  sub?: string;
  /** Beside the name: a pack, "Hidden", "Game". */
  badge?: React.ReactNode;
  on?: boolean;
  /** Under the name in the list view: a hit point bar. */
  meter?: React.ReactNode;
}

/** The handlers and drag of an entry, passed to the element that gets the clicks. */
export type EntryEvents = Pick<
  React.HTMLAttributes<HTMLElement>,
  'onClick' | 'onDoubleClick' | 'onDragStart' | 'onKeyDown' | 'title'
> & { draggable?: boolean };

const FRAME = 'flex-none overflow-hidden rounded-[4px] border border-gold-dim/60 [&>*]:size-full';

/** A row: picture, name and the line under it; compact, a single short line. */
export function EntryRow({
  look,
  compact,
  events,
  children,
  ...li
}: Readonly<{
  look: EntryLook;
  compact?: boolean;
  events: EntryEvents;
  children?: React.ReactNode;
  ref?: React.Ref<HTMLLIElement>;
}> &
  Omit<React.LiHTMLAttributes<HTMLLIElement>, keyof EntryEvents | 'children'>) {
  const { draggable, onDragStart, ...clicks } = events;
  return (
    <li
      {...li}
      className={cn('lib-row lib-entry', look.on && 'on', li.className)}
      draggable={draggable}
      onDragStart={onDragStart}
    >
      <Pressable className={cn('lib-main', compact && 'gap-1.5 py-0.5')} {...clicks}>
        <span className={cn(FRAME, compact ? 'size-5' : 'size-8')}>{look.picture}</span>
        <span className="lib-text flex-1">
          <span className={cn('lib-name', compact && 'text-[13px]')}>{look.name}</span>
          {!compact && look.sub && <span className="lib-sub">{look.sub}</span>}
          {!compact && look.meter}
        </span>
        {look.badge}
      </Pressable>
      {children}
    </li>
  );
}

/** A tile in a grid of pictures, the name under it. */
export function EntryTile({
  look,
  events,
  ...li
}: Readonly<{ look: EntryLook; events: EntryEvents; ref?: React.Ref<HTMLLIElement> }> &
  Omit<React.LiHTMLAttributes<HTMLLIElement>, keyof EntryEvents | 'children'>) {
  const { draggable, onDragStart, title, ...clicks } = events;
  return (
    <li
      {...li}
      draggable={draggable}
      onDragStart={onDragStart}
      className={cn(draggable && 'cursor-grab', li.className)}
    >
      <Pressable
        className={cn(
          'flex w-full cursor-inherit flex-col items-center gap-1 rounded-[4px] border bg-transparent p-1 text-center hover:border-gold hover:bg-gold/10',
          look.on ? 'border-gold bg-gold/15' : 'border-transparent',
        )}
        title={title ?? [look.name, look.sub].filter(Boolean).join('\n')}
        aria-label={look.name}
        {...clicks}
      >
        <span className={cn(FRAME, 'aspect-square w-full')}>{look.picture}</span>
        <span className="line-clamp-2 w-full text-[11px] leading-tight text-foreground">{look.name}</span>
      </Pressable>
    </li>
  );
}

/** The grid tiles sit in. */
export function TileGrid({ children }: Readonly<{ children: React.ReactNode }>) {
  return <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(68px,1fr))] gap-1.5 p-0">{children}</ul>;
}
