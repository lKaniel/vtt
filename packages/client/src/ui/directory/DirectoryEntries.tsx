import type { Doc } from '@vtt/core';
import { FolderInputIcon } from 'lucide-react';
import { t } from '../../i18n/index.ts';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '../kit/context-menu.tsx';
import type { DirItem, ListContext } from './Directory.tsx';
import { startMove } from './drag.ts';
import { type MenuEntry, MenuItems } from './menu.tsx';
import { EntryRow, type EntryEvents, EntryTile, TileGrid } from './parts.tsx';

// The entries of one level of a list (the top, or a folder), drawn in the
// list's view, each with its right-click menu.

const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** The folders of the list, each indented under its parent, as move targets (`skip` and what is in it left out). */
function folderChoices(folders: readonly Doc[], run: (id: string | undefined) => void, skip?: string): MenuEntry[] {
  const out: MenuEntry[] = [{ label: t('list.top'), run: () => run(undefined) }];
  const ids = new Set(folders.map((f) => f.id));
  const seen = new Set<string>();
  const add = (f: Doc, depth: number) => {
    if (f.id === skip || seen.has(f.id)) return;
    seen.add(f.id);
    const swatch = str(f.color) || undefined;
    out.push({ label: `${'\u2003'.repeat(depth)}${str(f.name) || f.id}`, swatch, run: () => run(f.id) });
    for (const child of folders.filter((x) => str(x.parent) === f.id)) add(child, depth + 1);
  };
  for (const f of folders.filter((x) => !ids.has(str(x.parent)))) add(f, 0);
  return out;
}

/** An entry's menu, with Move to folder for the GM. */
function menuOf(item: DirItem, ctx: ListContext): MenuEntry[] {
  const { folders } = ctx.props;
  if (!folders?.editable || !item.ref || !ctx.folderDocs.length) return item.menu;
  const ref = item.ref;
  const move: MenuEntry = {
    label: t('list.moveTo'),
    icon: FolderInputIcon,
    items: folderChoices(ctx.folderDocs, (to) => ctx.session.folders.move([ref], to)),
  };
  return [...item.menu, 'separator', move];
}

function eventsOf(item: DirItem, ctx: ListContext): EntryEvents {
  const { folders } = ctx.props;
  const movable = !!folders?.editable && !!item.ref;
  return {
    draggable: !!item.drag || movable,
    onDragStart: (e) => {
      item.drag?.(e);
      if (movable) startMove(e, { list: folders.kind, refs: [item.ref!] });
    },
    onClick: item.open,
    onDoubleClick: item.openTwice,
    title: item.title,
  };
}

function WithMenu({
  item,
  ctx,
  children,
}: Readonly<{ item: DirItem; ctx: ListContext; children: React.ReactElement }>) {
  const menu = menuOf(item, ctx);
  if (!menu.length) return children;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent aria-label={item.name}>
        <MenuItems entries={menu} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function Entries({ items, ctx }: Readonly<{ items: readonly DirItem[]; ctx: ListContext }>) {
  if (!items.length) return null;
  const view = ctx.s.view;
  if (view === 'grid') {
    return (
      <TileGrid>
        {items.map((item) => (
          <WithMenu key={item.key} item={item} ctx={ctx}>
            <EntryTile look={{ ...item.look, name: item.name }} events={eventsOf(item, ctx)} />
          </WithMenu>
        ))}
      </TileGrid>
    );
  }
  return (
    <ul className="lib-list">
      {items.map((item) => (
        <WithMenu key={item.key} item={item} ctx={ctx}>
          <EntryRow
            look={{ ...item.look, name: item.name }}
            compact={view === 'compact'}
            events={eventsOf(item, ctx)}
          />
        </WithMenu>
      ))}
    </ul>
  );
}
