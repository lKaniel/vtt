import { cn } from '@/lib/utils';
import type { Doc } from '@vtt/core';
import {
  ChevronRightIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  FolderUpIcon,
  PaletteIcon,
  PencilIcon,
  Trash2Icon,
} from 'lucide-react';
import { useState } from 'react';
import { t } from '../../i18n/index.ts';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '../kit/context-menu.tsx';
import { Input } from '../kit/input.tsx';
import type { ListContext } from './Directory.tsx';
import { Entries } from './DirectoryEntries.tsx';
import type { DirItem } from './Directory.tsx';
import type { FolderNode } from './directory-tree.ts';
import { carriesMove, moveOf, startMove } from './drag.ts';
import { type MenuEntry, MenuItems } from './menu.tsx';

// A folder in a list: a header with its colour, name and how much is in it
// (a click opens or closes it; drag it into another folder, or drop things
// on it), and under it the folders and entries it holds.

/** The colours a folder can take. */
const FOLDER_COLOURS = [
  '#8b2a2a',
  '#a2552a',
  '#a68a2c',
  '#4f7a2e',
  '#2e7a5e',
  '#2e6a85',
  '#34508f',
  '#6a3f91',
  '#8f3466',
  '#5b5550',
];

const str = (v: unknown) => (typeof v === 'string' ? v : '');

function folderMenu(folder: Doc, ctx: ListContext): MenuEntry[] {
  const { session, props, s } = ctx;
  const kind = props.folders!.kind;
  const color = str(folder.color);
  return [
    {
      label: t('list.folder.inside'),
      icon: FolderPlusIcon,
      run: () => s.setRenaming(session.folders.create(kind, t('list.folder.new'), folder.id)),
    },
    { label: t('list.folder.rename'), icon: PencilIcon, run: () => s.setRenaming(folder.id) },
    {
      label: t('list.folder.colour'),
      icon: PaletteIcon,
      items: [
        { label: t('list.folder.noColour'), checked: !color, run: () => session.folders.color(folder.id, undefined) },
        ...FOLDER_COLOURS.map((c, i) => ({
          label: `${t('list.folder.colour')} ${i + 1}`,
          swatch: c,
          checked: color === c,
          run: () => session.folders.color(folder.id, c),
        })),
      ],
    },
    ...(str(folder.parent)
      ? [
          {
            label: t('list.folder.toTop'),
            icon: FolderUpIcon,
            run: () => session.folders.move([ref(folder)], undefined),
          },
        ]
      : []),
    'separator',
    {
      label: t('list.folder.delete'),
      icon: Trash2Icon,
      danger: true,
      title: t('list.folder.deleteHint'),
      run: () => session.folders.remove(folder.id),
    },
  ];
}

const ref = (folder: Doc) => ({ coll: 'folders', id: folder.id });

function RenameField({ folder, ctx }: Readonly<{ folder: Doc; ctx: ListContext }>) {
  const [name, setName] = useState(str(folder.name));
  const done = (keep: boolean) => {
    if (keep && name.trim() && name.trim() !== folder.name) ctx.session.folders.rename(folder.id, name.trim());
    ctx.s.setRenaming(undefined);
  };
  return (
    <Input
      autoFocus
      className="h-6 py-0 text-sm"
      value={name}
      aria-label={t('list.folder.name')}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setName(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => done(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') done(true);
        if (e.key === 'Escape') done(false);
      }}
    />
  );
}

/** Drag a folder, and drop things into it. */
function useFolderDrop(folder: Doc, ctx: ListContext) {
  const [over, setOver] = useState(false);
  const { folders } = ctx.props;
  if (!folders?.editable) return { over: false, handlers: {} };
  return {
    over,
    handlers: {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        e.stopPropagation();
        startMove(e, { list: folders.kind, refs: [ref(folder)] });
      },
      onDragOver: (e: React.DragEvent) => {
        if (!carriesMove(e)) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: React.DragEvent) => {
        setOver(false);
        const refs = moveOf(e, folders.kind);
        if (!refs) return;
        e.preventDefault();
        e.stopPropagation();
        ctx.session.folders.move(refs, folder.id);
        ctx.s.expand(folder.id);
      },
    },
  };
}

function FolderHeader({
  node,
  ctx,
  open,
  ...trigger
}: Readonly<{ node: FolderNode<DirItem>; ctx: ListContext; open: boolean; ref?: React.Ref<HTMLDivElement> }> &
  React.HTMLAttributes<HTMLDivElement>) {
  const { folder } = node;
  const color = str(folder.color);
  const { over, handlers } = useFolderDrop(folder, ctx);
  const Icon = open ? FolderOpenIcon : FolderIcon;
  return (
    <div
      {...trigger}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      className={cn(
        'flex cursor-pointer items-center gap-1.5 rounded-[4px] border-l-[3px] px-1.5 py-1 font-display text-[13px] text-gold-bright select-none hover:bg-gold/10',
        over && 'bg-gold/20 outline outline-1 outline-gold',
      )}
      style={{ borderLeftColor: color || 'transparent', background: color && !over ? `${color}33` : undefined }}
      onClick={() => ctx.s.toggle(folder.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') ctx.s.toggle(folder.id);
      }}
      {...handlers}
    >
      <ChevronRightIcon className={cn('size-3.5 flex-none transition-transform', open && 'rotate-90')} />
      <Icon className="size-4 flex-none" style={{ color: color || undefined }} />
      {ctx.s.renaming === folder.id ? (
        <RenameField folder={folder} ctx={ctx} />
      ) : (
        <span className="min-w-0 flex-1 truncate">{str(folder.name) || folder.id}</span>
      )}
      <span className="ml-auto font-body text-xs text-muted-foreground">{node.count}</span>
    </div>
  );
}

export function FolderSection({
  node,
  ctx,
  depth,
}: Readonly<{ node: FolderNode<DirItem>; ctx: ListContext; depth: number }>) {
  const open = ctx.open(node.folder.id);
  const header = <FolderHeader node={node} ctx={ctx} open={open} />;
  return (
    <section aria-label={str(node.folder.name)} className="my-0.5">
      {ctx.props.folders?.editable ? (
        <ContextMenu>
          <ContextMenuTrigger asChild>{header}</ContextMenuTrigger>
          <ContextMenuContent aria-label={str(node.folder.name)}>
            <MenuItems entries={folderMenu(node.folder, ctx)} />
          </ContextMenuContent>
        </ContextMenu>
      ) : (
        header
      )}
      {open && (
        <div className="ml-2 border-l border-gold-dim/30 pl-1.5">
          {node.folders.map((inner) => (
            <FolderSection key={inner.folder.id} node={inner} ctx={ctx} depth={depth + 1} />
          ))}
          <Entries items={node.entries} ctx={ctx} />
        </div>
      )}
    </section>
  );
}
